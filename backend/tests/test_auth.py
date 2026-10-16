from conftest import HEADERS, PASSWORD


def test_login_ok(client):
    r = client.post("/api/auth/login", json={"username": "gonza", "password": PASSWORD}, headers=HEADERS)
    assert r.status_code == 200
    assert r.get_json()["user"]["username"] == "gonza"
    assert "HttpOnly" in r.headers.get("Set-Cookie", "")
    assert client.get("/api/auth/me").status_code == 200


def test_login_wrong_password_generic_message(client):
    r = client.post("/api/auth/login", json={"username": "gonza", "password": "mala"}, headers=HEADERS)
    assert r.status_code == 401
    assert r.get_json()["error"] == "Usuario o contraseña incorrectos."
    r2 = client.post("/api/auth/login", json={"username": "noexiste", "password": "x"}, headers=HEADERS)
    assert r2.get_json()["error"] == r.get_json()["error"]


def test_lockout_after_max_attempts(client):
    for _ in range(5):
        client.post("/api/auth/login", json={"username": "gonza", "password": "mala"}, headers=HEADERS)
    r = client.post("/api/auth/login", json={"username": "gonza", "password": PASSWORD}, headers=HEADERS)
    assert r.status_code == 429


def test_csrf_header_required(client):
    r = client.post("/api/auth/login", json={"username": "gonza", "password": PASSWORD})
    assert r.status_code == 403


def test_protected_route_requires_login(client):
    assert client.get("/api/destinations").status_code == 401
    assert client.get("/api/broadcasts").status_code == 401


def test_logout(logged):
    assert logged.post("/api/auth/logout", headers=HEADERS).status_code == 200
    assert logged.get("/api/auth/me").status_code == 401
