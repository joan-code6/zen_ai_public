#!/usr/bin/env python3
import json
import os
import requests
from datetime import datetime

from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.screen import Screen
from textual.widgets import Button, Footer, Header, Input, Label, ListItem, ListView, Static, TabbedContent, TabPane
from textual.message import Message
from textual import work
from textual.reactive import reactive

BASE_URL = "https://raspberrypi.tailf0b36d.ts.net"
TOKEN_FILE = os.path.expanduser("~/.zen_ai_cli_token")

def save_token(token_data):
    with open(TOKEN_FILE, 'w') as f:
        json.dump(token_data, f)

def load_token():
    if not os.path.exists(TOKEN_FILE):
        return None
    try:
        with open(TOKEN_FILE, 'r') as f:
            return json.load(f)
    except:
        return None

def get_headers():
    token_data = load_token()
    if not token_data or 'idToken' not in token_data:
        return None
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token_data['idToken']}"
    }

def get_uid():
    token_data = load_token()
    if not token_data or 'localId' not in token_data:
        return None
    return token_data['localId']

class LoginScreen(Screen):
    CSS = """
    LoginScreen {
        align: center middle;
    }
    #login-container {
        width: 60;
        height: auto;
        border: solid green;
        padding: 1 2;
    }
    Input {
        margin: 1 0;
    }
    Button {
        width: 100%;
        margin-top: 1;
    }
    #error-label {
        color: red;
        text-align: center;
        margin-top: 1;
    }
    """

    def compose(self) -> ComposeResult:
        yield Container(
            Label("Zen AI Login", id="login-title"),
            Input(placeholder="Email", id="email"),
            Input(placeholder="Password", password=True, id="password"),
            Button("Login", variant="primary", id="login-btn"),
            Label("", id="error-label"),
            id="login-container"
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "login-btn":
            self.perform_login()

    @work(exclusive=True, thread=True)
    def perform_login(self) -> None:
        email = self.query_one("#email", Input).value
        password = self.query_one("#password", Input).value
        error_label = self.query_one("#error-label", Label)

        if not email or not password:
            self.app.call_from_thread(lambda: error_label.update("Please enter email and password"))
            return

        try:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "email": email,
                "password": password
            })
            response.raise_for_status()
            data = response.json()
            def _on_success():
                save_token(data)
                self.app.push_screen("main")
            self.app.call_from_thread(_on_success)
        except Exception as e:
            self.app.call_from_thread(lambda: error_label.update(f"Login failed: {str(e)}"))

class ChatMessage(Static):
    def __init__(self, role: str, content: str, **kwargs):
        super().__init__(**kwargs)
        self.role = role
        self.content = content

    def compose(self) -> ComposeResult:
        yield Label(f"{self.role.capitalize()}:", classes="role-label")
        yield Static(self.content, classes="message-content")

class ChatScreen(Screen):
    CSS = """
    ChatScreen {
        layout: grid;
        grid-size: 1 2;
        grid-rows: 1fr auto;
    }
    #message-container {
        height: 100%;
        overflow-y: scroll;
        padding: 1;
    }
    #input-container {
        height: auto;
        border-top: solid gray;
        padding: 1;
    }
    ChatMessage {
        margin-bottom: 1;
        padding: 1;
        background: $surface;
        border-left: solid $primary;
    }
    ChatMessage.user {
        border-left: solid blue;
    }
    ChatMessage.assistant {
        border-left: solid green;
    }
    .role-label {
        text-style: bold;
        margin-bottom: 1;
    }
    """

    BINDINGS = [("escape", "back", "Back to Chats")]

    def __init__(self, chat_id: str, title: str, **kwargs):
        super().__init__(**kwargs)
        self.chat_id = chat_id
        self.chat_title = title

    def compose(self) -> ComposeResult:
        yield Header()
        yield ScrollableContainer(id="message-container")
        yield Container(
            Input(placeholder="Type a message...", id="message-input"),
            id="input-container"
        )
        yield Footer()

    def on_mount(self) -> None:
        self.title = self.chat_title
        self.load_messages()

    def action_back(self) -> None:
        self.app.pop_screen()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        message = event.value
        if message.strip():
            self.send_message(message)
            event.input.value = ""

    @work(thread=True)
    def load_messages(self) -> None:
        headers = get_headers()
        uid = get_uid()
        if not headers or not uid:
            return

        try:
            response = requests.get(f"{BASE_URL}/chats/{self.chat_id}", params={"uid": uid}, headers=headers)
            response.raise_for_status()
            data = response.json()
            messages = data.get("messages", [])
            
            def _update_ui():
                container = self.query_one("#message-container")
                container.remove_children()
                for msg in messages:
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    classes = f"message {role}"
                    container.mount(ChatMessage(role, content, classes=classes))
                container.scroll_end(animate=False)
            self.app.call_from_thread(_update_ui)
            
        except Exception as e:
            self.app.call_from_thread(lambda: self.notify(f"Error loading messages: {e}", severity="error"))

    @work(thread=True)
    def send_message(self, content: str) -> None:
        headers = get_headers()
        uid = get_uid()
        if not headers or not uid:
            return

        def _mount_user():
            container = self.query_one("#message-container")
            container.mount(ChatMessage("user", content, classes="message user"))
            container.scroll_end()
        self.app.call_from_thread(_mount_user)

        try:
            response = requests.post(f"{BASE_URL}/chats/{self.chat_id}/messages", json={
                "uid": uid,
                "content": content,
                "role": "user"
            }, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            asst_msg = data.get("assistantMessage", {})
            if asst_msg:
                def _mount_assistant():
                    container = self.query_one("#message-container")
                    container.mount(ChatMessage("assistant", asst_msg.get("content", ""), classes="message assistant"))
                    container.scroll_end()
                self.app.call_from_thread(_mount_assistant)
                
        except Exception as e:
            self.app.call_from_thread(lambda: self.notify(f"Error sending message: {e}", severity="error"))

class MainScreen(Screen):
    CSS = """
    MainScreen {
        align: center middle;
    }
    #chat-list {
        width: 100%;
        height: 100%;
    }
    ListItem {
        padding: 1;
        border-bottom: solid $secondary;
    }
    """

    def compose(self) -> ComposeResult:
        yield Header()
        with TabbedContent("Chats", "Notes"):
            yield TabPane("Chats", ListView(id="chat-list"))
            yield TabPane("Notes", ListView(id="note-list"))
        yield Footer()

    def on_mount(self) -> None:
        self.load_chats()
        self.load_notes()

    @work(thread=True)
    def load_chats(self) -> None:
        headers = get_headers()
        uid = get_uid()
        if not headers or not uid:
            self.app.call_from_thread(lambda: self.app.push_screen("login"))
            return

        try:
            response = requests.get(f"{BASE_URL}/chats", params={"uid": uid}, headers=headers)
            response.raise_for_status()
            chats = response.json().get("items", [])
            
            def _update():
                list_view = self.query_one("#chat-list", ListView)
                list_view.clear()
                for chat in chats:
                    title = chat.get("title", "Untitled")
                    chat_id = chat.get("id")
                    item = ListItem(Label(title), id=f"chat-{chat_id}")
                    item.chat_id = chat_id
                    item.chat_title = title
                    list_view.append(item)
            self.app.call_from_thread(_update)
                
        except Exception as e:
            self.app.call_from_thread(lambda: self.notify(f"Error loading chats: {e}", severity="error"))

    @work(thread=True)
    def load_notes(self) -> None:
        headers = get_headers()
        uid = get_uid()
        if not headers or not uid:
            return

        try:
            response = requests.get(f"{BASE_URL}/notes", params={"uid": uid}, headers=headers)
            response.raise_for_status()
            notes = response.json().get("items", [])
            
            def _update():
                list_view = self.query_one("#note-list", ListView)
                list_view.clear()
                for note in notes:
                    title = note.get("title", "Untitled")
                    item = ListItem(Label(title))
                    list_view.append(item)
            self.app.call_from_thread(_update)
                
        except Exception as e:
            self.app.call_from_thread(lambda: self.notify(f"Error loading notes: {e}", severity="error"))

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if event.list_view.id == "chat-list":
            item = event.item
            if hasattr(item, "chat_id"):
                self.app.push_screen(ChatScreen(item.chat_id, item.chat_title))

class ZenApp(App):
    CSS = """
    Screen {
        background: $surface-darken-1;
    }
    """
    SCREENS = {
        "login": LoginScreen,
        "main": MainScreen,
    }

    def on_mount(self) -> None:
        if get_headers():
            self.push_screen("main")
        else:
            self.push_screen("login")

if __name__ == "__main__":
    app = ZenApp()
    app.run()
