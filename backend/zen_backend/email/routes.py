from __future__ import annotations

from functools import wraps
from http import HTTPStatus
from typing import Any

from flask import Blueprint, current_app, jsonify, request

from ..auth.utils import AuthError, require_firebase_user
from .service import (
    EmailError,
    GmailConfig,
    GmailService,
    GmailTokens,
    ImapConfig,
    ImapService,
    SmtpConfig,
    SmtpService,
)

email_bp = Blueprint("email", __name__, url_prefix="/email")


def _build_gmail_service() -> GmailService:
    config = GmailConfig(
        client_id=current_app.config.get("GOOGLE_CLIENT_ID"),
        client_secret=current_app.config.get("GOOGLE_CLIENT_SECRET"),
        scopes=tuple(current_app.config.get("GOOGLE_GMAIL_SCOPES") or ()),
    )
    return GmailService(config=config)


def _email_endpoint(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except AuthError as exc:
            return exc.to_response()
        except EmailError as exc:
            return jsonify({"error": exc.code, "message": str(exc)}), exc.status

    return wrapper


def _serialize_gmail_connection(record: GmailTokens | None) -> dict[str, Any]:
    if record is None:
        return {
            "connected": False,
            "provider": "gmail",
            "scopes": [],
        }
    return {
        "connected": True,
        "provider": "gmail",
        "scopes": list(record.scope),
        "expiresAt": record.expires_at.isoformat() if record.expires_at else None,
        "tokenType": record.token_type,
        "hasRefreshToken": bool(record.refresh_token),
    }


def _serialize_imap_connection(config: ImapConfig | None) -> dict[str, Any]:
    if config is None:
        return {
            "connected": False,
            "provider": "imap",
        }
    return {
        "connected": True,
        "provider": "imap",
        "email": config.email,
        "host": config.host,
        "port": config.port,
        "useSsl": config.use_ssl,
    }


def _serialize_smtp_connection(config: SmtpConfig | None) -> dict[str, Any]:
    if config is None:
        return {
            "connected": False,
            "provider": "smtp",
        }
    return {
        "connected": True,
        "provider": "smtp",
        "email": config.email,
        "host": config.host,
        "port": config.port,
        "useTls": config.use_tls,
    }


@email_bp.get("/providers")
@_email_endpoint
def get_providers():
    return jsonify({"providers": ["gmail", "imap", "smtp"]}), HTTPStatus.OK


@email_bp.get("/accounts")
@_email_endpoint
def get_accounts():
    auth_ctx = require_firebase_user()

    gmail_service = _build_gmail_service()
    gmail_connection = gmail_service.get_connection_state(auth_ctx.uid)

    imap_service = ImapService()
    smtp_service = SmtpService()

    imap_connection = None
    smtp_connection = None

    try:
        imap_connection = imap_service._store.load_imap_credentials(auth_ctx.uid)
        imap_connection = _serialize_imap_connection(imap_connection)
    except EmailError:
        pass

    try:
        smtp_connection = smtp_service._store.load_smtp_credentials(auth_ctx.uid)
        smtp_connection = _serialize_smtp_connection(smtp_connection)
    except EmailError:
        pass

    accounts = [_serialize_gmail_connection(gmail_connection)]
    if imap_connection and imap_connection["connected"]:
        accounts.append(imap_connection)
    if smtp_connection and smtp_connection["connected"]:
        accounts.append(smtp_connection)

    return jsonify({"accounts": accounts}), HTTPStatus.OK


@email_bp.get("/gmail/auth-url")
@_email_endpoint
def get_gmail_auth_url():
    redirect_uri = (request.args.get("redirectUri") or "").strip()
    state = request.args.get("state")
    code_challenge = request.args.get("codeChallenge")
    code_challenge_method = request.args.get("codeChallengeMethod", "S256")
    access_type = request.args.get("accessType", "offline")
    prompt = request.args.get("prompt", "consent")

    service = _build_gmail_service()
    url = service.build_authorization_url(
        redirect_uri=redirect_uri,
        state=state,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        access_type=access_type,
        prompt=prompt,
    )
    return jsonify({"authorizationUrl": url, "scopes": service.scopes})


@email_bp.post("/gmail/exchange")
@_email_endpoint
def exchange_gmail_code():
    import logging
    log = logging.getLogger(__name__)
    payload = request.get_json(silent=True) or {}
    code = payload.get("code")
    redirect_uri = payload.get("redirectUri")
    code_verifier = payload.get("codeVerifier")

    auth_ctx = require_firebase_user()
    service = _build_gmail_service()
    record = service.exchange_code(
        auth_ctx.uid,
        code=code,
        redirect_uri=redirect_uri,
        code_verifier=code_verifier,
    )
    
    try:
        # Enable email polling for this user
        from ..firebase import get_firestore_client
        from firebase_admin import firestore as firebase_firestore
        
        poll_collection = get_firestore_client().collection("emailPoll")
        poll_collection.document(auth_ctx.uid).set({
            "enabled": True,
            "interval": 300,
            "gmail_client_id": current_app.config.get("GOOGLE_CLIENT_ID"),
            "gmail_client_secret": current_app.config.get("GOOGLE_CLIENT_SECRET"),
            "gmail_scopes": current_app.config.get("GOOGLE_GMAIL_SCOPES"),
            "lastPollAt": firebase_firestore.SERVER_TIMESTAMP,
        }, merge=True)
        log.info(f"Enabled email polling for user {auth_ctx.uid}")
    except Exception as e:
        log.error(f"Failed to enable email polling: {e}")
    
    # Register Gmail push notification
    try:
        from .webhook_manager import WebhookManager, WebhookSubscription
        from datetime import datetime, timedelta, timezone
        
        # Get Pub/Sub topic from config
        topic_name = current_app.config.get("GMAIL_PUBSUB_TOPIC")
        
        if topic_name:
            # Register watch with Gmail API
            watch_response = service.watch_mailbox(
                auth_ctx.uid,
                topic_name=topic_name,
            )
            
            history_id = watch_response.get("historyId")
            expiration = watch_response.get("expiration")  # Unix timestamp in milliseconds
            
            # Calculate expiry datetime
            if expiration:
                expires_at = datetime.fromtimestamp(int(expiration) / 1000, tz=timezone.utc)
            else:
                # Default to 7 days if not provided
                expires_at = datetime.now(timezone.utc) + timedelta(days=7)
            
            # Save subscription
            webhook_manager = WebhookManager()
            subscription = WebhookSubscription(
                uid=auth_ctx.uid,
                provider="gmail",
                subscription_id=history_id,
                topic_name=topic_name,
                expires_at=expires_at,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
                status="active",
            )
            webhook_manager.save_subscription(subscription)
            
            log.info(f"Registered Gmail push notification for user {auth_ctx.uid}")
        else:
            log.warning("GMAIL_PUBSUB_TOPIC not configured, skipping webhook registration")
    except Exception as e:
        log.error(f"Failed to register Gmail webhook: {e}")
    
    return jsonify(_serialize_gmail_connection(record)), HTTPStatus.OK


@email_bp.get("/gmail/connection")
@_email_endpoint
def get_gmail_connection():
    auth_ctx = require_firebase_user()
    service = _build_gmail_service()
    record = service.get_connection_state(auth_ctx.uid)
    return jsonify(_serialize_gmail_connection(record)), HTTPStatus.OK


@email_bp.delete("/gmail/connection")
@_email_endpoint
def delete_gmail_connection():
    import logging
    log = logging.getLogger(__name__)
    auth_ctx = require_firebase_user()
    service = _build_gmail_service()
    
    # Stop Gmail push notifications
    try:
        service.stop_watch(auth_ctx.uid)
        log.info(f"Stopped Gmail watch for user {auth_ctx.uid}")
    except Exception as e:
        log.warning(f"Failed to stop Gmail watch: {e}")
    
    # Delete webhook subscription
    try:
        from .webhook_manager import WebhookManager
        webhook_manager = WebhookManager()
        webhook_manager.delete_subscription(auth_ctx.uid, "gmail")
    except Exception as e:
        log.warning(f"Failed to delete Gmail webhook subscription: {e}")
    
    service.revoke_connection(auth_ctx.uid)
    return ("", HTTPStatus.NO_CONTENT)


@email_bp.get("/gmail/messages")
@_email_endpoint
def list_gmail_messages():
    auth_ctx = require_firebase_user()
    service = _build_gmail_service()

    query = request.args.get("q")
    max_results = request.args.get("maxResults")
    page_token = request.args.get("pageToken")

    max_results_int: int | None
    if max_results is None:
        max_results_int = None
    else:
        try:
            max_results_int = int(max_results)
        except ValueError:
            raise EmailError("maxResults must be numeric", code="invalid_request")

    messages = service.list_messages(
        auth_ctx.uid,
        query=query,
        max_results=max_results_int,
        page_token=page_token,
    )
    return jsonify(messages), HTTPStatus.OK


@email_bp.get("/gmail/messages/<message_id>")
@_email_endpoint
def get_gmail_message(message_id: str):
    auth_ctx = require_firebase_user()
    service = _build_gmail_service()
    message = service.get_message(auth_ctx.uid, message_id)
    return jsonify(message), HTTPStatus.OK


@email_bp.post("/gmail/messages")
@_email_endpoint
def send_gmail_message():
    auth_ctx = require_firebase_user()
    payload = request.get_json(silent=True) or {}

    to = payload.get("to")
    subject = payload.get("subject")
    body = payload.get("body")
    from_email = payload.get("from")

    service = _build_gmail_service()
    result = service.send_message(
        auth_ctx.uid,
        to=to,
        subject=subject,
        body=body,
        from_email=from_email,
    )
    return jsonify(result), HTTPStatus.OK


@email_bp.post("/imap/connect")
@_email_endpoint
def connect_imap():
    auth_ctx = require_firebase_user()
    payload = request.get_json(silent=True) or {}

    host = payload.get("host")
    port = payload.get("port")
    use_ssl = payload.get("useSsl", True)
    email = payload.get("email")
    password = payload.get("password")

    if not all([host, port, email, password]):
        raise EmailError("host, port, email, and password are required", code="invalid_request")

    try:
        port_int = int(port)
    except ValueError:
        raise EmailError("port must be a number", code="invalid_request")

    config = ImapConfig(
        host=host,
        port=port_int,
        use_ssl=bool(use_ssl),
        email=email,
        password=password,
    )

    service = ImapService()

    try:
        mail = service.connect_imap(auth_ctx.uid)
        mail.select()
        mail.close()
        mail.logout()
    except Exception as exc:
        raise EmailError(f"IMAP connection test failed: {exc}", code="connection_failed") from exc

    service._store.save_imap_credentials(auth_ctx.uid, config)
    
    # Enable email polling for this user
    from ..firebase import get_firestore_client
    from firebase_admin import firestore as firebase_firestore
    
    poll_collection = get_firestore_client().collection("emailPoll")
    poll_collection.document(auth_ctx.uid).set({
        "enabled": True,
        "interval": 300,
        "lastPollAt": firebase_firestore.SERVER_TIMESTAMP,
    }, merge=True)
    
    # Start IMAP IDLE if supported
    try:
        from .imap_idle import get_imap_idle_manager
        from .webhook_manager import WebhookManager, WebhookSubscription
        from datetime import datetime, timezone
        import logging
        
        log = logging.getLogger(__name__)
        
        # Start IMAP IDLE connection
        idle_manager = get_imap_idle_manager()
        idle_manager.start_idle(auth_ctx.uid)
        
        # Save webhook subscription record
        webhook_manager = WebhookManager()
        subscription = WebhookSubscription(
            uid=auth_ctx.uid,
            provider="imap",
            subscription_id=None,  # IMAP doesn't use subscription IDs
            topic_name=None,
            expires_at=None,  # IMAP IDLE doesn't expire
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            status="active",
        )
        webhook_manager.save_subscription(subscription)
        
        log.info(f"Started IMAP IDLE for user {auth_ctx.uid}")
    except Exception as e:
        import logging
        log = logging.getLogger(__name__)
        log.error(f"Failed to start IMAP IDLE: {e}")
    
    return jsonify(_serialize_imap_connection(config)), HTTPStatus.OK


@email_bp.get("/imap/connection")
@_email_endpoint
def get_imap_connection():
    auth_ctx = require_firebase_user()
    service = ImapService()
    try:
        config = service._store.load_imap_credentials(auth_ctx.uid)
        return jsonify(_serialize_imap_connection(config)), HTTPStatus.OK
    except EmailError as exc:
        if exc.code == "email_auth_error":
            return jsonify(_serialize_imap_connection(None)), HTTPStatus.OK
        raise


@email_bp.delete("/imap/connection")
@_email_endpoint
def delete_imap_connection():
    import logging
    log = logging.getLogger(__name__)
    auth_ctx = require_firebase_user()
    service = ImapService()
    
    # Stop IMAP IDLE
    try:
        from .imap_idle import get_imap_idle_manager
        idle_manager = get_imap_idle_manager()
        idle_manager.stop_idle(auth_ctx.uid)
        log.info(f"Stopped IMAP IDLE for user {auth_ctx.uid}")
    except Exception as e:
        log.warning(f"Failed to stop IMAP IDLE: {e}")
    
    # Delete webhook subscription
    try:
        from .webhook_manager import WebhookManager
        webhook_manager = WebhookManager()
        webhook_manager.delete_subscription(auth_ctx.uid, "imap")
    except Exception as e:
        log.warning(f"Failed to delete IMAP webhook subscription: {e}")
    
    service.delete_connection(auth_ctx.uid)
    return ("", HTTPStatus.NO_CONTENT)


@email_bp.get("/imap/messages")
@_email_endpoint
def list_imap_messages():
    auth_ctx = require_firebase_user()
    service = ImapService()

    folder = request.args.get("folder", "INBOX")
    max_results = request.args.get("maxResults")
    search_criteria = request.args.get("searchCriteria")

    max_results_int: int | None
    if max_results is None:
        max_results_int = None
    else:
        try:
            max_results_int = int(max_results)
        except ValueError:
            raise EmailError("maxResults must be numeric", code="invalid_request")

    messages = service.list_messages(
        auth_ctx.uid,
        folder=folder,
        max_results=max_results_int,
        search_criteria=search_criteria,
    )
    return jsonify({"messages": messages}), HTTPStatus.OK


@email_bp.get("/imap/messages/<message_id>")
@_email_endpoint
def get_imap_message(message_id: str):
    auth_ctx = require_firebase_user()
    service = ImapService()

    folder = request.args.get("folder", "INBOX")

    message = service.get_message(auth_ctx.uid, message_id, folder=folder)
    return jsonify(message), HTTPStatus.OK


@email_bp.post("/smtp/connect")
@_email_endpoint
def connect_smtp():
    auth_ctx = require_firebase_user()
    payload = request.get_json(silent=True) or {}

    host = payload.get("host")
    port = payload.get("port")
    use_tls = payload.get("useTls", True)
    email = payload.get("email")
    password = payload.get("password")

    if not all([host, port, email, password]):
        raise EmailError("host, port, email, and password are required", code="invalid_request")

    try:
        port_int = int(port)
    except ValueError:
        raise EmailError("port must be a number", code="invalid_request")

    config = SmtpConfig(
        host=host,
        port=port_int,
        use_tls=bool(use_tls),
        email=email,
        password=password,
    )

    service = SmtpService()

    try:
        mail = service.connect_smtp(auth_ctx.uid)
        mail.quit()
    except Exception as exc:
        raise EmailError(f"SMTP connection test failed: {exc}", code="connection_failed") from exc

    service._store.save_smtp_credentials(auth_ctx.uid, config)
    return jsonify(_serialize_smtp_connection(config)), HTTPStatus.OK


@email_bp.get("/smtp/connection")
@_email_endpoint
def get_smtp_connection():
    auth_ctx = require_firebase_user()
    service = SmtpService()
    try:
        config = service._store.load_smtp_credentials(auth_ctx.uid)
        return jsonify(_serialize_smtp_connection(config)), HTTPStatus.OK
    except EmailError as exc:
        if exc.code == "email_auth_error":
            return jsonify(_serialize_smtp_connection(None)), HTTPStatus.OK
        raise


@email_bp.delete("/smtp/connection")
@_email_endpoint
def delete_smtp_connection():
    auth_ctx = require_firebase_user()
    service = SmtpService()
    service.delete_connection(auth_ctx.uid)
    return ("", HTTPStatus.NO_CONTENT)


@email_bp.post("/smtp/send")
@_email_endpoint
def send_smtp_email():
    auth_ctx = require_firebase_user()
    payload = request.get_json(silent=True) or {}

    to = payload.get("to")
    subject = payload.get("subject")
    body = payload.get("body")
    from_email = payload.get("from")

    service = SmtpService()
    result = service.send_email(
        auth_ctx.uid,
        to=to,
        subject=subject,
        body=body,
        from_email=from_email,
    )
    return jsonify(result), HTTPStatus.OK


@email_bp.post("/poll")
@_email_endpoint
def poll_emails():
    payload = request.get_json(silent=True) or {}
    user_id = payload.get("userId")
    if not user_id:
        raise EmailError("userId is required", code="invalid_request")

    max_results = request.args.get("maxResults", 50)
    try:
        max_results_int = int(max_results)
    except ValueError:
        raise EmailError("maxResults must be numeric", code="invalid_request")

    all_messages = []

    # Poll Gmail if connected
    gmail_service = _build_gmail_service()
    gmail_connection = gmail_service.get_connection_state(user_id)
    if gmail_connection:
        try:
            gmail_messages = gmail_service.list_messages(
                user_id,
                max_results=max_results_int,
            )
            for msg in gmail_messages.get("messages", []):
                msg["provider"] = "gmail"
                all_messages.append(msg)
        except Exception as e:
            current_app.logger.warning(f"Failed to poll Gmail for user {user_id}: {e}")

    # Poll IMAP if connected
    imap_service = ImapService()
    try:
        imap_config = imap_service._store.load_imap_credentials(user_id)
        if imap_config:
            imap_messages = imap_service.list_messages(
                user_id,
                max_results=max_results_int,
            )
            for msg in imap_messages:
                msg["provider"] = "imap"
                all_messages.append(msg)
    except Exception as e:
        current_app.logger.warning(f"Failed to poll IMAP for user {user_id}: {e}")

    # Sort messages by date, most recent first
    all_messages.sort(key=lambda x: x.get("date", ""), reverse=True)

    return jsonify({"new_emails": all_messages}), HTTPStatus.OK


@email_bp.post("/webhooks/gmail")
def gmail_webhook():
    """
    Receive Gmail push notifications from Google Cloud Pub/Sub.
    
    This endpoint receives notifications when new emails arrive in a watched mailbox.
    Google Cloud Pub/Sub sends notifications in a specific format with the message data.
    """
    import base64
    import json
    
    try:
        envelope = request.get_json()
        if not envelope:
            current_app.logger.warning("Gmail webhook received empty payload")
            return ("", HTTPStatus.NO_CONTENT)

        # Extract Pub/Sub message
        message = envelope.get("message")
        if not message:
            current_app.logger.warning("Gmail webhook missing message field")
            return ("", HTTPStatus.NO_CONTENT)

        # Decode the data
        data_b64 = message.get("data")
        if data_b64:
            data_json = base64.b64decode(data_b64).decode("utf-8")
            notification_data = json.loads(data_json)
        else:
            notification_data = {}

        email_address = notification_data.get("emailAddress")
        history_id = notification_data.get("historyId")

        current_app.logger.info(
            f"Gmail webhook notification: email={email_address}, historyId={history_id}"
        )

        if not email_address or not history_id:
            current_app.logger.warning("Gmail webhook missing required fields")
            return ("", HTTPStatus.NO_CONTENT)

        # Process the notification asynchronously
        from .webhook_processor import process_gmail_notification
        process_gmail_notification(email_address, history_id)

        return ("", HTTPStatus.NO_CONTENT)

    except Exception as exc:
        current_app.logger.error(f"Error processing Gmail webhook: {exc}", exc_info=True)
        # Return 200 to prevent Pub/Sub from retrying
        return ("", HTTPStatus.OK)

