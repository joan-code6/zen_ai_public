"""
Chat utilities for managing AI generation metadata, stopping generation, and message operations.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
import uuid

from ..firebase import get_firestore_client
from google.api_core import exceptions as google_exceptions


@dataclass(slots=True)
class GenerationMetadata:
    """Metadata for a generation (AI response)."""
    model: str
    totalTokens: int = 0
    tokensPerSecond: float = 0.0
    timeToFirstToken: float = 0.0  # in milliseconds
    totalCost: float = 0.0
    startedAt: datetime | None = None
    completedAt: datetime | None = None
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "model": self.model,
            "totalTokens": self.totalTokens,
            "tokensPerSecond": self.tokensPerSecond,
            "timeToFirstToken": self.timeToFirstToken,
            "totalCost": self.totalCost,
            "startedAt": self.startedAt.isoformat() if self.startedAt else None,
            "completedAt": self.completedAt.isoformat() if self.completedAt else None,
        }
    
    @staticmethod
    def from_dict(data: dict[str, Any]) -> GenerationMetadata:
        """Create GenerationMetadata from a dictionary."""
        return GenerationMetadata(
            model=data.get("model", ""),
            totalTokens=data.get("totalTokens", 0),
            tokensPerSecond=data.get("tokensPerSecond", 0.0),
            timeToFirstToken=data.get("timeToFirstToken", 0.0),
            totalCost=data.get("totalCost", 0.0),
            startedAt=datetime.fromisoformat(data["startedAt"]) if data.get("startedAt") else None,
            completedAt=datetime.fromisoformat(data["completedAt"]) if data.get("completedAt") else None,
        )


@dataclass(slots=True)
class GenerationSession:
    """Represents an active generation session that can be stopped."""
    sessionId: str
    chatId: str
    messageId: str
    uid: str
    model: str
    createdAt: datetime
    stoppedAt: datetime | None = None
    
    def is_active(self) -> bool:
        return self.stoppedAt is None
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "sessionId": self.sessionId,
            "chatId": self.chatId,
            "messageId": self.messageId,
            "uid": self.uid,
            "model": self.model,
            "createdAt": self.createdAt.isoformat(),
            "stoppedAt": self.stoppedAt.isoformat() if self.stoppedAt else None,
        }


def create_generation_session(
    chat_id: str,
    message_id: str,
    uid: str,
    model: str,
) -> GenerationSession:
    """Create a new generation session."""
    return GenerationSession(
        sessionId=str(uuid.uuid4()),
        chatId=chat_id,
        messageId=message_id,
        uid=uid,
        model=model,
        createdAt=datetime.now(timezone.utc),
    )


def stop_generation(
    uid: str,
    chat_id: str,
    message_id: str,
) -> bool:
    """
    Stop an active generation for a message.
    
    Args:
        uid: User ID
        chat_id: Chat ID
        message_id: Message ID
    
    Returns:
        True if generation was stopped, False if not found
    """
    db = get_firestore_client()
    chat_ref = db.collection("chats").document(chat_id)
    messages_ref = chat_ref.collection("messages")
    
    try:
        message_ref = messages_ref.document(message_id)
        message_doc = message_ref.get()
        
        if not message_doc.exists:
            return False
        
        message_data = message_doc.to_dict() or {}
        
        # Verify ownership
        if message_data.get("uid") != uid:
            return False
        
        # Mark as stopped by setting a generation stopped flag
        message_ref.update({
            "generationStopped": True,
            "stoppedAt": datetime.now(timezone.utc),
        })
        
        return True
    except google_exceptions.GoogleAPICallError:
        return False


def edit_message(
    uid: str,
    chat_id: str,
    message_id: str,
    new_content: str,
) -> bool:
    """
    Edit a user message.
    
    Args:
        uid: User ID
        chat_id: Chat ID
        message_id: Message ID
        new_content: New message content
    
    Returns:
        True if message was edited, False otherwise
    """
    if not new_content or not new_content.strip():
        return False
    
    db = get_firestore_client()
    chat_ref = db.collection("chats").document(chat_id)
    messages_ref = chat_ref.collection("messages")
    
    try:
        message_ref = messages_ref.document(message_id)
        message_doc = message_ref.get()
        
        if not message_doc.exists:
            return False
        
        message_data = message_doc.to_dict() or {}
        
        # Only allow editing user messages
        if message_data.get("role") != "user" or message_data.get("uid") != uid:
            return False
        
        # Update the message
        message_ref.update({
            "content": new_content.strip(),
            "editedAt": datetime.now(timezone.utc),
        })
        
        return True
    except google_exceptions.GoogleAPICallError:
        return False


def add_message_metadata(
    uid: str,
    chat_id: str,
    message_id: str,
    metadata: GenerationMetadata,
) -> bool:
    """
    Add metadata to an assistant message.
    
    Args:
        uid: User ID
        chat_id: Chat ID
        message_id: Message ID
        metadata: Generation metadata
    
    Returns:
        True if metadata was added, False otherwise
    """
    db = get_firestore_client()
    chat_ref = db.collection("chats").document(chat_id)
    messages_ref = chat_ref.collection("messages")
    
    try:
        message_ref = messages_ref.document(message_id)
        message_doc = message_ref.get()
        
        if not message_doc.exists:
            return False
        
        message_ref.update({
            "metadata": metadata.to_dict(),
        })
        
        return True
    except google_exceptions.GoogleAPICallError:
        return False


def get_message(
    uid: str,
    chat_id: str,
    message_id: str,
) -> dict[str, Any] | None:
    """
    Get a message from a chat.
    
    Args:
        uid: User ID (for authorization check)
        chat_id: Chat ID
        message_id: Message ID
    
    Returns:
        Message data or None if not found/unauthorized
    """
    db = get_firestore_client()
    chat_ref = db.collection("chats").document(chat_id)
    
    try:
        # Check if user has access to the chat
        chat_doc = chat_ref.get()
        if not chat_doc.exists:
            return None
        
        chat_data = chat_doc.to_dict() or {}
        if chat_data.get("uid") != uid:
            return None
        
        # Get the message
        message_ref = chat_ref.collection("messages").document(message_id)
        message_doc = message_ref.get()
        
        if not message_doc.exists:
            return None
        
        return {
            "id": message_id,
            **message_doc.to_dict()
        }
    except google_exceptions.GoogleAPICallError:
        return None


def delete_message(
    uid: str,
    chat_id: str,
    message_id: str,
) -> bool:
    """
    Delete a message from a chat.
    
    Args:
        uid: User ID
        chat_id: Chat ID
        message_id: Message ID
    
    Returns:
        True if message was deleted, False otherwise
    """
    db = get_firestore_client()
    chat_ref = db.collection("chats").document(chat_id)
    messages_ref = chat_ref.collection("messages")
    
    try:
        message_ref = messages_ref.document(message_id)
        message_doc = message_ref.get()
        
        if not message_doc.exists:
            return False
        
        message_data = message_doc.to_dict() or {}
        
        # Verify ownership (for user messages)
        if message_data.get("uid") != uid:
            return False
        
        message_ref.delete()
        return True
    except google_exceptions.GoogleAPICallError:
        return False
