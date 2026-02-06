#!/usr/bin/env python3
import cmd
import json
import os
import sys
import requests
import readline
from datetime import datetime

BASE_URL = "http://localhost:5000"
TOKEN_FILE = os.path.expanduser("~/.zen_ai_cli_token")

# ANSI colors
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def save_token(token_data):
    with open(TOKEN_FILE, 'w') as f:
        json.dump(token_data, f)
    print(f"{Colors.GREEN}Token saved.{Colors.ENDC}")

def load_token():
    if not os.path.exists(TOKEN_FILE):
        return None
    try:
        with open(TOKEN_FILE, 'r') as f:
            return json.load(f)
    except:
        return None

def get_headers(require_auth=True):
    headers = {"Content-Type": "application/json"}
    if require_auth:
        token_data = load_token()
        if not token_data or 'idToken' not in token_data:
            print(f"{Colors.FAIL}Error: Not logged in. Please run 'login' first.{Colors.ENDC}")
            return None
        headers["Authorization"] = f"Bearer {token_data['idToken']}"
    return headers

def get_uid():
    token_data = load_token()
    if not token_data or 'localId' not in token_data:
        return None
    return token_data['localId']

class ZenShell(cmd.Cmd):
    intro = f'{Colors.HEADER}Welcome to Zen AI CLI. Type help or ? to list commands.{Colors.ENDC}'
    prompt = f'{Colors.CYAN}(zen){Colors.ENDC} '

    def do_login(self, arg):
        """Login to Zen AI: login"""
        email = input("Email: ")
        password = input("Password: ")
        payload = {"email": email, "password": password}
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json=payload)
            response.raise_for_status()
            data = response.json()
            save_token(data)
            print(f"{Colors.GREEN}Login successful!{Colors.ENDC}")
        except Exception as e:
            print(f"{Colors.FAIL}Login failed: {e}{Colors.ENDC}")

    def do_health(self, arg):
        """Check backend health: health"""
        try:
            response = requests.get(f"{BASE_URL}/health")
            print(response.json())
        except Exception as e:
            print(f"{Colors.FAIL}Health check failed: {e}{Colors.ENDC}")

    def do_chats(self, arg):
        """List chats: chats"""
        headers = get_headers()
        if not headers: return
        uid = get_uid()
        try:
            response = requests.get(f"{BASE_URL}/chats", params={"uid": uid}, headers=headers)
            response.raise_for_status()
            chats = response.json().get("items", [])
            if not chats:
                print("No chats found.")
            for chat in chats:
                print(f"{Colors.BOLD}[{chat['id']}]{Colors.ENDC} {chat.get('title', 'Untitled')} ({chat.get('updatedAt')})")
        except Exception as e:
            print(f"{Colors.FAIL}Error listing chats: {e}{Colors.ENDC}")

    def do_chat(self, arg):
        """Enter a chat: chat <chat_id>"""
        args = arg.split()
        if not args:
            print("Usage: chat <chat_id>")
            return
        chat_id = args[0]
        
        headers = get_headers()
        if not headers: return
        uid = get_uid()

        # Verify chat exists and get history
        try:
            response = requests.get(f"{BASE_URL}/chats/{chat_id}", params={"uid": uid}, headers=headers)
            response.raise_for_status()
            data = response.json()
            chat_title = data.get('chat', {}).get('title', 'Chat')
            messages = data.get('messages', [])
            
            print(f"\n{Colors.HEADER}--- {chat_title} ---{Colors.ENDC}")
            for msg in messages:
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                color = Colors.BLUE if role == 'user' else Colors.GREEN
                print(f"{color}{role.capitalize()}: {content}{Colors.ENDC}")
            
            # Enter chat loop
            print(f"\n{Colors.WARNING}(Type 'exit' to leave chat){Colors.ENDC}")
            while True:
                try:
                    user_input = input(f"{Colors.BLUE}You: {Colors.ENDC}")
                    if user_input.lower() in ('exit', 'quit'):
                        break
                    if not user_input.strip():
                        continue
                    
                    payload = {
                        "uid": uid,
                        "content": user_input,
                        "role": "user"
                    }
                    print("...")
                    resp = requests.post(f"{BASE_URL}/chats/{chat_id}/messages", json=payload, headers=headers)
                    resp.raise_for_status()
                    resp_data = resp.json()
                    asst_msg = resp_data.get("assistantMessage", {})
                    print(f"{Colors.GREEN}Assistant: {asst_msg.get('content')}{Colors.ENDC}")
                    
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    print(f"{Colors.FAIL}Error: {e}{Colors.ENDC}")

        except Exception as e:
            print(f"{Colors.FAIL}Error entering chat: {e}{Colors.ENDC}")

    def do_create_chat(self, arg):
        """Create a new chat: create_chat <title>"""
        title = arg.strip() or "New Chat"
        headers = get_headers()
        if not headers: return
        uid = get_uid()
        
        payload = {"uid": uid, "title": title}
        try:
            response = requests.post(f"{BASE_URL}/chats", json=payload, headers=headers)
            response.raise_for_status()
            chat = response.json()
            print(f"{Colors.GREEN}Chat created: {chat['id']}{Colors.ENDC}")
            self.do_chat(chat['id'])
        except Exception as e:
            print(f"{Colors.FAIL}Error creating chat: {e}{Colors.ENDC}")

    def do_notes(self, arg):
        """List notes: notes"""
        headers = get_headers()
        if not headers: return
        uid = get_uid()
        try:
            response = requests.get(f"{BASE_URL}/notes", params={"uid": uid}, headers=headers)
            response.raise_for_status()
            notes = response.json().get("items", [])
            for note in notes:
                print(f"{Colors.BOLD}[{note['id']}]{Colors.ENDC} {note.get('title', 'Untitled')}")
        except Exception as e:
            print(f"{Colors.FAIL}Error listing notes: {e}{Colors.ENDC}")

    def do_clear(self, arg):
        """Clear the screen"""
        os.system('cls' if os.name == 'nt' else 'clear')

    def do_exit(self, arg):
        """Exit the CLI"""
        print("Bye!")
        return True

    def do_quit(self, arg):
        """Exit the CLI"""
        return self.do_exit(arg)

    def do_EOF(self, arg):
        """Exit on Ctrl-D"""
        print()
        return True

if __name__ == '__main__':
    try:
        ZenShell().cmdloop()
    except KeyboardInterrupt:
        print("\nBye!")
