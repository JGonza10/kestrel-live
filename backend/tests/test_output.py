from app import livekit_service
from conftest import HEADERS


def test_egress_uses_studio_page_when_configured(app):
    app.config["EGRESS_TEMPLATE_URL"] = "http://host.docker.internal:5173/salida"
    with app.app_context():
        req = livekit_service._composite_request("kl-1", "grid")
    assert req.custom_base_url == "http://host.docker.internal:5173/salida"
    assert req.layout == ""


def test_egress_falls_back_to_livekit_layout(app):
    app.config["EGRESS_TEMPLATE_URL"] = ""
    with app.app_context():
        req = livekit_service._composite_request("kl-1", "grid")
    assert req.custom_base_url == "" and req.layout == "grid"


def test_token_tells_studio_if_output_matches_canvas(logged, app):
    b = logged.post("/api/broadcasts", json={"title": "Salida"}, headers=HEADERS).get_json()["item"]
    app.config["EGRESS_TEMPLATE_URL"] = "http://x/salida"
    assert logged.post(f"/api/broadcasts/{b['id']}/token", headers=HEADERS).get_json()["studio_output"] is True
    app.config["EGRESS_TEMPLATE_URL"] = ""
    assert logged.post(f"/api/broadcasts/{b['id']}/token", headers=HEADERS).get_json()["studio_output"] is False
