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


class GuestInvite(db.Model):
    """Link para que un invitado entre al estudio sin cuenta.

    El código se guarda dos veces: su hash SHA-256 (para buscarlo sin
    tener el código en claro) y cifrado con Fernet (para que el anfitrión
    pueda volver a copiar el link). Solo hay un link activo por transmisión.
    """

    __tablename__ = "guest_invites"

    id = db.Column(db.Integer, primary_key=True)
    broadcast_id = db.Column(db.Integer, db.ForeignKey("broadcasts.id"), nullable=False, index=True)
    code_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)
    code_encrypted = db.Column(db.LargeBinary, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)


class StudioLook(db.Model):
    """Marca del usuario en el estudio: banners, estilo de nombres y guion del teleprompter.
    Se guarda como JSON ya validado (ver studio.py)."""

    __tablename__ = "studio_looks"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    data = db.Column(db.Text, nullable=False, default="{}")
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class CommentSource(db.Model):
    """De dónde leer los comentarios de una transmisión (YouTube y/o Facebook)."""

    __tablename__ = "comment_sources"

    broadcast_id = db.Column(db.Integer, db.ForeignKey("broadcasts.id"), primary_key=True)
    youtube_video_id = db.Column(db.String(11), nullable=True)
    youtube_chat_id = db.Column(db.String(128), nullable=True)   # se resuelve una vez
    youtube_page_token = db.Column(db.String(256), nullable=True)  # para pedir solo los nuevos
    facebook_video_id = db.Column(db.String(32), nullable=True)
    facebook_since = db.Column(db.Integer, nullable=True)  # unix: último comentario visto

    def to_dict(self):
        return {"youtube": self.youtube_video_id or "", "facebook": self.facebook_video_id or ""}


class TranscriptSegment(db.Model):
    """Una frase de los subtítulos en vivo. t_ms = milisegundos desde que inició la transmisión."""

    __tablename__ = "transcript_segments"

    id = db.Column(db.Integer, primary_key=True)
    broadcast_id = db.Column(db.Integer, db.ForeignKey("broadcasts.id"), nullable=False, index=True)
    t_ms = db.Column(db.Integer, nullable=False)
    speaker = db.Column(db.String(80), nullable=False)
    text = db.Column(db.String(500), nullable=False)

    def to_dict(self):
        return {"t_ms": self.t_ms, "speaker": self.speaker, "text": self.text}


class AiReport(db.Model):
    """Lo que Kestrel IA generó al terminar: resumen, capítulos, clips y textos para redes (JSON validado)."""

    __tablename__ = "ai_reports"

    broadcast_id = db.Column(db.Integer, db.ForeignKey("broadcasts.id"), primary_key=True)
    data = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
