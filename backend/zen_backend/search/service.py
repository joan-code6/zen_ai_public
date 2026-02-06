from __future__ import annotations

from typing import Any
from datetime import datetime

from ..firebase import get_firestore_client
from ..auth.utils import require_firebase_user, AuthError


def fuzzy_search(query: str, text: str) -> float:
    """
    Calculate fuzzy match score for a query against text.
    Returns a score between 0 and 1, where 1 is perfect match.
    """
    if not text:
        return 0.0
    
    query = query.lower()
    text_lower = text.lower()
    
    # Exact match
    if query == text_lower:
        return 1.0
    
    # Starts with
    if text_lower.startswith(query):
        return 0.8
    
    # Contains
    if query in text_lower:
        return 0.6
    
    # Word matching
    query_words = set(query.split())
    text_words = set(text_lower.split())
    
    if query_words:
        intersection = query_words & text_words
        if intersection:
            return 0.4 + (len(intersection) / len(query_words)) * 0.3
    
    return 0.0


async def search_all(
    uid: str,
    query: str,
    types: list[str] | None = None,
    limit: int = 20
) -> dict[str, Any]:
    """
    Search across all user data types (chats, emails, calendar events, notes).
    """
    if not query or not uid:
        return {"results": [], "total": 0}
    
    db = get_firestore_client()
    results = []
    query_lower = query.lower()
    
    # Determine which types to search
    search_chats = types is None or "chat" in types
    search_emails = types is None or "email" in types
    search_calendar = types is None or "calendar" in types
    search_notes = types is None or "note" in types
    
    # Search chats
    if search_chats:
        try:
            chats_ref = db.collection("chats").where("uid", "==", uid).stream()
            for chat_doc in chats_ref:
                chat = chat_doc.to_dict()
                chat["id"] = chat_doc.id
                title = chat.get("title", "") or ""
                score = fuzzy_search(query, title)
                
                if score > 0:
                    results.append({
                        "type": "chat",
                        "id": chat_doc.id,
                        "title": title or "Untitled Chat",
                        "preview": title[:80],
                        "url": f"/chat/{chat_doc.id}",
                        "createdAt": chat.get("createdAt", ""),
                        "metadata": {
                            "chatId": chat_doc.id
                        },
                        "_score": score
                    })
        except Exception as e:
            print(f"Error searching chats: {e}")
    
    # Search notes
    if search_notes:
        try:
            notes_ref = db.collection("notes").where("uid", "==", uid).stream()
            for note_doc in notes_ref:
                note = note_doc.to_dict()
                note["id"] = note_doc.id
                title = note.get("title", "") or ""
                content = note.get("content", "") or ""
                
                # Calculate combined score
                title_score = fuzzy_search(query, title)
                content_score = fuzzy_search(query, content)
                score = max(title_score, content_score)
                
                if score > 0:
                    preview = content or title
                    results.append({
                        "type": "note",
                        "id": note_doc.id,
                        "title": title or "Untitled Note",
                        "preview": preview[:80],
                        "url": f"/notes/{note_doc.id}",
                        "createdAt": note.get("updatedAt", ""),
                        "metadata": {},
                        "_score": score
                    })
        except Exception as e:
            print(f"Error searching notes: {e}")
    
    # Search calendar events (from stored Google data)
    if search_calendar:
        try:
            events_ref = db.collection("calendar_events").where("uid", "==", uid).stream()
            now = datetime.now()
            for event_doc in events_ref:
                event = event_doc.to_dict()
                summary = event.get("summary", "") or ""
                description = event.get("description", "") or ""
                
                # Calculate combined score
                summary_score = fuzzy_search(query, summary)
                desc_score = fuzzy_search(query, description)
                score = summary_score * 0.8 + desc_score * 0.2
                
                if score > 0.1:
                    start_date = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date")
                    
                    results.append({
                        "type": "calendar",
                        "id": event_doc.id,
                        "title": summary or "Untitled Event",
                        "preview": (description[:60] if description else "No description") + "...",
                        "url": f"/calendar/event/{event_doc.id}",
                        "createdAt": start_date or "",
                        "metadata": {
                            "date": start_date or ""
                        },
                        "_score": score
                    })
        except Exception as e:
            print(f"Error searching calendar: {e}")
    
    # Search emails (from stored email data)
    if search_emails:
        try:
            emails_ref = db.collection("emails").where("uid", "==", uid).stream()
            for email_doc in emails_ref:
                email = email_doc.to_dict()
                email["id"] = email_doc.id
                subject = email.get("subject", "") or ""
                snippet = email.get("snippet", "")
                from_addr = email.get("from", "")
                
                # Calculate combined score
                subject_score = fuzzy_search(query, subject)
                from_score = fuzzy_search(query, from_addr)
                score = max(subject_score, from_score)
                
                if score > 0:
                    email_date = email.get("date", "")
                    results.append({
                        "type": "email",
                        "id": email_doc.id,
                        "title": subject or f"Email from {from_addr[:30]}",
                        "preview": (snippet[:80] if snippet else "") + "...",
                        "url": f"/email/{email_doc.id}",
                        "createdAt": email_date,
                        "metadata": {
                            "messageId": email_doc.id,
                            "from": from_addr
                        },
                        "_score": score
                    })
        except Exception as e:
            print(f"Error searching emails: {e}")
    
    # Sort by relevance score and date
    results.sort(key=lambda x: (-x.get("_score", 0), x.get("createdAt", "")))
    
    # Remove _score from final results
    final_results = [
        {k: v for k, v in result.items() if k != "_score"}
        for result in results[:limit]
    ]
    
    return {
        "results": final_results,
        "total": len(results)
    }


class SearchServiceError(Exception):
    pass
