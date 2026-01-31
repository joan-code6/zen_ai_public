#!/usr/bin/env python3
"""
A redesigned TUI for Zen AI (v2).
Features (initial):
- Login screen (email/password)
- Main workspace with three columns: Chats, Messages, Notes
- Load chats, open chat to view messages, send messages
- Notes list with view/create/edit/delete

This is a focused, self-contained replacement file. It uses threaded workers for network calls
and schedules UI updates on the main thread via self.app.call_from_thread.
"""
import json
import os
import requests
from typing import Optional
from datetime import datetime

from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.screen import Screen
from textual.widgets import Button, Footer, Header, Input, Label, ListItem, ListView, Static
from textual import work

BASE_URL = "https://raspberrypi.tailf0b36d.ts.net"
TOKEN_FILE = os.path.expanduser("~/.zen_ai_cli_token")

# --- token helpers ---

def save_token(token_data):
    with open(TOKEN_FILE, "w") as f:
        json.dump(token_data, f)


def load_token():
    if not os.path.exists(TOKEN_FILE):
        return None
    try:
        with open(TOKEN_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return None


def get_headers():
    token_data = load_token()
    if not token_data or "idToken" not in token_data:
        return None
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token_data['idToken']}"
    }


def get_uid():
    token_data = load_token()
    if not token_data or "localId" not in token_data:
        return None
    return token_data["localId"]

# --- UI Components ---

class LoginScreen(Screen):
    def compose(self) -> ComposeResult:
        yield Header("Zen AI — Login")
        yield Container(
            Label("Email:"),
            Input(placeholder="Email", id="email"),
            Label("Password:"),
            Input(placeholder="Password", password=True, id="password"),
            Button("Login", id="login-btn"),
            Label("", id="login-error"),
        )
        yield Footer()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "login-btn":
            self.perform_login()

    @work(thread=True, exclusive=True)
    def perform_login(self) -> None:
        email = self.query_one("#email", Input).value
        password = self.query_one("#password", Input).value
        err = self.query_one("#login-error", Label)
        if not email or not password:
            self.app.call_from_thread(lambda: err.update("Enter email and password"))
            return
        try:
            resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
            resp.raise_for_status()
            data = resp.json()
            def _on_success():
                save_token(data)
                self.app.push_screen("workspace")
            self.app.call_from_thread(_on_success)
        except Exception as e:
            self.app.call_from_thread(lambda: err.update(f"Login failed: {e}"))


class ChatList(Static):
    def compose(self) -> ComposeResult:
        yield Label("Chats", id="chats-title")
        yield ListView(id="chats-list")
        yield Button("New Chat", id="new-chat")


class NotesPane(Static):
    def compose(self) -> ComposeResult:
        yield Label("Notes", id="notes-title")
        yield ListView(id="notes-list")
        yield Button("New Note", id="new-note")


class MessageView(Static):
    def compose(self) -> ComposeResult:
        yield Label("Messages", id="messages-title")
        yield ScrollableContainer(id="messages-container")
        yield Container(Input(placeholder="Type message...", id="message-input"), Button("Send", id="send-btn"))


class WorkspaceScreen(Screen):
    BINDINGS = [("q", "quit", "Quit")]

    def compose(self) -> ComposeResult:
        yield Header("Zen AI — Workspace")
        with Horizontal():
            yield ChatList(id="left")
            yield MessageView(id="center")
            yield NotesPane(id="right")
        yield Footer()

    def on_mount(self) -> None:
        # Kick off initial loads
        self.load_chats()
        self.load_notes()

    # --- Chats ---
    @work(thread=True)
    def load_chats(self) -> None:
        headers = get_headers()
        uid = get_uid()
        if not headers or not uid:
            self.app.call_from_thread(lambda: self.app.push_screen("login"))
            return
        try:
            resp = requests.get(f"{BASE_URL}/chats", params={"uid": uid}, headers=headers)
            resp.raise_for_status()
            chats = resp.json().get("items", [])
            def _update():
                lv = self.query_one("#chats-list", ListView)
                lv.clear()
                for c in chats:
                    title = c.get("title") or "Untitled"
                    item = ListItem(Label(f"{title} — {c.get('updatedAt','')[:19]}"), id=f"chat-{c.get('id')}")
                    item.chat_obj = c
                    lv.append(item)
            self.app.call_from_thread(_update)
        except Exception as e:
            self.app.call_from_thread(lambda: self.app.notify(f"Error loading chats: {e}", severity="error"))

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if event.list_view.id == "chats-list":
            item = event.item
            if hasattr(item, "chat_obj"):
                chat = item.chat_obj
                self.open_chat(chat)
        elif event.list_view.id == "notes-list":
            item = event.item
            if hasattr(item, "note_obj"):
                note = item.note_obj
                self.open_note(note)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "new-chat":
            self.create_chat()
        elif event.button.id == "new-note":
            self.create_note()
        elif event.button.id == "send-btn":
            msg = self.query_one("#message-input", Input).value
            if msg.strip():
                self.send_message(msg)
                self.query_one("#message-input", Input).value = ""

    def open_chat(self, chat_obj: dict) -> None:
        self.current_chat = chat_obj
        self.load_messages(chat_obj.get("id"))

    @work(thread=True)
    def load_messages(self, chat_id: str) -> None:
        headers = get_headers()
        uid = get_uid()
        if not headers or not uid:
            self.app.call_from_thread(lambda: self.app.push_screen("login"))
            return
        try:
            resp = requests.get(f"{BASE_URL}/chats/{chat_id}", params={"uid": uid}, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            messages = data.get("messages", [])
            chat_meta = data.get("chat", {})
            def _update():
                container = self.query_one("#messages-container")
                container.remove_children()
                title = self.query_one("#messages-title", Label)
                title.update(f"Messages — {chat_meta.get('title','')} ({chat_id})")
                for m in messages:
                    role = m.get("role","user")
                    content = m.get("content","")
                    ts = m.get("createdAt","")
                    container.mount(Static(f"[{role}] {ts[:19]}\n{content}", expand=False))
                container.scroll_end(animate=False)
            self.app.call_from_thread(_update)
        except Exception as e:
            self.app.call_from_thread(lambda: self.app.notify(f"Error loading messages: {e}", severity="error"))

    @work(thread=True)
    def send_message(self, content: str) -> None:
        if not hasattr(self, "current_chat"):
            self.app.call_from_thread(lambda: self.app.notify("Open a chat first", severity="warning"))
            return
        headers = get_headers()
        uid = get_uid()
        if not headers or not uid:
            self.app.call_from_thread(lambda: self.app.push_screen("login"))
            return
        chat_id = self.current_chat.get("id")
        # mount user message immediately
        def _mount_user():
            container = self.query_one("#messages-container")
            container.mount(Static(f"[user] {datetime.utcnow().isoformat()}\n{content}"))
            container.scroll_end()
        self.app.call_from_thread(_mount_user)
        try:
            resp = requests.post(f"{BASE_URL}/chats/{chat_id}/messages", json={"uid": uid, "content": content, "role": "user"}, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            asst = data.get("assistantMessage")
            if asst:
                def _mount_assistant():
                    container = self.query_one("#messages-container")
                    container.mount(Static(f"[assistant] {asst.get('createdAt','')}\n{asst.get('content','')}"))
                    container.scroll_end()
                self.app.call_from_thread(_mount_assistant)
        except Exception as e:
            self.app.call_from_thread(lambda: self.app.notify(f"Error sending message: {e}", severity="error"))

    # --- Notes ---
    @work(thread=True)
    def load_notes(self) -> None:
        headers = get_headers()
        uid = get_uid()
        if not headers or not uid:
            return
        try:
            resp = requests.get(f"{BASE_URL}/notes", params={"uid": uid}, headers=headers)
            resp.raise_for_status()
            items = resp.json().get("items", [])
            def _update():
                lv = self.query_one("#notes-list", ListView)
                lv.clear()
                for n in items:
                    title = n.get("title") or "New note"
                    item = ListItem(Label(f"{title} — {n.get('updatedAt','')[:19]}"))
                    item.note_obj = n
                    lv.append(item)
            self.app.call_from_thread(_update)
        except Exception as e:
            self.app.call_from_thread(lambda: self.app.notify(f"Error loading notes: {e}", severity="error"))

    def open_note(self, note_obj: dict) -> None:
        # show note content in a popup-like area (quick inline)
        note = note_obj
        def _show():
            from textual.widgets import Modal
            modal = Static(f"Title: {note.get('title')}\n\n{note.get('content','')}")
            self.mount(modal)
        _show()

    def create_chat(self) -> None:
        # open a simple input prompt in the message input to create chat
        def _create_prompt():
            self.query_one("#message-input", Input).placeholder = "New chat title... type and press Send"
        _create_prompt()

    @work(thread=True)
    def create_note(self) -> None:
        headers = get_headers()
        uid = get_uid()
        if not headers or not uid:
            self.app.call_from_thread(lambda: self.app.notify("Login required", severity="warning"))
            return
        body = {"uid": uid, "title": "New note", "content": ""}
        try:
            resp = requests.post(f"{BASE_URL}/notes", json=body, headers=headers)
            resp.raise_for_status()
            self.load_notes()
        except Exception as e:
            self.app.call_from_thread(lambda: self.app.notify(f"Error creating note: {e}", severity="error"))


class ZenApp(App):
    SCREENS = {"login": LoginScreen, "workspace": WorkspaceScreen}

    def on_mount(self) -> None:
        if get_headers():
            self.push_screen("workspace")
        else:
            self.push_screen("login")


if __name__ == "__main__":
    app = ZenApp()
    app.run()
