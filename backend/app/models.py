"""Modelos de la base de datos (SQLAlchemy: todas las consultas son parametrizadas)."""
from datetime import datetime, timezone

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(80), nullable=False)
    password_hash = db.Column(db.LargeBinary(60), nullable=False)
    failed_attempts = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    def to_dict(self):
        return {"id": self.id, "username": self.username, "display_name": self.display_name}


class Destination(db.Model):
    """Una red a la que se transmite por RTMP (YouTube, Facebook, TikTok, etc.)."""

    __tablename__ = "destinations"

    PLATFORMS = ("youtube", "facebook", "linkedin", "instagram", "tiktok", "rtmp")

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(80), nullable=False)
    platform = db.Column(db.String(20), nullable=False)
    rtmp_url = db.Column(db.String(300), nullable=False)
    stream_key_encrypted = db.Column(db.LargeBinary, nullable=False)  # cifrada con Fernet
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    def to_dict(self):
        # La clave de transmisión NUNCA se regresa al navegador.
        return {
            "id": self.id,
            "name": self.name,
            "platform": self.platform,
            "rtmp_url": self.rtmp_url,
            "enabled": self.enabled,
            "has_stream_key": bool(self.stream_key_encrypted),
        }


class Broadcast(db.Model):
    """Una transmisión o grabación (un "estudio")."""

    __tablename__ = "broadcasts"

    KINDS = ("live", "recording")
    STATUSES = ("draft", "live", "recording", "ended")

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(120), nullable=False)
    kind = db.Column(db.String(20), nullable=False, default="live")
    status = db.Column(db.String(20), nullable=False, default="draft")
    room_name = db.Column(db.String(64), unique=True, nullable=False)
    egress_id = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    ended_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "kind": self.kind,
            "status": self.status,
            "room_name": self.room_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
        }
