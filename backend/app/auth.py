"""Login, logout y sesión actual, con bloqueo tras intentos fallidos."""
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request, session

from .extensions import db
from .models import User
from .security import check_password, current_user, login_required

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

GENERIC_ERROR = "Usuario o contraseña incorrectos."


def _as_aware(dt):
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip().lower()
    password = data.get("password", "")
    if not username or not isinstance(password, str) or not password or len(username) > 50:
        return jsonify(error=GENERIC_ERROR), 400

    user = User.query.filter_by(username=username).first()
    now = datetime.now(timezone.utc)

    if user is not None and user.locked_until and _as_aware(user.locked_until) > now:
        minutes = max(1, int((_as_aware(user.locked_until) - now).total_seconds() // 60) + 1)
        return jsonify(error=f"Cuenta bloqueada temporalmente. Intenta en {minutes} min."), 429

    if user is None or not check_password(password, user.password_hash):
        if user is not None:
            user.failed_attempts += 1
            if user.failed_attempts >= current_app.config["LOGIN_MAX_ATTEMPTS"]:
                user.locked_until = now + timedelta(minutes=current_app.config["LOGIN_LOCK_MINUTES"])
                user.failed_attempts = 0
                current_app.logger.warning("Cuenta %s bloqueada por intentos fallidos", username)
            db.session.commit()
        return jsonify(error=GENERIC_ERROR), 401

    user.failed_attempts = 0
    user.locked_until = None
    db.session.commit()

    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    return jsonify(user=user.to_dict())


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@bp.get("/me")
def me():
    user = current_user()
    if user is None:
        return jsonify(user=None), 401
    return jsonify(user=user.to_dict())


@bp.get("/ping")
@login_required
def ping(user):
    return jsonify(ok=True, user=user.username)
