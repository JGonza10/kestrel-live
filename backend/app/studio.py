"""Marca del estudio por usuario: banners, estilo y teleprompter (antes solo en el navegador)."""
import json
import re

from flask import Blueprint, jsonify, request

from .extensions import db
from .models import StudioLook
from .security import login_required

bp = Blueprint("studio", __name__, url_prefix="/api/studio")

THEMES = ("bubble", "classic", "minimal", "block")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
BANNER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,24}$")
MAX_BANNERS = 30
BANNER_MAX = 120
PROMPTER_MAX = 5000
DEFAULT_LOOK = {
    "banners": [],
    "style": {"theme": "bubble", "color": "#a85a22", "showNames": True, "showLogo": True},
    "prompter": "",
    "ai": {"captions": False, "moderation": True},
}


def clean_look(data):
    """Valida la marca. Regresa (look_limpio, errores)."""
    if not isinstance(data, dict):
        return None, {"look": "Formato no válido."}
    errors = {}

    banners = data.get("banners", [])
    clean_banners = []
    if not isinstance(banners, list) or len(banners) > MAX_BANNERS:
        errors["banners"] = f"Máximo {MAX_BANNERS} banners."
    else:
        seen = set()
        for b in banners:
            text = " ".join(str(b.get("text", "")).split()) if isinstance(b, dict) else ""
            bid = b.get("id") if isinstance(b, dict) else None
            if not isinstance(bid, str) or not BANNER_ID_RE.match(bid) or bid in seen \
                    or not 1 <= len(text) <= BANNER_MAX:
                errors["banners"] = f"Cada banner lleva de 1 a {BANNER_MAX} caracteres."
                break
            seen.add(bid)
            clean_banners.append({"id": bid, "text": text})

    style = data.get("style", {})
    if not isinstance(style, dict):
        style = {}
    theme = style.get("theme", "bubble")
    color = style.get("color", "#a85a22")
    if theme not in THEMES:
        errors["style"] = "Tema no válido."
    if not isinstance(color, str) or not COLOR_RE.match(color):
        errors["style"] = "Color no válido."
    clean_style = {
        "theme": theme,
        "color": color,
        "showNames": style.get("showNames", True) is not False,
        "showLogo": style.get("showLogo", True) is not False,
    }

    prompter = data.get("prompter", "")
    if not isinstance(prompter, str) or len(prompter) > PROMPTER_MAX:
        errors["prompter"] = f"El guion admite hasta {PROMPTER_MAX} caracteres."

    ai = data.get("ai", {})
    if not isinstance(ai, dict):
        ai = {}
    clean_ai = {"captions": ai.get("captions") is True, "moderation": ai.get("moderation", True) is not False}

    if errors:
        return None, errors
    return {"banners": clean_banners, "style": clean_style, "prompter": prompter, "ai": clean_ai}, {}


@bp.get("/look")
@login_required
def get_look(user):
    row = db.session.get(StudioLook, user.id)
    look = DEFAULT_LOOK
    if row is not None:
        try:
            look, _ = clean_look(json.loads(row.data))
        except ValueError:
            look = None
    return jsonify(look=look or DEFAULT_LOOK)


@bp.put("/look")
@login_required
def save_look(user):
    look, errors = clean_look(request.get_json(silent=True))
    if errors:
        return jsonify(error="Revisa los datos.", fields=errors), 400
    row = db.session.get(StudioLook, user.id)
    if row is None:
        row = StudioLook(user_id=user.id)
        db.session.add(row)
    row.data = json.dumps(look, ensure_ascii=False)
    db.session.commit()
    return jsonify(look=look)
