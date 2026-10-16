"""Comentarios en vivo de YouTube y Facebook para mostrarlos en el estudio.

Las llaves viven en .env (YOUTUBE_API_KEY, FACEBOOK_PAGE_TOKEN), nunca en la base ni en el navegador.
El estudio pregunta cada pocos segundos por comentarios nuevos; el servidor recuerda
hasta dónde leyó (pageToken de YouTube, fecha del último de Facebook).
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request

from .extensions import db
from .models import Broadcast, CommentSource
from .security import login_required

bp = Blueprint("comments", __name__, url_prefix="/api/broadcasts")

YT_API = "https://www.googleapis.com/youtube/v3"
FB_API = "https://graph.facebook.com/v21.0"
YT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
FB_ID_RE = re.compile(r"^[0-9]{5,32}$")
TEXT_MAX = 500
AUTHOR_MAX = 80
MIN_POLL_MS = 5000
HTTP_TIMEOUT = 8


class SourceError(Exception):
    """Falla al leer una plataforma; el mensaje sí se puede mostrar al usuario."""


def _http_get_json(url: str, params: dict) -> dict:
    """GET con timeout. Separado para poder simularlo en las pruebas."""
    full = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(full, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:  # noqa: S310 - URL fija https
        return json.loads(resp.read().decode("utf-8"))


def parse_youtube_id(raw: str) -> str | None:
    """Acepta el id o un link: youtube.com/watch?v=, youtu.be/, /live/, /shorts/."""
    raw = (raw or "").strip()
    if YT_ID_RE.match(raw):
        return raw
    try:
        u = urllib.parse.urlparse(raw if "://" in raw else f"https://{raw}")
    except ValueError:
        return None
    host = (u.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    candidate = None
    if host == "youtu.be":
        candidate = u.path.strip("/").split("/")[0]
    elif host in {"youtube.com", "studio.youtube.com"}:
        q = urllib.parse.parse_qs(u.query)
        if "v" in q:
            candidate = q["v"][0]
        else:
            parts = [p for p in u.path.split("/") if p]
            if len(parts) >= 2 and parts[0] in {"live", "shorts", "embed", "video"}:
                candidate = parts[1]
    return candidate if candidate and YT_ID_RE.match(candidate) else None


def parse_facebook_id(raw: str) -> str | None:
    """Acepta el id numérico del video en vivo o un link que lo contenga (/videos/123…)."""
    raw = (raw or "").strip()
    if FB_ID_RE.match(raw):
        return raw
    m = re.search(r"/videos/(?:[^/]+/)?([0-9]{5,32})", raw)
    return m.group(1) if m else None


# --- Moderación (reglas locales: gratis, instantánea y sin mandar el chat a nadie) ---
BLOCKED_WORDS = {
    # insultos comunes (es/en); se comparan sin acentos y en minúsculas
    "pendejo", "pendeja", "idiota", "imbecil", "estupido", "estupida", "puto", "puta", "cabron",
    "culero", "culera", "verga", "mierda", "chinga", "chingada", "naco", "joto", "zorra", "baboso",
    "fuck", "fucking", "shit", "bitch", "asshole", "idiot", "stupid", "retard", "whore",
}
SPAM_PATTERNS = [
    re.compile(r"(https?://|www\.|\b[\w-]+\.(com|net|org|xyz|ly|io|me|link|click)\b)", re.I),  # links
    re.compile(r"(.)\1{7,}"),                                       # aaaaaaaaa
    re.compile(r"\b(gana|ganar|gratis|free|crypto|cripto|bitcoin|forex|inversi[oó]n)\b.*\b(dm|whats|telegram|link)\b", re.I),
]


def _plain(text: str) -> str:
    table = str.maketrans("áéíóúüñ", "aeiouun")
    return text.lower().translate(table)


def moderate(text: str) -> str | None:
    """Regresa el motivo si el comentario debe ocultarse ('insulto' o 'spam'), o None."""
    words = set(re.findall(r"[a-zñ]+", _plain(text)))
    if words & BLOCKED_WORDS:
        return "insulto"
    if any(p.search(text) for p in SPAM_PATTERNS):
        return "spam"
    letters = [c for c in text if c.isalpha()]
    if len(letters) >= 15 and sum(c.isupper() for c in letters) / len(letters) > 0.8:
        return "spam"  # todo en MAYÚSCULAS
    return None


def _clean(text, limit):
    return " ".join(str(text or "").split())[:limit]


def _comment(platform, cid, author, text, at):
    return {
        "id": f"{platform}:{cid}",
        "platform": platform,
        "author": _clean(author, AUTHOR_MAX) or "Alguien",
        "text": _clean(text, TEXT_MAX),
        "at": at,
    }


def _fetch_youtube(src: CommentSource):
    key = current_app.config.get("YOUTUBE_API_KEY")
    if not key:
        raise SourceError("Falta YOUTUBE_API_KEY en el archivo .env.")
    if not src.youtube_chat_id:
        data = _http_get_json(f"{YT_API}/videos", {"part": "liveStreamingDetails", "id": src.youtube_video_id, "key": key})
        items = data.get("items") or []
        chat_id = items[0].get("liveStreamingDetails", {}).get("activeLiveChatId") if items else None
        if not chat_id:
            raise SourceError("Ese video de YouTube no tiene un chat en vivo activo.")
        src.youtube_chat_id = str(chat_id)[:128]

    params = {"liveChatId": src.youtube_chat_id, "part": "snippet,authorDetails", "maxResults": 200, "key": key}
    if src.youtube_page_token:
        params["pageToken"] = src.youtube_page_token
    data = _http_get_json(f"{YT_API}/liveChat/messages", params)
    src.youtube_page_token = (data.get("nextPageToken") or "")[:256] or None
    out = []
    for m in data.get("items") or []:
        sn = m.get("snippet") or {}
        if sn.get("type") not in (None, "textMessageEvent", "superChatEvent"):
            continue
        text = sn.get("displayMessage") or (sn.get("textMessageDetails") or {}).get("messageText")
        if not text:
            continue
        out.append(_comment("youtube", m.get("id", ""), (m.get("authorDetails") or {}).get("displayName"),
                            text, sn.get("publishedAt")))
    return out, max(int(data.get("pollingIntervalMillis") or 0), MIN_POLL_MS)


def _fetch_facebook(src: CommentSource):
    token = current_app.config.get("FACEBOOK_PAGE_TOKEN")
    if not token:
        raise SourceError("Falta FACEBOOK_PAGE_TOKEN en el archivo .env.")
    params = {
        "fields": "id,from{name},message,created_time",
        "order": "chronological",
        "filter": "stream",
        "limit": 100,
        "access_token": token,
    }
    if src.facebook_since:
        params["since"] = src.facebook_since
    data = _http_get_json(f"{FB_API}/{src.facebook_video_id}/comments", params)
    out = []
    newest = src.facebook_since or 0
    for c in data.get("data") or []:
        if not c.get("message"):
            continue
        created = c.get("created_time")
        try:
            ts = int(datetime.strptime(created, "%Y-%m-%dT%H:%M:%S%z").timestamp())
            newest = max(newest, ts)
        except (TypeError, ValueError):
            pass
        out.append(_comment("facebook", c.get("id", ""), (c.get("from") or {}).get("name"), c["message"], created))
    src.facebook_since = newest or None
    return out, MIN_POLL_MS


def _owned(user, broadcast_id):
    return Broadcast.query.filter_by(id=broadcast_id, user_id=user.id).first_or_404()


@bp.get("/<int:broadcast_id>/comments/sources")
@login_required
def get_sources(user, broadcast_id):
    _owned(user, broadcast_id)
    src = db.session.get(CommentSource, broadcast_id)
    return jsonify(sources=src.to_dict() if src else {"youtube": "", "facebook": ""})


@bp.put("/<int:broadcast_id>/comments/sources")
@login_required
def set_sources(user, broadcast_id):
    b = _owned(user, broadcast_id)
    data = request.get_json(silent=True) or {}
    yt_raw = str(data.get("youtube", "") or "")[:300]
    fb_raw = str(data.get("facebook", "") or "")[:300]
    errors = {}
    yt = parse_youtube_id(yt_raw) if yt_raw.strip() else None
    fb = parse_facebook_id(fb_raw) if fb_raw.strip() else None
    if yt_raw.strip() and not yt:
        errors["youtube"] = "Pega el link del video en vivo de YouTube."
    if fb_raw.strip() and not fb:
        errors["facebook"] = "Pega el id numérico o el link del video en vivo de Facebook."
    if errors:
        return jsonify(error="Revisa los datos.", fields=errors), 400

    src = db.session.get(CommentSource, b.id) or CommentSource(broadcast_id=b.id)
    if src.youtube_video_id != yt:
        src.youtube_video_id, src.youtube_chat_id, src.youtube_page_token = yt, None, None
    if src.facebook_video_id != fb:
        src.facebook_video_id, src.facebook_since = fb, None
    db.session.add(src)
    db.session.commit()
    return jsonify(sources=src.to_dict())


@bp.get("/<int:broadcast_id>/comments")
@login_required
def poll_comments(user, broadcast_id):
    """Comentarios nuevos desde la última consulta, y en cuánto tiempo volver a preguntar."""
    _owned(user, broadcast_id)
    src = db.session.get(CommentSource, broadcast_id)
    if src is None or not (src.youtube_video_id or src.facebook_video_id):
        return jsonify(items=[], errors={}, poll_ms=0, filtered=0)

    items, errors, waits = [], {}, [MIN_POLL_MS]
    for platform, enabled, fetch in (
        ("youtube", src.youtube_video_id, _fetch_youtube),
        ("facebook", src.facebook_video_id, _fetch_facebook),
    ):
        if not enabled:
            continue
        try:
            got, wait = fetch(src)
            items += got
            waits.append(wait)
        except SourceError as e:
            errors[platform] = str(e)
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError, AttributeError):
            current_app.logger.exception("No se pudieron leer comentarios de %s", platform)
            errors[platform] = f"No se pudieron leer los comentarios de {platform.capitalize()}. Reintentando…"
    db.session.commit()
    filtered = 0
    if request.args.get("moderate") == "1":
        kept = [c for c in items if not moderate(c["text"])]
        filtered, items = len(items) - len(kept), kept
    return jsonify(items=items, errors=errors, poll_ms=max(waits), filtered=filtered)
