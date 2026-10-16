from conftest import HEADERS

LOOK = {
    "banners": [{"id": "b1", "text": "  Escríbenos   por WhatsApp "}],
    "style": {"theme": "classic", "color": "#1f3a4d", "showNames": False, "showLogo": True},
    "prompter": "Hola a todos",
}


def test_default_look(logged):
    look = logged.get("/api/studio/look").get_json()["look"]
    assert look["banners"] == [] and look["style"]["theme"] == "bubble"


def test_save_and_load_look(logged):
    r = logged.put("/api/studio/look", json=LOOK, headers=HEADERS)
    assert r.status_code == 200
    look = logged.get("/api/studio/look").get_json()["look"]
    assert look["banners"] == [{"id": "b1", "text": "Escríbenos por WhatsApp"}]
    assert look["style"] == LOOK["style"] and look["prompter"] == "Hola a todos"


def test_look_validation(logged):
    bad = [
        {"banners": [{"id": "b1", "text": ""}]},
        {"banners": [{"id": "<x>", "text": "hola"}]},
        {"banners": [{"id": "a", "text": "x"}, {"id": "a", "text": "y"}]},
        {"banners": [{"id": f"b{i}", "text": "x"} for i in range(31)]},
        {"style": {"theme": "comic"}},
        {"style": {"color": "red; background:url(x)"}},
        {"prompter": "x" * 5001},
        ["no es objeto"],
    ]
    for body in bad:
        r = logged.put("/api/studio/look", json=body, headers=HEADERS)
        assert r.status_code == 400, body


def test_look_needs_login(client):
    assert client.get("/api/studio/look").status_code == 401
    assert client.put("/api/studio/look", json=LOOK, headers=HEADERS).status_code == 401
