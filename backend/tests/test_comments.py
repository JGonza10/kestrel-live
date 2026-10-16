import urllib.error

import pytest

from app import comments
from conftest import HEADERS


@pytest.fixture()
def bid(logged):
    return logged.post("/api/broadcasts", json={"title": "Con chat"}, headers=HEADERS).get_json()["item"]["id"]


@pytest.fixture()
def keys(app):
    app.config["YOUTUBE_API_KEY"] = "yt-key-de-prueba"
    app.config["FACEBOOK_PAGE_TOKEN"] = "fb-token-de-prueba"


class FakeHttp:
    """Responde como YouTube/Facebook y guarda qué se pidió."""

    def __init__(self):
        self.calls = []

    def __call__(self, url, params):
        self.calls.append((url, dict(params)))
        if url.endswith("/videos"):
            return {"items": [{"liveStreamingDetails": {"activeLiveChatId": "CHAT123"}}]}
        if url.endswith("/liveChat/messages"):
            first = "pageToken" not in params
            return {
                "nextPageToken": "P2" if first else "P3",
                "pollingIntervalMillis": 2000,
                "items": [
                    {
                        "id": "m1" if first else "m2",
                        "snippet": {"type": "textMessageEvent", "displayMessage": "¡Hola  desde\nMonterrey!",
                                    "publishedAt": "2026-10-16T10:00:00Z"},
                        "authorDetails": {"displayName": "Ana"},
                    },
                    {"id": "x", "snippet": {"type": "chatEndedEvent"}, "authorDetails": {}},
                ],
            }
        if url.endswith("/comments"):
            return {"data": [{"id": "c1", "from": {"name": "Luis"}, "message": "<b>Saludos</b>",
                              "created_time": "2026-10-16T10:00:05+0000"}]}
        raise AssertionError(url)


@pytest.mark.parametrize("raw,expected", [
    ("dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("youtube.com/live/dQw4w9WgXcQ?si=x", "dQw4w9WgXcQ"),
    ("https://evil.com/watch?v=dQw4w9WgXcQ", None),
    ("hola", None),
])
def test_parse_youtube_id(raw, expected):
    assert comments.parse_youtube_id(raw) == expected


def test_parse_facebook_id():
    assert comments.parse_facebook_id("1234567890") == "1234567890"
    assert comments.parse_facebook_id("https://www.facebook.com/kestrel/videos/987654321/") == "987654321"
    assert comments.parse_facebook_id("DROP TABLE") is None


def test_sources_validation(logged, bid):
    r = logged.put(f"/api/broadcasts/{bid}/comments/sources", json={"youtube": "no es link", "facebook": "x"},
                   headers=HEADERS)
    assert r.status_code == 400 and set(r.get_json()["fields"]) == {"youtube", "facebook"}
    r = logged.put(f"/api/broadcasts/{bid}/comments/sources",
                   json={"youtube": "https://youtu.be/dQw4w9WgXcQ", "facebook": "1234567890"}, headers=HEADERS)
    assert r.get_json()["sources"] == {"youtube": "dQw4w9WgXcQ", "facebook": "1234567890"}
    assert logged.get(f"/api/broadcasts/{bid}/comments/sources").get_json()["sources"]["youtube"] == "dQw4w9WgXcQ"


def test_poll_without_sources_is_empty(logged, bid):
    assert logged.get(f"/api/broadcasts/{bid}/comments").get_json() == {"items": [], "errors": {}, "poll_ms": 0}


def test_poll_reads_both_platforms_and_remembers_position(logged, bid, keys, monkeypatch):
    fake = FakeHttp()
    monkeypatch.setattr(comments, "_http_get_json", fake)
    logged.put(f"/api/broadcasts/{bid}/comments/sources",
               json={"youtube": "dQw4w9WgXcQ", "facebook": "1234567890"}, headers=HEADERS)

    d = logged.get(f"/api/broadcasts/{bid}/comments").get_json()
    assert d["errors"] == {} and d["poll_ms"] == 5000  # nunca menos de 5 s
    yt, fb = d["items"]
    assert yt == {"id": "youtube:m1", "platform": "youtube", "author": "Ana",
                  "text": "¡Hola desde Monterrey!", "at": "2026-10-16T10:00:00Z"}
    assert fb["author"] == "Luis" and fb["text"] == "<b>Saludos</b>"  # React lo muestra como texto

    d = logged.get(f"/api/broadcasts/{bid}/comments").get_json()
    assert d["items"][0]["id"] == "youtube:m2"
    # El chat de YouTube se resuelve una sola vez y luego se sigue con pageToken.
    assert sum(1 for u, _ in fake.calls if u.endswith("/videos")) == 1
    assert [p.get("pageToken") for u, p in fake.calls if u.endswith("/messages")] == [None, "P2"]
    assert [p.get("since") for u, p in fake.calls if u.endswith("/comments")][1] > 0


def test_missing_keys_give_friendly_error(logged, bid, app):
    app.config["YOUTUBE_API_KEY"] = None
    logged.put(f"/api/broadcasts/{bid}/comments/sources", json={"youtube": "dQw4w9WgXcQ"}, headers=HEADERS)
    d = logged.get(f"/api/broadcasts/{bid}/comments").get_json()
    assert "YOUTUBE_API_KEY" in d["errors"]["youtube"]


def test_network_error_is_hidden(logged, bid, keys, monkeypatch):
    def boom(url, params):
        raise urllib.error.URLError("conexión rechazada en 10.0.0.1")

    monkeypatch.setattr(comments, "_http_get_json", boom)
    logged.put(f"/api/broadcasts/{bid}/comments/sources", json={"facebook": "1234567890"}, headers=HEADERS)
    d = logged.get(f"/api/broadcasts/{bid}/comments").get_json()
    assert "10.0.0.1" not in d["errors"]["facebook"]
    assert "Facebook" in d["errors"]["facebook"]


def test_comments_need_login_and_ownership(client, logged, bid, app):
    anon = app.test_client()
    assert anon.get(f"/api/broadcasts/{bid}/comments").status_code == 401
    assert anon.put(f"/api/broadcasts/{bid}/comments/sources", json={}, headers=HEADERS).status_code == 401
    assert logged.get("/api/broadcasts/9999/comments").status_code == 404
