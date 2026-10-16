"""Destinos RTMP (las claves de transmisión se guardan cifradas)."""
from urllib.parse import urlparse

from flask import Blueprint, jsonify, request

from .extensions import db
from .models import Destination
from .security import encrypt, login_required

bp = Blueprint("destinations", __name__, url_prefix="/api/destinations")

# Servidores RTMP de referencia; el usuario puede cambiarlos.
DEFAULT_RTMP = {
    "youtube": "rtmp://a.rtmp.youtube.com/live2",
    "facebook": "rtmps://live-api-s.facebook.com:443/rtmp",
    "linkedin": "",
    "instagram": "",
    "tiktok": "",
    "rtmp": "",
}


def _validate(data, partial=False):
    errors = {}
    out = {}
    if not partial or "name" in data:
        name = str(data.get("name", "")).strip()
        if not 1 <= len(name) <= 80:
            errors["name"] = "El nombre es obligatorio (máx. 80 caracteres)."
        out["name"] = name
    if not partial or "platform" in data:
        platform = str(data.get("platform", "")).strip().lower()
        if platform not in Destination.PLATFORMS:
            errors["platform"] = "Plataforma no válida."
        out["platform"] = platform
    if not partial or "rtmp_url" in data:
        rtmp_url = str(data.get("rtmp_url", "") or DEFAULT_RTMP.get(out.get("platform", ""), "")).strip()
        parsed = urlparse(rtmp_url)
        if parsed.scheme not in {"rtmp", "rtmps"} or not parsed.netloc or len(rtmp_url) > 300:
            errors["rtmp_url"] = "La URL debe empezar con rtmp:// o rtmps://"
        out["rtmp_url"] = rtmp_url
    if not partial or "stream_key" in data:
        key = str(data.get("stream_key", "")).strip()
        if not 4 <= len(key) <= 300 or any(c.isspace() for c in key):
            errors["stream_key"] = "Clave de transmisión no válida."
        out["stream_key"] = key
    if "enabled" in data:
        out["enabled"] = bool(data.get("enabled"))
    return out, errors


@bp.get("")
@login_required
def list_destinations(user):
    items = Destination.query.filter_by(user_id=user.id).order_by(Destination.id).all()
    return jsonify(items=[d.to_dict() for d in items])


@bp.post("")
@login_required
def create_destination(user):
    data, errors = _validate(request.get_json(silent=True) or {})
    if errors:
        return jsonify(error="Revisa los datos.", fields=errors), 400
    dest = Destination(
        user_id=user.id,
        name=data["name"],
        platform=data["platform"],
        rtmp_url=data["rtmp_url"],
        stream_key_encrypted=encrypt(data["stream_key"]),
        enabled=data.get("enabled", True),
    )
    db.session.add(dest)
    db.session.commit()
    return jsonify(item=dest.to_dict()), 201


@bp.patch("/<int:dest_id>")
@login_required
def update_destination(user, dest_id):
    dest = Destination.query.filter_by(id=dest_id, user_id=user.id).first_or_404()
    data, errors = _validate(request.get_json(silent=True) or {}, partial=True)
    if errors:
        return jsonify(error="Revisa los datos.", fields=errors), 400
    for field in ("name", "platform", "rtmp_url", "enabled"):
        if field in data:
            setattr(dest, field, data[field])
    if "stream_key" in data:
        dest.stream_key_encrypted = encrypt(data["stream_key"])
    db.session.commit()
    return jsonify(item=dest.to_dict())


@bp.delete("/<int:dest_id>")
@login_required
def delete_destination(user, dest_id):
    dest = Destination.query.filter_by(id=dest_id, user_id=user.id).first_or_404()
    db.session.delete(dest)
    db.session.commit()
    return jsonify(ok=True)
