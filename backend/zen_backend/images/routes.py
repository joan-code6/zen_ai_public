from __future__ import annotations

import logging
import os
import base64
import mimetypes
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
from flask import Blueprint, request, current_app, jsonify
from http import HTTPStatus

from ..ai.openrouter import AIProviderError, generate_image, list_image_generation_models
from ..auth.utils import firebase_user_required
from ..firebase import get_firestore_client
from google.cloud import exceptions as google_exceptions

images_bp = Blueprint("images", __name__, url_prefix="/images")
log = logging.getLogger(__name__)

ALLOWED_SIZES = {"256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"}
ALLOWED_QUALITIES = {"standard", "hd"}
MAX_N = 4


@images_bp.get("/models")
@firebase_user_required
def list_models(uid: str):
    """List available image generation models."""
    api_key = (
        current_app.config.get("AI_API_KEY")
        or current_app.config.get("OPENROUTER_API_KEY")
        or ""
    )
    server_url = current_app.config.get("AI_SERVER_URL")
    models = list_image_generation_models(api_key=api_key or None, server_url=server_url)
    return jsonify({"items": models}), 200


@images_bp.post("/generate")
@firebase_user_required
def generate(uid: str):
    """Generate images from a text prompt using the configured AI provider."""
    body = request.get_json(silent=True) or {}

    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "validation_error", "message": "prompt is required"}), 400

    model = (body.get("model") or "openai/dall-e-3").strip()
    size = (body.get("size") or "1024x1024").strip()
    quality = (body.get("quality") or "standard").strip()
    chat_id = (body.get("chat_id") or "").strip()
    
    try:
        n = int(body.get("n", 1))
    except (ValueError, TypeError):
        n = 1
    n = max(1, min(n, MAX_N))

    if size not in ALLOWED_SIZES:
        return jsonify({"error": "validation_error", "message": f"size must be one of {sorted(ALLOWED_SIZES)}"}), 400

    if quality not in ALLOWED_QUALITIES:
        return jsonify({"error": "validation_error", "message": f"quality must be one of {sorted(ALLOWED_QUALITIES)}"}), 400

    api_key = (
        current_app.config.get("AI_API_KEY")
        or current_app.config.get("OPENROUTER_API_KEY")
        or ""
    )
    if not api_key:
        return jsonify({"error": "configuration_error", "message": "AI API key is not configured"}), 503

    server_url = current_app.config.get("AI_SERVER_URL")

    try:
        images = generate_image(
            prompt=prompt,
            api_key=api_key,
            model=model,
            size=size,
            quality=quality,
            n=n,
            server_url=server_url,
        )
    except AIProviderError as exc:
        log.error(f"Image generation failed: {exc}")
        return jsonify({"error": "generation_error", "message": str(exc)}), 502

    # Get chat reference if chat_id is provided
    chat_ref = None
    if chat_id:
        try:
            db = get_firestore_client()
            chat_ref = db.collection("chats").document(chat_id)
            chat_snapshot = chat_ref.get()
            if not chat_snapshot.exists:
                return jsonify({"error": "not_found", "message": "Chat not found."}), 404
            chat_data = chat_snapshot.to_dict() or {}
            if chat_data.get("uid") != uid:
                return jsonify({"error": "forbidden", "message": "You do not have access to this chat."}), 403
        except google_exceptions.PermissionDenied as exc:
            log.error(f"Firestore permission denied: {exc}")
            return jsonify({"error": "firestore_error", "message": "Permission denied accessing chat."}), 403
        except google_exceptions.GoogleAPICallError as exc:
            log.error(f"Firestore error: {exc}")
            return jsonify({"error": "firestore_error", "message": str(exc)}), 503

    # Save generated images as files
    uploads_dir = current_app.config.get("UPLOADS_DIR", "uploads")
    upload_root = Path(uploads_dir).resolve()
    upload_root.mkdir(parents=True, exist_ok=True)
    
    saved_images = []
    for img in images:
        try:
            # Extract base64 data from data URL if present
            image_data = img.get("url", "")
            if image_data.startswith("data:image/png;base64,"):
                base64_str = image_data.replace("data:image/png;base64,", "")
            else:
                # If it's already a URL, just include it as-is
                saved_images.append({
                    "url": image_data,
                    "revised_prompt": img.get("revised_prompt"),
                })
                continue
            
            # Decode base64 and save as PNG file
            image_binary = base64.b64decode(base64_str)
            file_id = uuid4().hex
            
            # Create chat subdirectory if chat_id is provided
            if chat_ref:
                chat_dir = upload_root / chat_ref.id
                chat_dir.mkdir(parents=True, exist_ok=True)
                destination = chat_dir / f"{file_id}.png"
                storage_path = str(destination.relative_to(upload_root))
            else:
                # Save to root uploads directory if no chat_id
                destination = upload_root / f"{file_id}.png"
                storage_path = f"{file_id}.png"
            
            with open(destination, 'wb') as f:
                f.write(image_binary)
            
            log.info(f"Saved generated image to {destination}")
            
            # Register file with Firestore if chat_ref is available
            if chat_ref:
                now = datetime.now(timezone.utc)
                
                file_data = {
                    "uid": uid,
                    "fileName": f"{file_id}.png",
                    "mimeType": "image/png",
                    "size": len(image_binary),
                    "storagePath": storage_path,
                    "createdAt": now,
                    "textPreview": None,
                }
                
                try:
                    file_ref = chat_ref.collection("files").document(file_id)
                    file_ref.set(file_data)
                    chat_ref.update({"updatedAt": now})
                    log.info(f"Registered generated image with chat {chat_id}: {file_id}")
                except google_exceptions.GoogleAPICallError as exc:
                    log.error(f"Failed to register image with Firestore: {exc}")
                    # Continue anyway - file is saved on disk
            
            saved_images.append({
                "file_id": file_id,
                "filename": f"{file_id}.png",
                "revised_prompt": img.get("revised_prompt"),
            })
        except Exception as exc:
            log.error(f"Failed to save image: {exc}")
            # Fall back to returning the data URL if file save fails
            saved_images.append({
                "url": img.get("url", ""),
                "revised_prompt": img.get("revised_prompt"),
            })

    return jsonify({"images": saved_images, "prompt": prompt}), 200
