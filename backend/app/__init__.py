"""Fábrica de la app Flask de Kestrel Live."""
import logging
import os
from logging.handlers import RotatingFileHandler

import click
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from .config import Config
from .extensions import db


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    if not app.config.get("SECRET_KEY"):
        raise RuntimeError("Falta SECRET_KEY en las variables de entorno (.env).")

    _setup_logging(app)
    db.init_app(app)

    from . import ai, auth, broadcasts, comments, destinations, guests, recordings, studio
    from .security import csrf_guard

    app.before_request(csrf_guard)
    app.register_blueprint(auth.bp)
    app.register_blueprint(destinations.bp)
    app.register_blueprint(broadcasts.bp)
    app.register_blueprint(guests.bp)
    app.register_blueprint(studio.bp)
    app.register_blueprint(comments.bp)
    app.register_blueprint(recordings.bp)
    app.register_blueprint(ai.bp)

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    @app.after_request
    def security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        return resp

    @app.errorhandler(HTTPException)
    def http_error(err):
        messages = {404: "No encontrado.", 405: "Método no permitido."}
        return jsonify(error=messages.get(err.code, "Solicitud no válida.")), err.code

    @app.errorhandler(Exception)
    def unexpected_error(err):
        # Nunca se muestra el error técnico al usuario; el detalle queda en el log.
        app.logger.exception("Error no controlado: %s", err)
        return jsonify(error="Algo salió mal. Intenta de nuevo."), 500

    _register_cli(app)

    with app.app_context():
        db.create_all()

    return app


def _setup_logging(app):
    if app.testing:
        return
    os.makedirs("logs", exist_ok=True)
    handler = RotatingFileHandler("logs/kestrel-live.log", maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handler.setLevel(logging.INFO)
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)


def _register_cli(app):
    @app.cli.command("create-user")
    @click.argument("username")
    @click.option("--name", "display_name", default=None, help="Nombre visible en el estudio")
    def create_user(username, display_name):
        """Crea el usuario (pide la contraseña sin mostrarla)."""
        from .models import User
        from .security import hash_password, validate_new_password

        username = username.strip().lower()
        if User.query.filter_by(username=username).first():
            raise click.ClickException("Ese usuario ya existe.")
        password = click.prompt("Contraseña", hide_input=True, confirmation_prompt=True)
        problem = validate_new_password(password)
        if problem:
            raise click.ClickException(problem)
        db.session.add(User(username=username, display_name=display_name or username,
                            password_hash=hash_password(password)))
        db.session.commit()
        click.echo(f"Usuario {username} creado.")
