"""Invitados por link: el anfitrión crea un link y el invitado entra sin cuenta.

Rutas del anfitrión (con sesión):
    GET    /api/broadcasts/<id>/invite          link activo (o null)
    POST   /api/broadcasts/<id>/invite          crea un link nuevo y anula el anterior
    DELETE /api/broadcasts/<id>/invite          anula el link
    POST   /api/broadcasts/<id>/guests/remove   saca a un invitado del estudio

Rutas del invitado (sin sesión: el código del link ES su credencial,
igual que la contraseña en /api/auth/login):
    POST   /api/guest/check   datos para la sala de espera
    POST   /api/guest/join    token de LiveKit con identidad de invitado
"""
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request

from . import livekit_service
from .extensions import db
from .models import Broadcast, GuestInvite, User
from .security import decrypt, encrypt, login_required

bp = Blueprint("guests", __name__, url_prefix="/api")

CODE_RE = re.compile(r"^[A-Za-z0-9_-]{20,64}$")
GUEST_IDENTITY_RE = re.compile(r"^guest-[0-9a-f]{12}$")
NAME_MAX = 40
# El token solo sirve para conectarse; ya conectado, LiveKit lo renueva solo.
GUEST_TOKEN_TTL = timedelta(minutes=15)
INVALID_LINK = "Este link de invitado ya no es válido. Pídele uno nuevo al anfitrión."


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _active_invite(broadcast_id):
    return GuestInvite.query.filter_by(broadcast_id=broadcast_id, revoked_at=None).first()


def revoke_links(broadcast_id):
    GuestInvite.query.filter_by(broadcast_id=broadcast_id, revoked_at=None).update(
        {"revoked_at": datetime.now(timezone.utc)}
    )


def _owned(user, broadcast_id):
    return Broadcast.query.filter_by(id=broadcast_id, user_id=user.id).first_or_404()


# --- Anfitrión ---------------------------------------------------------------

@bp.get("/broadcasts/<int:broadcast_id>/invite")
@login_required
def get_invite(user, broadcast_id):
    _owned(user, broadcast_id)
    inv = _active_invite(broadcast_id)
    return jsonify(code=decrypt(inv.code_encrypted) if inv else None)


@bp.post("/broadcasts/<int:broadcast_id>/invite")
@login_required
def create_invite(user, broadcast_id):
    b = _owned(user, broadcast_id)
    if b.status == "ended":
        return jsonify(error="Esta transmisión ya terminó."), 409
    revoke_links(b.id)
    code = secrets.token_urlsafe(24)  # 192 bits: imposible de adivinar
    db.session.add(GuestInvite(broadcast_id=b.id, code_hash=_hash(code), code_encrypted=encrypt(code)))
    db.session.commit()
    return jsonify(code=code), 201


@bp.delete("/broadcasts/<int:broadcast_id>/invite")
@login_required
def revoke_invite(user, broadcast_id):
    _owned(user, broadcast_id)
    revoke_links(broadcast_id)
    db.session.commit()
    return jsonify(ok=True)


@bp.post("/broadcasts/<int:broadcast_id>/guests/remove")
@login_required
def remove_guest(user, broadcast_id):
    b = _owned(user, broadcast_id)
    identity = str((request.get_json(silent=True) or {}).get("identity", ""))
    if not GUEST_IDENTITY_RE.match(identity):
        return jsonify(error="Invitado no válido."), 400
    try:
        livekit_service.remove_participant(b.room_name, identity)
    except Exception:  # noqa: BLE001 - el detalle va al log, no al usuario
        current_app.logger.exception("No se pudo sacar a %s de %s", identity, b.room_name)
        return jsonify(error="No se pudo sacar al invitado. Intenta de nuevo."), 502
    return jsonify(ok=True)


# --- Invitado ----------------------------------------------------------------

def _broadcast_for_code(data):
    """Regresa la transmisión del link, o None si el link no sirve."""
    code = data.get("code")
    if not isinstance(code, str) or not CODE_RE.match(code):
        return None
    inv = GuestInvite.query.filter_by(code_hash=_hash(code), revoked_at=None).first()
    if inv is None:
        return None
    b = db.session.get(Broadcast, inv.broadcast_id)
    if b is None or b.status == "ended":
        return None
    return b


def clean_guest_name(raw) -> str | None:
    """Nombre visible del invitado: sin espacios de más, 1 a 40 caracteres imprimibles."""
    if not isinstance(raw, str):
        return None
    name = " ".join(raw.split())
    if not 1 <= len(name) <= NAME_MAX or not name.isprintable():
        return None
    return name


@bp.post("/guest/check")
def guest_check():
    b = _broadcast_for_code(request.get_json(silent=True) or {})
    if b is None:
        return jsonify(error=INVALID_LINK), 404
    host = db.session.get(User, b.user_id)
    return jsonify(title=b.title, host=host.display_name if host else "")


@bp.post("/guest/join")
def guest_join():
    data = request.get_json(silent=True) or {}
    b = _broadcast_for_code(data)
    if b is None:
        return jsonify(error=INVALID_LINK), 404
    name = clean_guest_name(data.get("name"))
    if name is None:
        return jsonify(error=f"Escribe tu nombre (máx. {NAME_MAX} caracteres).", fields=["name"]), 400
    identity = f"guest-{secrets.token_hex(6)}"
    token = livekit_service.make_join_token(b.room_name, identity, name, ttl=GUEST_TOKEN_TTL)
    return jsonify(token=token, ws_url=current_app.config["LIVEKIT_WS_URL"], identity=identity, title=b.title)
