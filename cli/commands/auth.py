"""Authentication commands."""
import ui
import api_client
from config import session
from api_client import APIError


def login_flow():
    """Interactive login flow."""
    ui.console.print()
    ui.console.print("  [bold]Login to Zen[/]")
    ui.console.print()
    
    email = ui.prompt("Email").strip()
    if not email:
        ui.error("Email is required")
        return False
    
    password = ui.prompt_password()
    if not password:
        ui.error("Password is required")
        return False
    
    try:
        with ui.show_spinner("Signing in..."):
            result = api_client.login(email, password)
        
        # Store session
        session.id_token = result.get("idToken")
        session.refresh_token = result.get("refreshToken")
        session.uid = result.get("localId")
        session.email = result.get("email", email)
        session.save()  # Persist to disk
        
        ui.console.print()
        ui.success(f"Welcome back, [bold]{session.email}[/]!")
        return True
        
    except APIError as e:
        ui.console.print()
        ui.error(f"Login failed: {e.message}")
        return False
    except Exception as e:
        ui.console.print()
        ui.error(f"Connection error: {str(e)}")
        return False


def signup_flow():
    """Interactive signup flow."""
    ui.console.print()
    ui.console.print("  [bold]Create a Zen Account[/]")
    ui.console.print()
    
    email = ui.prompt("Email").strip()
    if not email:
        ui.error("Email is required")
        return False
    
    password = ui.prompt_password()
    if not password:
        ui.error("Password is required")
        return False
    
    password_confirm = ui.prompt_password("Confirm password")
    if password != password_confirm:
        ui.error("Passwords don't match")
        return False
    
    display_name = ui.prompt("Display name (optional)").strip()
    
    try:
        with ui.show_spinner("Creating account..."):
            api_client.signup(email, password, display_name)
        
        ui.console.print()
        ui.success("Account created! Signing you in...")
        
        # Auto-login after signup
        result = api_client.login(email, password)
        session.id_token = result.get("idToken")
        session.refresh_token = result.get("refreshToken")
        session.uid = result.get("localId")
        session.email = result.get("email", email)
        session.save()  # Persist to disk
        
        ui.success(f"Welcome, [bold]{session.email}[/]!")
        return True
        
    except APIError as e:
        ui.console.print()
        ui.error(f"Signup failed: {e.message}")
        return False
    except Exception as e:
        ui.console.print()
        ui.error(f"Connection error: {str(e)}")
        return False


def logout():
    """Log out the current user."""
    session.clear()
    ui.success("Logged out successfully")


def auth_menu():
    """Show auth menu and handle choice."""
    ui.console.print()
    ui.console.print("  [bold white]1[/] Login")
    ui.console.print("  [bold white]2[/] Create account")
    ui.console.print("  [bold white]3[/] Exit")
    ui.console.print()
    
    choice = ui.prompt("Choice").strip()
    
    if choice == "1":
        return login_flow()
    elif choice == "2":
        return signup_flow()
    elif choice == "3":
        return None  # Signal to exit
    else:
        ui.warning("Invalid choice")
        return False
