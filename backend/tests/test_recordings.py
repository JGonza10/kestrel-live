import pytest

from app import livekit_service
from app.extensions import db
from app.models import Broadcast, User
from app.security import hash_password
from conftest import HEADERS


@pytest.fixture()
def rec_dir(app, tmp_path):
    folder = tmp_path / "recordings"
    folder.mkdir()
    app.config["RECORDINGS_DIR"] = str(folder)
    return folder


@pytest.fixture()
def ended(logged, rec_dir):
    b = logged.post("/api/broadcasts", json={"title": "Grabada", "kind": "recording"}, headers=HEADERS).get_json()["item"]
    logged.post(f"/api/broadcasts/{b['id']}/stop", headers=HEADERS)
    name = f"{b['room_name']}-2026-10-16T101010.mp4"
    (rec_dir / name).write_bytes(b"0123456789" * 100)
    (rec_dir / f"{b['room_name']}-clip-1.mp4").write_bytes(b"clip")
    (rec_dir / "secreto.txt").write_text("no")
    return b, name


def test_library_lists_ended_with_files(logged, ended):
    b, name = ended
    items = logged.get("/api/recordings").get_json()["items"]
    assert [i["id"] for i in items] == [b["id"]]
    assert items[0]["files"] == [{"name": name, "size": 1000}]  # sin clips ni otros archivos


def test_download_supports_range(logged, ended):
    b, name = ended
    r = logged.get(f"/api/recordings/{b['id']}/files/{name}")
    assert r.status_code == 200 and r.mimetype == "video/mp4" and len(r.data) == 1000
    r = logged.get(f"/api/recordings/{b['id']}/files/{name}", headers={"Range": "bytes=0-9"})
    assert r.status_code == 206 and r.data == b"0123456789"


@pytest.mark.parametrize("bad", ["..%2Fsecreto.txt", "secreto.txt", "kl-0000000000000000-x.mp4", "%2Fetc%2Fpasswd"])
def test_cannot_escape_or_read_other_files(logged, ended, bad):
    b, _ = ended
    assert logged.get(f"/api/recordings/{b['id']}/files/{bad}").status_code == 404


def test_other_user_cannot_see_recordings(app, logged, ended, client):
    b, name = ended
    with app.app_context():
        db.session.add(User(username="otro", display_name="Otro", password_hash=hash_password("contraseña-del-otro")))
        db.session.commit()
    other = app.test_client()
    other.post("/api/auth/login", json={"username": "otro", "password": "contraseña-del-otro"}, headers=HEADERS)
    assert other.get("/api/recordings").get_json()["items"] == []
    assert other.get(f"/api/recordings/{b['id']}/files/{name}").status_code == 404
    assert other.delete(f"/api/recordings/{b['id']}/files/{name}", headers=HEADERS).status_code == 404


def test_delete_file(logged, ended, rec_dir):
    b, name = ended
    assert logged.delete(f"/api/recordings/{b['id']}/files/{name}", headers=HEADERS).status_code == 200
    assert not (rec_dir / name).exists()


def test_library_needs_login(client):
    assert client.get("/api/recordings").status_code == 401


def test_live_also_records_when_enabled(logged, app, monkeypatch):
    calls = []
    monkeypatch.setattr(livekit_service, "start_stream", lambda room, urls, layout, filepath=None: calls.append(filepath) or "EG_1")
    d = logged.post("/api/destinations", json={"name": "YT", "platform": "youtube", "stream_key": "abc-123"},
                    headers=HEADERS).get_json()["item"]
    b = logged.post("/api/broadcasts", json={"title": "En vivo"}, headers=HEADERS).get_json()["item"]
    app.config["RECORD_LIVE"] = True
    r = logged.post(f"/api/broadcasts/{b['id']}/start", json={"destination_ids": [d["id"]]}, headers=HEADERS)
    assert r.status_code == 200
    assert calls == [f"/out/{b['room_name']}-{{time}}.mp4"]
    with app.app_context():
        assert db.session.get(Broadcast, b["id"]).status == "live"
