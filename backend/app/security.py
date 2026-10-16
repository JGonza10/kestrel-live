"""Utilidades de seguridad: hash de contraseñas, cifrado y protección de rutas."""
from functools import wraps

import bcrypt
from cryptography.fernet import Fernet
from flask import current_app, jsonify, request, session

from .extensions import db
from .models import User

MAX_PASSWORD_BYTES = 72  # límite de bcrypt


def hash_password(password: str) -> bytes:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))


def check_password(password: str, password_hash: bytes) -> bool:
    data = password.encode("utf-8")
    if len(data) > MAX_PASSWORD_BYTES:
        return False
    return bcrypt.checkpw(data, password_hash)


def validate_new_password(password: str) -> str | None:
    """Regresa un mensaje de error o None si la contraseña es aceptable."""
    if not isinstance(password, str) or len(password) < 10:
        return "La contraseña debe tener al menos 10 caracteres."
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return "La contraseña es demasiado larga (máximo 72 bytes)."
    return None


def _fernet() -> Fernet:
    key = current_app.config.get("FERNET_KEY")
    if not key:
        raise RuntimeError("Falta FERNET_KEY en las variables de entorno.")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(text: str) -> bytes:
    return _fernet().encrypt(text.encode("utf-8"))


def decrypt(token: bytes) -> str:
    return _fernet().decrypt(token).decode("utf-8")


def current_user() -> User | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return db.session.get(User, user_id)


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify(error="Necesitas iniciar sesión."), 401
        return view(user, *args, **kwargs)

    return wrapper


def csrf_guard():
    """Protección CSRF simple para una SPA: las peticiones que cambian datos
    deben traer JSON y el encabezado X-Requested-With (un formulario de otro
    sitio no puede enviarlos sin pasar por CORS)."""
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.path.startswith("/api/"):
        if request.headers.get("X-Requested-With") != "kestrel-live":
            return jsonify(error="Petición no permitida."), 403
    return None
