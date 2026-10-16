import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app  # noqa: E402
from app.config import TestConfig  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402

HEADERS = {"X-Requested-With": "kestrel-live"}
PASSWORD = "contraseña-segura-123"


@pytest.fixture()
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.session.add(User(username="gonza", display_name="Gonza", password_hash=hash_password(PASSWORD)))
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def logged(client):
    r = client.post("/api/auth/login", json={"username": "gonza", "password": PASSWORD}, headers=HEADERS)
    assert r.status_code == 200
    return client
