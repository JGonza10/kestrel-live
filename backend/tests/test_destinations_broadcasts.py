import jwt  # viene con livekit-api (PyJWT)

from app.extensions import db
from app.models import Destination
from conftest import HEADERS


def test_destination_key_is_encrypted_and_hidden(logged, app):
    r = logged.post(
        "/api/destinations",
        json={"name": "Mi canal", "platform": "youtube", "stream_key": "abcd-1234-efgh"},
        headers=HEADERS,
    )
    assert r.status_code == 201
    item = r.get_json()["item"]
    assert "stream_key" not in item and item["has_stream_key"] is True
    assert item["rtmp_url"].startswith("rtmp://")
    with app.app_context():
        dest = db.session.get(Destination, item["id"])
        assert b"abcd-1234-efgh" not in dest.stream_key_encrypted


def test_destination_validation(logged):
    r = logged.post(
        "/api/destinations",
        json={"name": "", "platform": "myspace", "rtmp_url": "http://x", "stream_key": "a b"},
        headers=HEADERS,
    )
    assert r.status_code == 400
    assert set(r.get_json()["fields"]) == {"name", "platform", "rtmp_url", "stream_key"}


def test_broadcast_create_list_and_token(logged):
    r = logged.post("/api/broadcasts", json={"title": "Demo Kestrel", "kind": "live"}, headers=HEADERS)
    assert r.status_code == 201
    b = r.get_json()["item"]
    assert b["status"] == "draft" and b["room_name"].startswith("kl-")

    items = logged.get("/api/broadcasts").get_json()["items"]
    assert [i["id"] for i in items] == [b["id"]]

    t = logged.post(f"/api/broadcasts/{b['id']}/token", headers=HEADERS).get_json()
    claims = jwt.decode(t["token"], options={"verify_signature": False})
    assert claims["video"]["room"] == b["room_name"]
    assert claims["video"]["roomJoin"] is True


def test_start_live_requires_destination(logged):
    b = logged.post("/api/broadcasts", json={"title": "Sin destinos"}, headers=HEADERS).get_json()["item"]
    r = logged.post(f"/api/broadcasts/{b['id']}/start", json={"destination_ids": []}, headers=HEADERS)
    assert r.status_code == 400


def test_stop_marks_ended(logged):
    b = logged.post("/api/broadcasts", json={"title": "Para terminar"}, headers=HEADERS).get_json()["item"]
    r = logged.post(f"/api/broadcasts/{b['id']}/stop", headers=HEADERS)
    assert r.get_json()["item"]["status"] == "ended"
    assert logged.get("/api/broadcasts?status=ended").get_json()["items"][0]["id"] == b["id"]
