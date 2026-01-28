from __future__ import annotations

from flask import Flask
from flask_cors import CORS

from .config import AppConfig, ConfigError, load_config
from .firebase import init_firebase
from .auth.routes import auth_bp
from .chats.routes import chats_bp
from .notes.routes import notes_bp
from .users.routes import users_bp
from .files import files_bp
from .mcp.routes import mcp_bp
from .calendar import calendar_bp
from .devices import devices_bp
from .email import email_bp
from .email import analysis_bp


def create_app(config: AppConfig | None = None) -> Flask:
    """Application factory for the Zen backend."""
    if config is None:
        try:
            config = load_config()
        except ConfigError as exc:
            raise RuntimeError(f"Configuration error: {exc}") from exc

    app = Flask(__name__)

    app.config.update(
        PORT=config.port,
        FIREBASE_CREDENTIALS_PATH=str(config.firebase_credentials_path),
        FIREBASE_WEB_API_KEY=config.firebase_web_api_key,
        GEMINI_API_KEY=config.gemini_api_key,
        FIRESTORE_DATABASE_ID=config.firestore_database_id,
        UPLOADS_DIR=str(config.uploads_dir),
        MAX_UPLOAD_SIZE=10 * 1024 * 1024,
        MAX_INLINE_ATTACHMENT_BYTES=config.max_inline_attachment_bytes,
        NOTES_MCP_HOST=config.notes_mcp_host,
        NOTES_MCP_PORT=config.notes_mcp_port,
        GOOGLE_CLIENT_ID=config.google_client_id,
        GOOGLE_CLIENT_SECRET=config.google_client_secret,
        GOOGLE_CALENDAR_SCOPES=config.google_calendar_scopes,
        GOOGLE_GMAIL_SCOPES=config.google_gmail_scopes,
        GMAIL_PUBSUB_TOPIC=config.gmail_pubsub_topic,
    )

    CORS(app)

    init_firebase(config.firebase_credentials_path, database_id=config.firestore_database_id)

    app.register_blueprint(auth_bp)
    app.register_blueprint(chats_bp)
    app.register_blueprint(notes_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(mcp_bp)
    app.register_blueprint(calendar_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(email_bp)
    app.register_blueprint(analysis_bp)

    @app.get("/health")
    def health_check() -> dict[str, str]:
        return {"status": "ok"}

    return app
