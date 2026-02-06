import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import UserService from "@/services/userService";
import ChatService from "@/services/chatService";
import SettingsService, { UserSettings } from "@/services/settingsService";
import NotificationManager from "@/utils/notifications";
import { Button } from "@/components/ui/button";
import { Settings, Sun, Moon, Monitor, Globe, Bell, Download, Trash2, Keyboard, X, FileText, Mail, Lock, RefreshCw, AlertTriangle, LogOut } from 'lucide-react';
import { setUserLanguage } from "@/i18n";
import { useTypedTranslation } from "@/hooks/useTranslation";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: "light" | "dark";
  onThemeChange?: (theme: "light" | "dark") => void;
}

type Theme = 'light' | 'dark' | 'system';
type SettingsTab = 'general' | 'appearance' | 'notifications' | 'data' | 'security' | 'keyboard';

export default function SettingsModal({ isOpen, onClose, theme = "light", onThemeChange }: SettingsModalProps) {
  const { user, logout } = useAuth();
  const { state, actions } = useApp();
  const { t } = useTypedTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [settings, setSettings] = useState<UserSettings>(SettingsService.getDefaultSettings());

  useEffect(() => {
    if (isOpen && user) {
      loadSettings();
    }
  }, [isOpen, user]);

  const loadSettings = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const userSettings = await SettingsService.getSettings(user.uid);
      setSettings(userSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      actions.addToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: Partial<UserSettings>) => {
    if (!user) return;

    setSaving(true);
    try {
      const updated = await SettingsService.updateSettings(user.uid, newSettings);
      setSettings(updated);
      
      if (newSettings.theme) {
        const effectiveTheme = newSettings.theme === 'system' 
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : newSettings.theme;
        
        onThemeChange?.(effectiveTheme as 'light' | 'dark');
        document.documentElement.setAttribute('data-theme', effectiveTheme);
      }

      // If user changed interface language, map to supported UI languages and persist
      if (newSettings.language) {
        try {
          const uiLang = newSettings.language.startsWith('de') ? 'de' : 'en';
          setUserLanguage(uiLang);
        } catch (e) {
          console.warn('Failed to set user language', e);
        }
      }
      
      actions.addToast('Settings saved', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      actions.addToast('Failed to save settings', 'error');
    } finally {
      setTimeout(() => setSaving(false), 500);
    }
  };

  if (!isOpen) return null;
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: t('settings.profile'), icon: <Settings className="w-4 h-4" /> },
    { id: 'appearance', label: t('settings.appearance'), icon: <Sun className="w-4 h-4" /> },
    { id: 'notifications', label: t('settings.notifications'), icon: <Bell className="w-4 h-4" /> },
    { id: 'data', label: t('settings.accountSettings'), icon: <Download className="w-4 h-4" /> },
    { id: 'security', label: t('settings.security'), icon: <Lock className="w-4 h-4" /> },
    { id: 'keyboard', label: t('settings.keyboard') || 'Keyboard', icon: <Keyboard className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-muted/50 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex h-[600px]">
          <div className="w-60 border-r border-border p-4 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold font-display">{t('settings.settings')}</h2>
              {saving && <RefreshCw className="w-4 h-4 animate-spin text-primary" />}
            </div>

            <nav className="space-y-1 flex-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-3 ${
                    activeTab === tab.id ? "bg-primary text-primary-foreground shadow-md" : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {activeTab === 'general' && <GeneralTab user={user} onSave={saveSettings} settings={settings} />}
                {activeTab === 'appearance' && <AppearanceTab onSave={saveSettings} settings={settings} />}
                {activeTab === 'notifications' && <NotificationsTab onSave={saveSettings} settings={settings} />}
                {activeTab === 'data' && <DataTab user={user} onSave={saveSettings} actions={actions} />}
                {activeTab === 'security' && <SecurityTab user={user} logout={logout} actions={actions} />}
                {activeTab === 'keyboard' && <KeyboardTab />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ user, onSave, settings }: { user: any; onSave: (s: any) => void; settings: any }) {
  const { t } = useTypedTranslation();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl || '');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      await UserService.updateUserProfile(user.uid, {
        displayName: displayName.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
      });
      
      // Update local user data
      if (user.updateProfile) {
        user.updateProfile({ displayName, photoUrl });
      }
      
      setEditing(false);
      // Show success message through parent component
      if (typeof onSave === 'function') {
        // Trigger a toast by calling parent's action
        setTimeout(() => {
          const event = new CustomEvent('profile-updated');
          window.dispatchEvent(event);
        }, 100);
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      alert('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('settings.profile')}</h3>
          {!editing && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setDisplayName(user?.displayName || '');
                setPhotoUrl(user?.photoUrl || '');
                setEditing(true);
              }}
            >
              {t('settings.editProfile')}
            </Button>
          )}
        </div>
        
        {editing ? (
          <div className="space-y-4 p-4 bg-muted/30 rounded-xl border">
            <div>
              <label className="block text-sm font-medium mb-2">{t('settings.displayName')}</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full p-2.5 border-2 border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                placeholder={t('onboarding.enterName')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('settings.photoUrl','Photo URL')}</label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className="w-full p-2.5 border-2 border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                placeholder="https://example.com/photo.jpg"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleSaveProfile} 
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    {t('buttons.saving')}
                  </>
                ) : (
                  t('settings.saveChanges')
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl border">
            {user?.photoUrl ? (
              <img 
                src={user.photoUrl} 
                alt={user.displayName || user.email}
                className="h-14 w-14 rounded-full object-cover shadow-md ring-2 ring-primary/20"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-xl font-bold shadow-md ring-2 ring-primary/20">
                {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <div className="text-base font-semibold">{user?.displayName || 'User'}</div>
              <div className="text-sm text-muted-foreground">{user?.email}</div>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.preferences')}</h3>
        <div className="space-y-3">
          <SettingToggle
            label={t('settings.streamResponses')}
            description={t('settings.streamResponsesDesc')}
            checked={settings.streamResponses}
            onChange={() => onSave({ streamResponses: !settings.streamResponses })}
          />
          <SettingToggle
            label={t('settings.saveConversations')}
            description={t('settings.saveConversationsDesc')}
            checked={settings.saveConversations}
            onChange={() => onSave({ saveConversations: !settings.saveConversations })}
          />
          <SettingToggle
            label={t('settings.autoScroll')}
            description={t('settings.autoScrollDesc')}
            checked={settings.autoScroll}
            onChange={() => onSave({ autoScroll: !settings.autoScroll })}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.language')}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">{t('general.languageLabel')}</label>
            <select
              value={settings.language}
              onChange={(e) => onSave({ language: e.target.value })}
              className="w-full p-2.5 border-2 border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
            >
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
              <option value="de-DE">German (Germany)</option>
              <option value="es-ES">Spanish (Spain)</option>
              <option value="fr-FR">French (France)</option>
              <option value="zh-CN">Chinese (Simplified)</option>
              <option value="ja-JP">Japanese (Japan)</option>
            </select>
          </div>

          <SettingToggle
            label={t('general.useBrowserForAI')}
            description={t('general.useBrowserForAIDesc')}
            checked={settings.aiLanguage === 'auto'}
            onChange={() => onSave({ aiLanguage: settings.aiLanguage === 'auto' ? 'en' : 'auto' })}
          />
        </div>
      </div>
    </div>
  );
}

function AppearanceTab({ onSave, settings }: { onSave: (s: any) => void; settings: any }) {
  const { t } = useTypedTranslation();
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.theme', 'Theme')}</h3>
        <div className="grid grid-cols-3 gap-3">
          {(['light', 'dark', 'system'] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => onSave({ theme: t })}
              className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all ${
                settings.theme === t ? 'border-primary bg-primary/10 shadow-md' : 'border-border hover:border-border/50'
              }`}
            >
              {t === 'light' && <Sun className="w-5 h-5" />}
              {t === 'dark' && <Moon className="w-5 h-5" />}
              {t === 'system' && <Monitor className="w-5 h-5" />}
              <span className="text-xs font-medium capitalize">{t}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Font Size</h3>
        <div className="flex items-center gap-2">
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              onClick={() => onSave({ fontSize: size })}
              className={`flex-1 p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                settings.fontSize === size ? 'border-primary bg-primary/10' : 'border-border hover:border-border/50'
              }`}
            >
              <span className={`block ${size === 'small' ? 'text-xs' : size === 'large' ? 'text-base' : 'text-sm'}`}>
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Message Density</h3>
        <div className="flex items-center gap-2">
          {(['compact', 'comfortable', 'spacious'] as const).map((density) => (
            <button
              key={density}
              onClick={() => onSave({ messageDensity: density })}
              className={`flex-1 p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                settings.messageDensity === density ? 'border-primary bg-primary/10' : 'border-border hover:border-border/50'
              }`}
            >
              {density.charAt(0).toUpperCase() + density.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsTab({ onSave, settings }: { onSave: (s: any) => void; settings: any }) {
  const { t } = useTypedTranslation();
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  const handleDesktopNotifications = async (enabled: boolean) => {
    if (enabled) {
      const granted = await NotificationManager.enable();
      if (granted) {
        onSave({ desktopNotifications: true });
        setPermissionStatus('granted');
        // Show a test notification
        NotificationManager.show(t('notifications.enabledTitle','Notifications Enabled'), {
          body: t('notifications.enabledBody','You will now receive desktop notifications from Zen AI'),
        });
      } else {
        onSave({ desktopNotifications: false });
        alert(t('notifications.permissionDeniedAlert','Please allow notifications in your browser settings to enable this feature.'));
      }
    } else {
      NotificationManager.disable();
      onSave({ desktopNotifications: false });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.notifications')}</h3>
        <div className="space-y-3">
          <SettingToggle
            label={t('settings.pushNotifications')}
            description={
              permissionStatus === 'denied'
                ? t('settings.notificationsBlocked','Notifications blocked. Please enable in browser settings.')
                : t('settings.getNotified','Get notified when you receive a response')
            }
            checked={settings.desktopNotifications && permissionStatus === 'granted'}
            onChange={() => handleDesktopNotifications(!settings.desktopNotifications)}
          />
          {permissionStatus === 'denied' && (
            <div className="text-xs text-destructive p-2 bg-destructive/10 rounded-lg">
              {t('settings.notificationsBlockedDetail','Notifications are blocked by your browser. Click the lock icon in your address bar to enable them.')}
            </div>
          )}
          <SettingToggle
            label={t('settings.soundEffects','Sound effects')}
            description={t('settings.soundEffectsDesc','Play sounds for actions and notifications')}
            checked={settings.soundEffects}
            onChange={() => onSave({ soundEffects: !settings.soundEffects })}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.emailNotifications','Email Notifications')}</h3>
        <div className="space-y-3">
          <SettingToggle
            label={t('settings.emailUpdates','Email updates')}
            description={t('settings.emailUpdatesDesc','Receive product updates and news')}
            checked={settings.emailUpdates}
            onChange={() => onSave({ emailUpdates: !settings.emailUpdates })}
          />
          <div className="text-sm text-muted-foreground">
            {t('settings.manageEmailAccounts','Manage your connected email accounts in Email section.')}
          </div>
        </div>
      </div>
    </div>
  );
}

function DataTab({ user, onSave, actions }: { user: any; onSave: (s: any) => void; actions: any }) {
  const { t } = useTypedTranslation();
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.exportData','Export Data')}</h3>
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={async () => {
              if (user) {
                try {
                  const blob = await UserService.exportUserData(user.uid);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  actions.addToast('Exporting data...', 'info');
                  a.href = url;
                  a.download = `zen-ai-export-${user.uid}-${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  actions.addToast('Data exported successfully', 'success');
                } catch (error) {
                  console.error('Export failed:', error);
                  actions.addToast('Failed to export data', 'error');
                }
              }
            }}
            className="p-4 border-2 border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-primary" />
              <div>
                <div className="font-semibold text-sm">{t('settings.exportData')}</div>
                <div className="text-xs text-muted-foreground">{t('settings.exportDataDesc', 'Get a copy of all your data')}</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4 text-destructive">Danger Zone</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-background rounded-lg border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm mb-1">{t('settings.deleteAllConversations', 'Delete all conversations')}</div>
              <div className="text-xs text-muted-foreground mb-2">{t('settings.deleteAllConversationsDesc', 'This action cannot be undone. All your chat history will be permanently deleted.')}</div>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={async () => {
                  if (user && confirm(t('settings.confirmDeleteAll', 'Are you sure you want to delete all conversations? This cannot be undone.'))) {
                    try {
                      const chats = await ChatService.getChats(user.uid);
                      await Promise.all(chats.map(chat => ChatService.deleteChat(chat.id, user.uid)));
                      actions.addToast('All conversations deleted', 'success');
                    } catch (error) {
                      console.error('Failed to delete conversations:', error);
                      actions.addToast('Failed to delete conversations', 'error');
                    }
                  }
                }}
              >
                <Trash2 className="w-3 h-3 mr-2" />
                {t('buttons.deleteAll')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecurityTab({ user, logout, actions }: { user: any; logout: () => void; actions: any }) {
  const { t } = useTypedTranslation();
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user) return;

    const confirmed = window.confirm(
      t('settings.confirmDeleteAccount','Are you absolutely sure you want to delete your account? This action cannot be undone. All your data including chats, notes, and files will be permanently deleted.')
    );

    if (!confirmed) return;

    const doubleCheck = window.prompt(
      t('settings.promptTypeDelete','Please type "DELETE" to confirm account deletion:')
    );

    if (doubleCheck !== 'DELETE') {
      actions.addToast(t('common.info','Account deletion cancelled'), 'info');
      return;
    }

    setDeleting(true);
    try {
      await UserService.deleteAccount(user.uid);
      actions.addToast(t('common.success','Account deleted successfully'), 'success');
      setTimeout(() => {
        logout();
      }, 1000);
    } catch (error) {
      console.error('Failed to delete account:', error);
      actions.addToast(error instanceof Error ? error.message : t('common.error','Failed to delete account'), 'error');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.password')}</h3>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {t('settings.changePasswordDesc','Change your password to keep your account secure.')}
          </div>
          <Button 
            variant="outline" 
            className="w-full"
            onClick={async () => {
              if (user?.email) {
                try {
                  await UserService.changePassword(user.email);
                  actions.addToast(t('buttons.passwordResetSent','Password reset email sent'), 'success');
                } catch (error) {
                  actions.addToast(t('common.error','Failed to send password reset email'), 'error');
                }
              }
            }}
          >
            <Mail className="w-4 h-4 mr-2" />
            {t('buttons.sendPasswordReset')}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.activeSessions','Active Sessions')}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div>
              <div className="text-sm font-medium">{t('settings.currentSession','Current Session')}</div>
              <div className="text-xs text-muted-foreground truncate max-w-[200px]">{navigator.userAgent.split(')')[0]})</div>
            </div>
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">{t('settings.activeNow','Active Now')}</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4 text-destructive">{t('settings.accountActions','Account Actions')}</h3>
        <div className="space-y-3">
          <Button variant="outline" onClick={logout} className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            {t('buttons.signOut')}
          </Button>
          <Button 
            variant="destructive" 
            className="w-full" 
            onClick={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                {t('buttons.deleting', 'Deleting...')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                {t('buttons.deleteAccount')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function KeyboardTab() {
  const { t } = useTypedTranslation();
  const shortcuts = [
    { action: 'New conversation', keys: ['Ctrl', 'Shift', 'N'] },
    { action: 'Send message', keys: ['Enter'] },
    { action: 'New line', keys: ['Shift', 'Enter'] },
    { action: 'Copy last response', keys: ['Ctrl', 'C'] },
    { action: 'Search conversations', keys: ['Ctrl', 'K'] },
    { action: 'Toggle sidebar', keys: ['Ctrl', '\\'] },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.keyboard')}</h3>
        <div className="space-y-2">
          {shortcuts.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium">{shortcut.action}</span>
              <div className="flex gap-1">
                {shortcut.keys.map((key, j) => (
                  <React.Fragment key={j}>
                    <kbd className="px-2 py-1 rounded bg-background border-2 border-border text-xs font-mono font-semibold">{key}</kbd>
                    {j < shortcut.keys.length - 1 && <span className="text-xs text-muted-foreground mx-1">+</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg group">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        onClick={onChange}
        className={`w-11 h-6 rounded-full relative transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-background rounded-full shadow-md transition-all duration-200 ${checked ? 'right-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
