"""Configuración leída de variables de entorno (nunca secretos en el código)."""
import os
from datetime import timedelta

from cryptography.fernet import Fernet


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "si", "sí"}


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", "postgresql+psycopg://kestrel:kestrel@localhost:5432/kestrel_live"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Cookies de sesión seguras
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = _bool("SESSION_COOKIE_SECURE", True)
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = timedelta(hours=int(os.getenv("SESSION_HOURS", "8")))

    # Límite de intentos de login
    LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
    LOGIN_LOCK_MINUTES = int(os.getenv("LOGIN_LOCK_MINUTES", "15"))

    # Cifrado de claves de transmisión (Fernet)
    FERNET_KEY = os.getenv("FERNET_KEY")

    # LiveKit
    LIVEKIT_URL = os.getenv("LIVEKIT_URL", "http://localhost:7880")
    LIVEKIT_WS_URL = os.getenv("LIVEKIT_WS_URL", "ws://localhost:7880")
    LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
    LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")


class TestConfig(Config):
    TESTING = True
    SECRET_KEY = "test-secret-key-solo-para-pruebas"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SESSION_COOKIE_SECURE = False
    FERNET_KEY = Fernet.generate_key().decode()  # llave nueva en cada corrida de pruebas
    LIVEKIT_API_KEY = "devkey"
    LIVEKIT_API_SECRET = "devsecret-devsecret-devsecret-123"
