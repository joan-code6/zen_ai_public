/**
 * Notification utility for managing desktop notifications
 */

class NotificationManager {
  private static instance: NotificationManager;
  private enabled: boolean = false;
  private permission: NotificationPermission = 'default';

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  constructor() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  /**
   * Request permission for desktop notifications
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return false;
    }

    if (this.permission === 'granted') {
      this.enabled = true;
      return true;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      this.enabled = permission === 'granted';
      return this.enabled;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }

  /**
   * Enable notifications (will request permission if needed)
   */
  async enable(): Promise<boolean> {
    const granted = await this.requestPermission();
    if (granted) {
      this.enabled = true;
      localStorage.setItem('zen_notifications_enabled', 'true');
    }
    return granted;
  }

  /**
   * Disable notifications
   */
  disable(): void {
    this.enabled = false;
    localStorage.setItem('zen_notifications_enabled', 'false');
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.permission === 'granted';
  }

  /**
   * Show a desktop notification
   */
  async show(title: string, options?: NotificationOptions): Promise<Notification | null> {
    if (!this.isEnabled()) {
      console.warn('Notifications are not enabled');
      return null;
    }

    try {
      const notification = new Notification(title, {
        icon: '/zen-logo.png',
        badge: '/zen-logo.png',
        ...options,
      });

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      return notification;
    } catch (error) {
      console.error('Failed to show notification:', error);
      return null;
    }
  }

  /**
   * Show notification when AI responds
   */
  async notifyAIResponse(chatTitle?: string): Promise<void> {
    await this.show('Zen AI', {
      body: chatTitle ? `New response in "${chatTitle}"` : 'AI has responded',
      tag: 'ai-response',
    });
  }

  /**
   * Show notification for new email
   */
  async notifyNewEmail(from: string, subject: string): Promise<void> {
    await this.show('New Email', {
      body: `From: ${from}\n${subject}`,
      tag: 'new-email',
    });
  }

  /**
   * Show notification for calendar event
   */
  async notifyCalendarEvent(title: string, time: string): Promise<void> {
    await this.show('Calendar Reminder', {
      body: `${title}\n${time}`,
      tag: 'calendar-event',
    });
  }
}

export default NotificationManager.getInstance();
