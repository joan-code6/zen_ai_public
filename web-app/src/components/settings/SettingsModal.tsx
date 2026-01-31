import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import UserService from "@/services/userService";
import ChatService from "@/services/chatService";
import { Button } from "@/components/ui/button";
import { Settings, Sun, Moon, Monitor, Globe, Bell, Download, Trash2, Keyboard, X, FileText, Mail, Lock, RefreshCw, AlertTriangle, LogOut } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  
  const [settings, setSettings] = useState({
    streamResponses: true,
    saveConversations: true,
    autoScroll: true,
    desktopNotifications: true,
    soundEffects: false,
    emailUpdates: true,
    fontSize: 'medium' as 'small' | 'medium' | 'large',
    messageDensity: 'comfortable' as 'compact' | 'comfortable' | 'spacious',
    theme: state.theme as Theme,
    language: 'en-US',
    aiLanguage: 'auto',
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('zen_settings');
    if (savedSettings) {
      try {
        setSettings(prev => ({ ...prev, ...JSON.parse(savedSettings) }));
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }, []);

  const saveSettings = async (newSettings: Partial<typeof settings>) => {
    setSaving(true);
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('zen_settings', JSON.stringify(updated));
    
    if (newSettings.theme) {
      const effectiveTheme = newSettings.theme === 'system' 
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : newSettings.theme;
      
      onThemeChange?.(effectiveTheme as 'light' | 'dark');
      document.documentElement.setAttribute('data-theme', effectiveTheme);
    }
    
    actions.addToast('Settings saved', 'success');
    setTimeout(() => setSaving(false), 500);
  };

  if (!isOpen) return null;

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings className="w-4 h-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Sun className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'data', label: 'Data & Privacy', icon: <Download className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <Lock className="w-4 h-4" /> },
    { id: 'keyboard', label: 'Keyboard', icon: <Keyboard className="w-4 h-4" /> },
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
              <h2 className="text-lg font-semibold font-display">Settings</h2>
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
            {activeTab === 'general' && <GeneralTab user={user} onSave={saveSettings} settings={settings} />}
            {activeTab === 'appearance' && <AppearanceTab onSave={saveSettings} settings={settings} />}
            {activeTab === 'notifications' && <NotificationsTab onSave={saveSettings} settings={settings} />}
            {activeTab === 'data' && <DataTab user={user} onSave={saveSettings} actions={actions} />}
            {activeTab === 'security' && <SecurityTab user={user} logout={logout} actions={actions} />}
            {activeTab === 'keyboard' && <KeyboardTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ user, onSave, settings }: { user: any; onSave: (s: any) => void; settings: any }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">Profile</h3>
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
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Preferences</h3>
        <div className="space-y-3">
          <SettingToggle
            label="Stream responses"
            description="Show real-time streaming of AI responses"
            checked={settings.streamResponses}
            onChange={() => onSave({ streamResponses: !settings.streamResponses })}
          />
          <SettingToggle
            label="Save conversations"
            description="Automatically save your chat history"
            checked={settings.saveConversations}
            onChange={() => onSave({ saveConversations: !settings.saveConversations })}
          />
          <SettingToggle
            label="Auto-scroll to bottom"
            description="Scroll to bottom when new messages arrive"
            checked={settings.autoScroll}
            onChange={() => onSave({ autoScroll: !settings.autoScroll })}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Language</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">Interface Language</label>
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
            label="Use browser language for AI"
            description="Let Zen AI detect your browser language automatically for AI responses"
            checked={settings.aiLanguage === 'auto'}
            onChange={() => onSave({ aiLanguage: settings.aiLanguage === 'auto' ? 'en' : 'auto' })}
          />
        </div>
      </div>
    </div>
  );
}

function AppearanceTab({ onSave, settings }: { onSave: (s: any) => void; settings: any }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">Theme</h3>
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
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">Desktop Notifications</h3>
        <div className="space-y-3">
          <SettingToggle
            label="Desktop notifications"
            description="Get notified when you receive a response"
            checked={settings.desktopNotifications}
            onChange={() => onSave({ desktopNotifications: !settings.desktopNotifications })}
          />
          <SettingToggle
            label="Sound effects"
            description="Play sounds for actions and notifications"
            checked={settings.soundEffects}
            onChange={() => onSave({ soundEffects: !settings.soundEffects })}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Email Notifications</h3>
        <div className="space-y-3">
          <SettingToggle
            label="Email updates"
            description="Receive product updates and news"
            checked={settings.emailUpdates}
            onChange={() => onSave({ emailUpdates: !settings.emailUpdates })}
          />
          <div className="text-sm text-muted-foreground">
            Manage your connected email accounts in Email section.
          </div>
        </div>
      </div>
    </div>
  );
}

function DataTab({ user, onSave, actions }: { user: any; onSave: (s: any) => void; actions: any }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">Export Data</h3>
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={async () => {
              if (user) {
                try {
                  const blob = await UserService.exportUserData(user.uid);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
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
                <div className="font-semibold text-sm">Export Account Data</div>
                <div className="text-xs text-muted-foreground">Get a copy of all your data</div>
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
              <div className="font-semibold text-sm mb-1">Delete all conversations</div>
              <div className="text-xs text-muted-foreground mb-2">This action cannot be undone. All your chat history will be permanently deleted.</div>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={async () => {
                  if (user && confirm('Are you sure you want to delete all conversations? This cannot be undone.')) {
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
                Delete All
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecurityTab({ user, logout, actions }: { user: any; logout: () => void; actions: any }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200">
      <div>
        <h3 className="text-lg font-semibold mb-4">Password</h3>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Change your password to keep your account secure.
          </div>
          <Button 
            variant="outline" 
            className="w-full"
            onClick={async () => {
              if (user?.email) {
                try {
                  await UserService.changePassword(user.email);
                  actions.addToast('Password reset email sent', 'success');
                } catch (error) {
                  actions.addToast('Failed to send password reset email', 'error');
                }
              }
            }}
          >
            <Mail className="w-4 h-4 mr-2" />
            Send Password Reset Email
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Active Sessions</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div>
              <div className="text-sm font-medium">Current Session</div>
              <div className="text-xs text-muted-foreground truncate max-w-[200px]">{navigator.userAgent.split(')')[0]})</div>
            </div>
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">Active Now</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4 text-destructive">Account Actions</h3>
        <div className="space-y-3">
          <Button variant="outline" onClick={logout} className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
          <Button variant="destructive" className="w-full">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Account
          </Button>
        </div>
      </div>
    </div>
  );
}

function KeyboardTab() {
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
        <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
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
