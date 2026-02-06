from __future__ import annotations

from flask import Flask, request, jsonify
import threading
import time
_API_USAGE = {
    'minute_count': 0,
    'minute_reset_time': 0,
    'hour_count': 0,
    'hour_reset_time': 0,
    'shutdown_until': 0,
    'lock': threading.Lock(),
}

# Set your API usage thresholds and shutdown durations (in seconds)
API_USAGE_MINUTE_THRESHOLD = 1000  # e.g. 100 requests per minute
API_USAGE_HOUR_THRESHOLD = 20000   # e.g. 2000 requests per hour
API_SHUTDOWN_MINUTE_DURATION = 60   # 1 minute
API_SHUTDOWN_HOUR_DURATION = 360    #  hour

def _check_api_overuse():
    now = time.time()
    with _API_USAGE['lock']:
        # If in shutdown, reject
        if _API_USAGE['shutdown_until'] > now:
            return False, int(_API_USAGE['shutdown_until'] - now)
        # Reset per-minute and per-hour counters
        if now > _API_USAGE['minute_reset_time']:
            _API_USAGE['minute_count'] = 0
            _API_USAGE['minute_reset_time'] = now + 60
        if now > _API_USAGE['hour_reset_time']:
            _API_USAGE['hour_count'] = 0
            _API_USAGE['hour_reset_time'] = now + 3600
        _API_USAGE['minute_count'] += 1
        _API_USAGE['hour_count'] += 1
        # Check per-minute threshold
        if _API_USAGE['minute_count'] > API_USAGE_MINUTE_THRESHOLD:
            _API_USAGE['shutdown_until'] = now + API_SHUTDOWN_MINUTE_DURATION
            print(f"[API OVERUSE] API usage exceeded {API_USAGE_MINUTE_THRESHOLD} requests per minute. Shutting down for 10 minutes.")
            return False, API_SHUTDOWN_MINUTE_DURATION
        # Check per-hour threshold
        if _API_USAGE['hour_count'] > API_USAGE_HOUR_THRESHOLD:
            _API_USAGE['shutdown_until'] = now + API_SHUTDOWN_HOUR_DURATION
            print(f"[API OVERUSE] API usage exceeded {API_USAGE_HOUR_THRESHOLD} requests per hour. Shutting down for 1 hour.")
            return False, API_SHUTDOWN_HOUR_DURATION
        return True, None
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
from .search import search_bp

def create_app(config: AppConfig | None = None) -> Flask:
    """Application factory for the Zen backend."""
    if config is None:
        try:
            config = load_config()
        except ConfigError as exc:
            raise RuntimeError(f"Configuration error: {exc}") from exc

    app = Flask(__name__)

    @app.before_request
    def api_overuse_guard():
        # Only apply spam prevention to Firebase-related requests
        firebase_blueprints = {'auth', 'chats', 'notes', 'users', 'files'}
        if request.blueprint in firebase_blueprints:
            ok, wait = _check_api_overuse()
            if not ok:
                return jsonify({
                    "error": "api_overuse",
                    "message": f"API temporarily disabled due to overuse. Try again in {wait} seconds."
                }), 429

    app.config.update(
        PORT=config.port,
        FIREBASE_CREDENTIALS_PATH=str(config.firebase_credentials_path),
        FIREBASE_WEB_API_KEY=config.firebase_web_api_key,
        GEMINI_API_KEY=config.gemini_api_key,
        OPENROUTER_API_KEY=config.openrouter_api_key,
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
        AI_PROVIDER=config.ai_provider,
        AI_SERVER_URL=config.ai_server_url,
        AI_API_KEY=config.ai_api_key,
    )

    # Configure CORS with regex origins for dev and prod
    CORS(app,
         resources={r"/*": {
             "origins": [
                 "https://zen.arg-server.de",
                 "https://zen-ai-web-app-dir-dev.appwrite.network",
                 r"^https?://localhost(:[0-9]+)?$",
                 r"^https?://127\\.0\\.0\\.1(:[0-9]+)?$",
                 r"^https://.*\\.tailf0b36d\\.ts\\.net$",
                 r"^https://.*\\.appwrite\\.network$",
             ],
             "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
             "allow_headers": ["Content-Type", "Authorization"],
             "expose_headers": ["Content-Type"],
             "supports_credentials": True,
             "max_age": 3600
         }})

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
    app.register_blueprint(search_bp)

    @app.get("/health")
    def health_check() -> dict[str, str]:
        return {"status": "ok"}

    return app
