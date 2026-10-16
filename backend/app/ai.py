"""Rutas de Kestrel IA: transcripción en vivo, subtítulos .srt, resumen/capítulos/clips,
pregunta destacada del chat y recorte de clips verticales con ffmpeg (en la laptop)."""
import json
import re
import shutil
import subprocess
import threading
from datetime import datetime, timezone

from flask import Blueprint, Response, current_app, jsonify, request

from . import ai_service
from .ai_service import AiError
from .extensions import db
from .models import AiReport, Broadcast, TranscriptSegment
from .recordings import FILE_RE, files_for, recordings_dir
from .security import login_required

bp = Blueprint("ai", __name__, url_prefix="/api")

MAX_SEGMENTS_PER_POST = 50
MAX_SEGMENTS_TOTAL = 20_000
MAX_T_MS = 24 * 3600 * 1000
MAX_HIGHLIGHT_COMMENTS = 100
CLIP_MIN_S, CLIP_MAX_S = 5, 180
_clip_slots = threading.BoundedSemaphore(2)  # máximo 2 recortes a la vez para no ahogar la laptop


def _owned(user, broadcast_id):
    return Broadcast.query.filter_by(id=broadcast_id, user_id=user.id).first_or_404()


def _clean(text, limit):
    return " ".join(str(text or "").split())[:limit]


def _duration(b):
    if b.started_at and b.ended_at:
        return max(0, int((b.ended_at - b.started_at).total_seconds()))
    return 0


# --- Transcripción en vivo ------------------------------------------------------

@bp.post("/broadcasts/<int:broadcast_id>/transcript")
@login_required
def add_transcript(user, broadcast_id):
    b = _owned(user, broadcast_id)
    if b.status not in {"live", "recording"}:
        return jsonify(error="La transcripción se guarda solo mientras transmites o grabas."), 409
    segments = (request.get_json(silent=True) or {}).get("segments")
    if not isinstance(segments, list) or not 1 <= len(segments) <= MAX_SEGMENTS_PER_POST:
        return jsonify(error="Datos no válidos."), 400
    rows = []
    for s in segments:
        if not isinstance(s, dict):
            return jsonify(error="Datos no válidos."), 400
        t_ms, speaker, text = s.get("t_ms"), _clean(s.get("speaker"), 80), _clean(s.get("text"), 500)
        if not isinstance(t_ms, int) or isinstance(t_ms, bool) or not 0 <= t_ms <= MAX_T_MS or not speaker or not text:
            return jsonify(error="Datos no válidos."), 400
        rows.append(TranscriptSegment(broadcast_id=b.id, t_ms=t_ms, speaker=speaker, text=text))
    if TranscriptSegment.query.filter_by(broadcast_id=b.id).count() + len(rows) > MAX_SEGMENTS_TOTAL:
        return jsonify(error="La transcripción llegó a su límite."), 409
    db.session.add_all(rows)
    db.session.commit()
    return jsonify(saved=len(rows)), 201


def _segments(b):
    return TranscriptSegment.query.filter_by(broadcast_id=b.id).order_by(TranscriptSegment.t_ms, TranscriptSegment.id).all()


@bp.get("/recordings/<int:broadcast_id>/transcript")
@login_required
def get_transcript(user, broadcast_id):
    b = _owned(user, broadcast_id)
    return jsonify(items=[s.to_dict() for s in _segments(b)])


def _srt_time(ms):
    h, rem = divmod(max(0, ms), 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(segments) -> str:
    """Cada frase dura hasta que empieza la siguiente (máximo 6 s, mínimo 1 s)."""
    blocks = []
    for i, s in enumerate(segments):
        nxt = segments[i + 1].t_ms if i + 1 < len(segments) else s.t_ms + 4000
        end = min(max(nxt, s.t_ms + 1000), s.t_ms + 6000)
        blocks.append(f"{i + 1}\n{_srt_time(s.t_ms)} --> {_srt_time(end)}\n{s.speaker}: {s.text}\n")
    return "\n".join(blocks)


@bp.get("/recordings/<int:broadcast_id>/subtitles.srt")
@login_required
def subtitles(user, broadcast_id):
    b = _owned(user, broadcast_id)
    return Response(build_srt(_segments(b)), mimetype="application/x-subrip",
                    headers={"Content-Disposition": f'attachment; filename="{b.room_name}.srt"'})


# --- Resumen, capítulos y clips sugeridos -------------------------------------

@bp.get("/recordings/<int:broadcast_id>/ai")
@login_required
def get_report(user, broadcast_id):
    b = _owned(user, broadcast_id)
    row = db.session.get(AiReport, b.id)
    segments = TranscriptSegment.query.filter_by(broadcast_id=b.id).count()
    report = json.loads(row.data) if row else None
    return jsonify(report=report, segments=segments,
                   created_at=row.created_at.isoformat() if row else None)


@bp.post("/recordings/<int:broadcast_id>/ai")
@login_required
def create_report(user, broadcast_id):
    b = _owned(user, broadcast_id)
    if b.status != "ended":
        return jsonify(error="El resumen se genera cuando termina la transmisión."), 409
    segments = _segments(b)
    if len(segments) < 3:
        return jsonify(error="No hay suficiente transcripción. Activa los subtítulos en vivo la próxima vez."), 409
    try:
        report = ai_service.generate_report(b.title, _duration(b) or segments[-1].t_ms // 1000 + 5, segments)
    except AiError as e:
        return jsonify(error=str(e)), 502
    row = db.session.get(AiReport, b.id) or AiReport(broadcast_id=b.id)
    row.data = json.dumps(report, ensure_ascii=False)
    row.created_at = datetime.now(timezone.utc)
    db.session.add(row)
    db.session.commit()
    return jsonify(report=report, segments=len(segments), created_at=row.created_at.isoformat())


# --- Pregunta destacada del chat -------------------------------------------------

@bp.post("/broadcasts/<int:broadcast_id>/comments/highlight")
@login_required
def highlight(user, broadcast_id):
    _owned(user, broadcast_id)
    raw = (request.get_json(silent=True) or {}).get("comments")
    if not isinstance(raw, list) or not raw:
        return jsonify(error="Todavía no hay comentarios."), 400
    comments = []
    for c in raw[-MAX_HIGHLIGHT_COMMENTS:]:
        if not isinstance(c, dict):
            continue
        cid, text = str(c.get("id", ""))[:120], _clean(c.get("text"), 500)
        if re.fullmatch(r"(youtube|facebook):[\w.:-]{1,110}", cid) and text:
            comments.append({"id": cid, "author": _clean(c.get("author"), 80) or "Alguien", "text": text})
    if not comments:
        return jsonify(error="Todavía no hay comentarios."), 400
    try:
        return jsonify(ai_service.pick_question(comments))
    except AiError as e:
        return jsonify(error=str(e)), 502


# --- Clips verticales (ffmpeg) -------------------------------------------------

def clip_name(room_name, start, end):
    return f"{room_name}-clip-{start}-{end}.mp4"


def _clips(b):
    folder = recordings_dir()
    if not folder.is_dir():
        return []
    out = []
    for p in sorted(folder.glob(f"{b.room_name}-clip-*.mp4*")):
        done = p.suffix == ".mp4"
        name = p.name if done else p.name.removesuffix(".part")
        if FILE_RE.match(name):
            out.append({"name": name, "size": p.stat().st_size if done else 0, "ready": done})
    return out


def _run_ffmpeg(source, target, start, length, app):
    part = target.with_name(target.name + ".part")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-i", str(source), "-t", str(length),
        # Vertical 9:16: recorta el centro del video 16:9 y lo lleva a 1080x1920.
        "-vf", "crop=ih*9/16:ih,scale=1080:1920", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-f", "mp4", str(part),
    ]
    with _clip_slots:
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=900)  # noqa: S603 - lista fija, sin shell
            part.replace(target)
        except (subprocess.SubprocessError, OSError):
            app.logger.exception("No se pudo recortar el clip %s", target.name)
            part.unlink(missing_ok=True)


@bp.get("/recordings/<int:broadcast_id>/clips")
@login_required
def list_clips(user, broadcast_id):
    b = _owned(user, broadcast_id)
    return jsonify(items=_clips(b), ffmpeg=bool(shutil.which("ffmpeg")))


@bp.post("/recordings/<int:broadcast_id>/clips")
@login_required
def make_clip(user, broadcast_id):
    b = _owned(user, broadcast_id)
    data = request.get_json(silent=True) or {}
    start, end = data.get("start"), data.get("end")
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in (start, end)) \
            or start < 0 or not CLIP_MIN_S <= end - start <= CLIP_MAX_S:
        return jsonify(error=f"Un clip dura de {CLIP_MIN_S} a {CLIP_MAX_S} segundos."), 400
    if not shutil.which("ffmpeg"):
        return jsonify(error="Para crear clips instala ffmpeg en tu laptop (winget install ffmpeg)."), 409
    files = files_for(b)
    if not files:
        return jsonify(error="No hay video de esta transmisión."), 409
    source = recordings_dir() / files[-1]["name"]
    target = recordings_dir() / clip_name(b.room_name, start, end)
    if target.exists() or target.with_name(target.name + ".part").exists():
        return jsonify(name=target.name), 200
    target.with_name(target.name + ".part").touch()
    app = current_app._get_current_object()
    threading.Thread(target=_run_ffmpeg, args=(source, target, start, end - start, app), daemon=True).start()
    return jsonify(name=target.name), 202
