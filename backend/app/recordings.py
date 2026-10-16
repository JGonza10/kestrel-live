"""Biblioteca: grabaciones MP4 que Egress deja en la carpeta recordings/ (montada como /out)."""
import re
from pathlib import Path

from flask import Blueprint, current_app, jsonify, send_file

from .models import Broadcast
from .security import login_required

bp = Blueprint("recordings", __name__, url_prefix="/api/recordings")

# Egress nombra los archivos <room_name>-<fecha>.mp4; los clips son <room_name>-clip-<n>.mp4
FILE_RE = re.compile(r"^kl-[0-9a-f]{16}-[A-Za-z0-9_.-]{1,80}\.mp4$")


def recordings_dir() -> Path:
    return Path(current_app.config["RECORDINGS_DIR"]).resolve()


def files_for(b: Broadcast) -> list[dict]:
    """Archivos de una transmisión, del más viejo al más nuevo (sin clips)."""
    folder = recordings_dir()
    if not folder.is_dir():
        return []
    out = []
    for p in sorted(folder.glob(f"{b.room_name}-*.mp4")):
        if p.is_file() and FILE_RE.match(p.name) and "-clip-" not in p.name:
            out.append({"name": p.name, "size": p.stat().st_size})
    return out


def safe_file(b: Broadcast, name: str) -> Path | None:
    """Ruta del archivo solo si es de esta transmisión y está dentro de la carpeta (sin ../)."""
    if not FILE_RE.match(name or "") or not name.startswith(f"{b.room_name}-"):
        return None
    folder = recordings_dir()
    path = (folder / name).resolve()
    if path.parent != folder or not path.is_file():
        return None
    return path


def _duration(b: Broadcast):
    if b.started_at and b.ended_at:
        return max(0, int((b.ended_at - b.started_at).total_seconds()))
    return None


@bp.get("")
@login_required
def list_recordings(user):
    items = (Broadcast.query.filter_by(user_id=user.id, status="ended")
             .order_by(Broadcast.ended_at.desc().nullslast(), Broadcast.id.desc()).all())
    return jsonify(items=[{**b.to_dict(), "duration": _duration(b), "files": files_for(b)} for b in items])


@bp.get("/<int:broadcast_id>")
@login_required
def get_recording(user, broadcast_id):
    b = Broadcast.query.filter_by(id=broadcast_id, user_id=user.id).first_or_404()
    return jsonify(item={**b.to_dict(), "duration": _duration(b), "files": files_for(b)})


@bp.get("/<int:broadcast_id>/files/<name>")
@login_required
def download(user, broadcast_id, name):
    b = Broadcast.query.filter_by(id=broadcast_id, user_id=user.id).first_or_404()
    path = safe_file(b, name)
    if path is None:
        return jsonify(error="No encontrado."), 404
    # conditional=True permite adelantar el video (peticiones Range).
    return send_file(path, mimetype="video/mp4", conditional=True, download_name=name)


@bp.delete("/<int:broadcast_id>/files/<name>")
@login_required
def delete_file(user, broadcast_id, name):
    b = Broadcast.query.filter_by(id=broadcast_id, user_id=user.id).first_or_404()
    path = safe_file(b, name)
    if path is None:
        return jsonify(error="No encontrado."), 404
    path.unlink()
    current_app.logger.info("Grabación borrada: %s", name)
    return jsonify(ok=True)
