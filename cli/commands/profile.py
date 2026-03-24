"""User profile and settings commands."""
import ui
import api_client
from api_client import APIError
from config import session


def view_profile():
    """View the current user's profile."""
    try:
        with ui.show_spinner("Loading profile..."):
            profile = api_client.get_user_profile(session.uid)
        ui.show_user_profile(profile)
        return profile
    except APIError as e:
        ui.error(f"Failed to load profile: {e.message}")
        return None


def update_profile():
    """Update display name or photo URL interactively."""
    try:
        with ui.show_spinner("Loading profile..."):
            profile = api_client.get_user_profile(session.uid)
    except APIError as e:
        ui.error(f"Failed to load profile: {e.message}")
        return None

    ui.console.print()
    ui.console.print("  [bold]Update Profile[/] [muted](press Enter to keep current value)[/]")
    ui.console.print()

    current_name = profile.get("displayName", "")
    ui.muted(f"Current display name: {current_name}")
    new_name = ui.prompt("New display name").strip() or None

    if not new_name:
        ui.muted("No changes made")
        return profile

    try:
        with ui.show_spinner("Updating profile..."):
            updated = api_client.update_user_profile(session.uid, display_name=new_name)
        ui.success("Profile updated!")
        ui.show_user_profile(updated)
        return updated
    except APIError as e:
        ui.error(f"Failed to update profile: {e.message}")
        return None


def view_settings():
    """View the current user's settings."""
    try:
        with ui.show_spinner("Loading settings..."):
            settings = api_client.get_user_settings(session.uid)
        ui.show_user_settings(settings)
        return settings
    except APIError as e:
        ui.error(f"Failed to load settings: {e.message}")
        return None


def update_settings():
    """Update user settings interactively."""
    try:
        with ui.show_spinner("Loading settings..."):
            current = api_client.get_user_settings(session.uid)
    except APIError as e:
        ui.error(f"Failed to load settings: {e.message}")
        return None

    from selector import select_action

    ui.console.print()
    ui.console.print("  [bold]Update Settings[/]")
    ui.console.print()

    # Pick which setting to change
    action = select_action([
        ('theme', f"🎨  Theme                [{current.get('theme', 'system')}]"),
        ('language', f"🌐  Language            [{current.get('language', 'en-US')}]"),
        ('ai_language', f"🤖  AI Language         [{current.get('aiLanguage', 'auto')}]"),
        ('stream', f"📡  Stream Responses     [{'on' if current.get('streamResponses', True) else 'off'}]"),
        ('sound', f"🔊  Sound Effects        [{'on' if current.get('soundEffects', False) else 'off'}]"),
        ('notifications', f"🔔  Desktop Notifs       [{'on' if current.get('desktopNotifications', True) else 'off'}]"),
        ('email_updates', f"📧  Email Updates        [{'on' if current.get('emailUpdates', True) else 'off'}]"),
        ('back', '← Back'),
    ], title="Which setting to change?")

    if not action or action == 'back':
        return current

    updates: dict = {}

    if action == 'theme':
        theme_action = select_action([
            ('system', '🖥️  System'),
            ('light', '☀️  Light'),
            ('dark', '🌙  Dark'),
        ], title="Choose Theme")
        if theme_action:
            updates["theme"] = theme_action

    elif action == 'language':
        lang = ui.prompt("Language code (e.g. en-US, de-DE, fr-FR)").strip()
        if lang:
            updates["language"] = lang

    elif action == 'ai_language':
        lang = ui.prompt("AI language (e.g. auto, en, de, fr)").strip()
        if lang:
            updates["aiLanguage"] = lang

    elif action == 'stream':
        current_val = current.get('streamResponses', True)
        updates["streamResponses"] = not current_val
        ui.info(f"Stream responses: {'on' if not current_val else 'off'}")

    elif action == 'sound':
        current_val = current.get('soundEffects', False)
        updates["soundEffects"] = not current_val
        ui.info(f"Sound effects: {'on' if not current_val else 'off'}")

    elif action == 'notifications':
        current_val = current.get('desktopNotifications', True)
        updates["desktopNotifications"] = not current_val
        ui.info(f"Desktop notifications: {'on' if not current_val else 'off'}")

    elif action == 'email_updates':
        current_val = current.get('emailUpdates', True)
        updates["emailUpdates"] = not current_val
        ui.info(f"Email updates: {'on' if not current_val else 'off'}")

    if not updates:
        ui.muted("No changes made")
        return current

    try:
        with ui.show_spinner("Saving settings..."):
            updated = api_client.update_user_settings(session.uid, **updates)
        ui.success("Settings updated!")
        return updated
    except APIError as e:
        ui.error(f"Failed to update settings: {e.message}")
        return None


def delete_account():
    """Permanently delete the user account."""
    ui.console.print()
    ui.warning("This will permanently delete your account and ALL data.")
    ui.warning("This cannot be undone!")
    ui.console.print()

    if not ui.confirm("Are you absolutely sure?"):
        ui.muted("Cancelled")
        return False

    confirm_email = ui.prompt("Type your email to confirm").strip()
    if confirm_email != session.email:
        ui.error("Email does not match. Account deletion cancelled.")
        return False

    try:
        with ui.show_spinner("Deleting account..."):
            api_client.delete_user_account(session.uid)
        ui.success("Account deleted. Goodbye!")
        session.clear()
        return True
    except APIError as e:
        ui.error(f"Failed to delete account: {e.message}")
        return False
