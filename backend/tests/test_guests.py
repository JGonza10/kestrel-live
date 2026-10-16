import jwt  # viene con livekit-api (PyJWT)
import pytest

from app import livekit_service
from app.extensions import db
from app.guests import clean_guest_name
from app.models import GuestInvite
from conftest import HEADERS


def _broadcast(logged, title="Con invitados"):
    return logged.post("/api/broadcasts", json={"title": title}, headers=HEADERS).get_json()["item"]


def _invite(logged, bid):
    r = logged.post(f"/api/broadcasts/{bid}/invite", headers=HEADERS)
    assert r.status_code == 201
    return r.get_json()["code"]


def test_invite_is_stored_hashed_and_encrypted(logged, app):
    b = _broadcast(logged)
    assert logged.get(f"/api/broadcasts/{b['id']}/invite").get_json()["code"] is None
    code = _invite(logged, b["id"])
    assert len(code) >= 30
    # El anfitrión puede volver a copiar el mismo link.
    assert logged.get(f"/api/broadcasts/{b['id']}/invite").get_json()["code"] == code
    with app.app_context():
        inv = GuestInvite.query.one()
        assert code not in inv.code_hash and code.encode() not in inv.code_encrypted


def test_guest_can_join_with_link_without_session(logged, client, app):
    b = _broadcast(logged, "Demo Kestrel")
    code = _invite(logged, b["id"])
    guest = app.test_client()  # sin sesión

    info = guest.post("/api/guest/check", json={"code": code}, headers=HEADERS).get_json()
    assert info == {"title": "Demo Kestrel", "host": "Gonza"}

    r = guest.post("/api/guest/join", json={"code": code, "name": "  Ana   López "}, headers=HEADERS)
    assert r.status_code == 200
    data = r.get_json()
    claims = jwt.decode(data["token"], options={"verify_signature": False})
    assert claims["video"]["room"] == b["room_name"]
    assert claims["sub"] == data["identity"] and data["identity"].startswith("guest-")
    assert claims["name"] == "Ana López"
    assert claims["exp"] - claims["nbf"] <= 15 * 60
    # El invitado no recibe una sesión de anfitrión.
    assert guest.get("/api/broadcasts").status_code == 401


@pytest.mark.parametrize("code", [None, "", "corto", "x" * 100, "a' OR '1'='1' -- aaaaaaaa", 123])
def test_bad_codes_are_rejected(client, code):
    r = client.post("/api/guest/join", json={"code": code, "name": "Ana"}, headers=HEADERS)
    assert r.status_code == 404
    assert "no es válido" in r.get_json()["error"]


def test_new_link_cancels_old_one(logged, client):
    b = _broadcast(logged)
    old = _invite(logged, b["id"])
    new = _invite(logged, b["id"])
    assert old != new
    assert client.post("/api/guest/check", json={"code": old}, headers=HEADERS).status_code == 404
    assert client.post("/api/guest/check", json={"code": new}, headers=HEADERS).status_code == 200


def test_revoke_and_stop_invalidate_link(logged, client):
    b = _broadcast(logged)
    code = _invite(logged, b["id"])
    assert logged.delete(f"/api/broadcasts/{b['id']}/invite", headers=HEADERS).status_code == 200
    assert client.post("/api/guest/check", json={"code": code}, headers=HEADERS).status_code == 404

    code = _invite(logged, b["id"])
    logged.post(f"/api/broadcasts/{b['id']}/stop", headers=HEADERS)
    assert client.post("/api/guest/check", json={"code": code}, headers=HEADERS).status_code == 404
    assert logged.post(f"/api/broadcasts/{b['id']}/invite", headers=HEADERS).status_code == 409


def test_guest_name_validation(logged, client):
    code = _invite(logged, _broadcast(logged)["id"])
    for bad in ["", "   ", "x" * 41, "Ana\x00", 7]:
        r = client.post("/api/guest/join", json={"code": code, "name": bad}, headers=HEADERS)
        assert r.status_code == 400 and r.get_json()["fields"] == ["name"]
    assert clean_guest_name(" Juan  González ") == "Juan González"


def test_invite_routes_need_login_and_ownership(client, logged, app):
    b = _broadcast(logged)
    anon = app.test_client()
    assert anon.get(f"/api/broadcasts/{b['id']}/invite").status_code == 401
    assert anon.post(f"/api/broadcasts/{b['id']}/invite", headers=HEADERS).status_code == 401
    assert anon.post(f"/api/broadcasts/{b['id']}/guests/remove", json={}, headers=HEADERS).status_code == 401
    assert logged.post("/api/broadcasts/9999/invite", headers=HEADERS).status_code == 404


def test_guest_routes_need_csrf_header(client):
    assert client.post("/api/guest/join", json={"code": "x", "name": "Ana"}).status_code == 403


def test_remove_guest(logged, monkeypatch):
    b = _broadcast(logged)
    calls = []
    monkeypatch.setattr(livekit_service, "remove_participant", lambda room, ident: calls.append((room, ident)))

    r = logged.post(f"/api/broadcasts/{b['id']}/guests/remove", json={"identity": "host-1"}, headers=HEADERS)
    assert r.status_code == 400  # no se puede sacar al anfitrión
    r = logged.post(f"/api/broadcasts/{b['id']}/guests/remove",
                    json={"identity": "guest-0123456789ab"}, headers=HEADERS)
    assert r.status_code == 200
    assert calls == [(b["room_name"], "guest-0123456789ab")]


def test_remove_guest_hides_technical_error(logged, monkeypatch):
    b = _broadcast(logged)

    def boom(*_):
        raise RuntimeError("detalle interno de LiveKit")

    monkeypatch.setattr(livekit_service, "remove_participant", boom)
    r = logged.post(f"/api/broadcasts/{b['id']}/guests/remove",
                    json={"identity": "guest-0123456789ab"}, headers=HEADERS)
    assert r.status_code == 502
    assert "LiveKit" not in r.get_json()["error"]


def test_guest_invites_table_exists(app):
    # El modelo se crea con create_all (no hace falta migración: es una tabla nueva).
    with app.app_context():
        assert "guest_invites" in db.metadata.tables
