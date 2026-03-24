import { useEffect } from 'react';
import NotificationManager from '@/utils/notifications';
import SettingsService from '@/services/settingsService';

/**
 * Hook to initialize and manage desktop notifications based on user settings
 */
export function useNotifications(userId: string | null) {
  useEffect(() => {
    if (!userId) return;

    // Load settings and check if notifications should be enabled
    const initializeNotifications = async () => {
      try {
        const settings = await SettingsService.getSettings(userId);
        
        if (settings.desktopNotifications) {
          // Enable notifications if user has it turned on
          await NotificationManager.enable();
        }
      } catch (error) {
        console.error('Failed to initialize notifications:', error);
      }
    };

    initializeNotifications();
  }, [userId]);

  return NotificationManager;
}

/**
 * Show notification when AI responds (call this when assistant message arrives)
 */
export async function notifyAIResponse(userId: string | null, chatTitle?: string) {
  if (!userId) return;

  try {
    const settings = await SettingsService.getSettings(userId);
    
    if (settings.desktopNotifications && NotificationManager.isEnabled()) {
      await NotificationManager.notifyAIResponse(chatTitle);
    }
  } catch (error) {
    console.error('Failed to show AI response notification:', error);
  }
}
