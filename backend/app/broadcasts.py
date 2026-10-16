"""Transmisiones / grabaciones: crear, entrar al estudio, salir en vivo y terminar."""
import secrets
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request

from . import livekit_service
from .extensions import db
from .guests import revoke_links
from .models import Broadcast, Destination
from .security import decrypt, login_required

bp = Blueprint("broadcasts", __name__, url_prefix="/api/broadcasts")


def _get_owned(user, broadcast_id):
    return Broadcast.query.filter_by(id=broadcast_id, user_id=user.id).first_or_404()


@bp.get("")
@login_required
def list_broadcasts(user):
    status = request.args.get("status", "active")
    q = Broadcast.query.filter_by(user_id=user.id)
    if status == "ended":
        q = q.filter(Broadcast.status == "ended")
    else:
        q = q.filter(Broadcast.status != "ended")
    items = q.order_by(Broadcast.created_at.desc()).all()
    return jsonify(items=[b.to_dict() for b in items])


@bp.post("")
@login_required
def create_broadcast(user):
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()
    kind = str(data.get("kind", "live")).strip()
    if not 1 <= len(title) <= 120:
        return jsonify(error="El título es obligatorio (máx. 120 caracteres)."), 400
    if kind not in Broadcast.KINDS:
        return jsonify(error="Tipo no válido."), 400
    b = Broadcast(user_id=user.id, title=title, kind=kind, room_name=f"kl-{secrets.token_hex(8)}")
    db.session.add(b)
    db.session.commit()
    return jsonify(item=b.to_dict()), 201


@bp.get("/<int:broadcast_id>")
@login_required
def get_broadcast(user, broadcast_id):
    return jsonify(item=_get_owned(user, broadcast_id).to_dict())


@bp.post("/<int:broadcast_id>/token")
@login_required
def join_token(user, broadcast_id):
    b = _get_owned(user, broadcast_id)
    token = livekit_service.make_join_token(b.room_name, f"host-{user.id}", user.display_name)
    return jsonify(token=token, ws_url=current_app.config["LIVEKIT_WS_URL"],
                   studio_output=bool(current_app.config.get("EGRESS_TEMPLATE_URL")))


@bp.post("/<int:broadcast_id>/start")
@login_required
def start(user, broadcast_id):
    b = _get_owned(user, broadcast_id)
    if b.status in {"live", "recording"}:
        return jsonify(error="Ya está en curso."), 409
    data = request.get_json(silent=True) or {}
    layout = data.get("layout", "speaker")
    if layout not in {"speaker", "grid", "single-speaker"}:
        layout = "speaker"

    try:
        if b.kind == "recording":
            filepath = f"/out/{b.room_name}-{{time}}.mp4"
            b.egress_id = livekit_service.start_recording(b.room_name, filepath, layout)
            b.status = "recording"
        else:
            ids = [int(i) for i in data.get("destination_ids", []) if str(i).isdigit()]
            dests = Destination.query.filter(
                Destination.user_id == user.id, Destination.id.in_(ids), Destination.enabled.is_(True)
            ).all()
            if not dests:
                return jsonify(error="Elige al menos un destino activo."), 400
            urls = [f"{d.rtmp_url.rstrip('/')}/{decrypt(d.stream_key_encrypted)}" for d in dests]
            filepath = f"/out/{b.room_name}-{{time}}.mp4" if current_app.config.get("RECORD_LIVE") else None
            b.egress_id = livekit_service.start_stream(b.room_name, urls, layout, filepath)
            b.status = "live"
    except Exception:  # noqa: BLE001 - el detalle va al log, no al usuario
        current_app.logger.exception("No se pudo iniciar la transmisión %s", b.id)
        return jsonify(error="No se pudo iniciar. Revisa que LiveKit esté encendido."), 502

    b.started_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(item=b.to_dict())


@bp.post("/<int:broadcast_id>/stop")
@login_required
def stop(user, broadcast_id):
    b = _get_owned(user, broadcast_id)
    if b.egress_id:
        try:
            livekit_service.stop(b.egress_id)
        except Exception:  # noqa: BLE001
            current_app.logger.exception("No se pudo detener egress %s", b.egress_id)
    b.status = "ended"
    revoke_links(b.id)  # al terminar, el link de invitado deja de servir
    b.ended_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(item=b.to_dict())
