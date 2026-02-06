import BaseApiService from './api';

export interface UserSettings {
  streamResponses: boolean;
  saveConversations: boolean;
  autoScroll: boolean;
  desktopNotifications: boolean;
  soundEffects: boolean;
  emailUpdates: boolean;
  fontSize: 'small' | 'medium' | 'large';
  messageDensity: 'compact' | 'comfortable' | 'spacious';
  theme: 'light' | 'dark' | 'system';
  language: string;
  aiLanguage: string;
}

class SettingsService {
  private static instance: SettingsService;
  private localStorageKey = 'zen_settings';

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  /**
   * Get settings for a user. First tries backend, then falls back to localStorage.
   */
  async getSettings(uid: string): Promise<UserSettings> {
    try {
      const response = await BaseApiService.get<UserSettings>(`/users/${uid}/settings`);
      if (response.data) {
        // Cache to localStorage
        localStorage.setItem(this.localStorageKey, JSON.stringify(response.data));
        return response.data;
      }
    } catch (error) {
      console.warn('Failed to fetch settings from backend, using localStorage:', error);
    }

    // Fallback to localStorage
    const cached = localStorage.getItem(this.localStorageKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error('Failed to parse cached settings:', e);
      }
    }

    // Return defaults
    return this.getDefaultSettings();
  }

  /**
   * Update settings for a user. Saves to both backend and localStorage.
   */
  async updateSettings(uid: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    // First update localStorage immediately for responsiveness
    const current = await this.getSettings(uid);
    const updated = { ...current, ...settings };
    localStorage.setItem(this.localStorageKey, JSON.stringify(updated));

    // Then sync to backend
    try {
      const response = await BaseApiService.patch<UserSettings>(`/users/${uid}/settings`, settings);
      if (response.data) {
        // Update localStorage with backend response
        localStorage.setItem(this.localStorageKey, JSON.stringify(response.data));
        return response.data;
      }
    } catch (error) {
      console.error('Failed to sync settings to backend:', error);
      // Still return the locally updated settings
    }

    return updated;
  }

  /**
   * Get default settings
   */
  getDefaultSettings(): UserSettings {
    return {
      streamResponses: true,
      saveConversations: true,
      autoScroll: true,
      desktopNotifications: true,
      soundEffects: false,
      emailUpdates: true,
      fontSize: 'medium',
      messageDensity: 'comfortable',
      theme: 'system',
      language: 'en-US',
      aiLanguage: 'auto',
    };
  }

  /**
   * Clear local settings cache
   */
  clearLocalCache(): void {
    localStorage.removeItem(this.localStorageKey);
  }
}

export default SettingsService.getInstance();
