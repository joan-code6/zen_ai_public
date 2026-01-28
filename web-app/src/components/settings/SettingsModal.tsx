import React from "react";
import { Settings, Sun, Moon, Monitor, Globe, Bell, Download, Trash2, Keyboard, X, FileText } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: "light" | "dark";
  onThemeChange?: (theme: "light" | "dark") => void;
}

export default function SettingsModal({ isOpen, onClose, theme = "light", onThemeChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = React.useState("general");
  const [streamResponses, setStreamResponses] = React.useState(true);
  const [saveConversations, setSaveConversations] = React.useState(true);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [desktopNotifications, setDesktopNotifications] = React.useState(true);
  const [soundEffects, setSoundEffects] = React.useState(false);
  const [emailUpdates, setEmailUpdates] = React.useState(true);
  const [fontSize, setFontSize] = React.useState<"small" | "medium" | "large">("medium");
  const [messageDensity, setMessageDensity] = React.useState<"compact" | "comfortable" | "spacious">("comfortable");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-muted/50 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex h-[600px]">
          <div className="w-64 border-r border-border p-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Settings</h2>
            </div>

            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab("general")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${
                  activeTab === "general" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/50"
                }`}
              >
                <Settings className="w-4 h-4" />
                General
              </button>
              <button
                onClick={() => setActiveTab("appearance")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${
                  activeTab === "appearance" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/50"
                }`}
              >
                <Sun className="w-4 h-4" />
                Appearance
              </button>
              <button
                onClick={() => setActiveTab("language")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${
                  activeTab === "language" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/50"
                }`}
              >
                <Globe className="w-4 h-4" />
                Language
              </button>
              <button
                onClick={() => setActiveTab("notifications")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${
                  activeTab === "notifications" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/50"
                }`}
              >
                <Bell className="w-4 h-4" />
                Notifications
              </button>
              <button
                onClick={() => setActiveTab("data")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${
                  activeTab === "data" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/50"
                }`}
              >
                <Download className="w-4 h-4" />
                Data Controls
              </button>
              <button
                onClick={() => setActiveTab("keyboard")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${
                  activeTab === "keyboard" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/50"
                }`}
              >
                <Keyboard className="w-4 h-4" />
                Keyboard Shortcuts
              </button>
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {activeTab === "general" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-200">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Profile</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-2xl font-medium text-primary-foreground shadow-md ring-2 ring-primary/20">B</div>
                      <div className="flex-1">
                        <div className="text-lg font-medium">Benne</div>
                        <div className="text-sm text-muted-foreground">bennet@example.com</div>
                        <button className="mt-2 text-sm text-primary hover:text-primary/80 transition-colors">Edit Profile</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Preferences</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                      <div>
                        <div className="font-medium">Stream responses</div>
                        <div className="text-sm text-muted-foreground">Show real-time streaming of responses</div>
                      </div>
                      <button
                        onClick={() => setStreamResponses(!streamResponses)}
                        className={`w-12 h-6 rounded-full relative transition-colors ${streamResponses ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-primary-foreground rounded-full shadow-sm transition-all duration-200 ${streamResponses ? "right-1" : "left-1"}`}></span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                      <div>
                        <div className="font-medium">Save conversations</div>
                        <div className="text-sm text-muted-foreground">Automatically save your chat history</div>
                      </div>
                      <button
                        onClick={() => setSaveConversations(!saveConversations)}
                        className={`w-12 h-6 rounded-full relative transition-colors ${saveConversations ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-primary-foreground rounded-full shadow-sm transition-all duration-200 ${saveConversations ? "right-1" : "left-1"}`}></span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                      <div>
                        <div className="font-medium">Auto-scroll to bottom</div>
                        <div className="text-sm text-muted-foreground">Scroll to bottom when new messages arrive</div>
                      </div>
                      <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`w-12 h-6 rounded-full relative transition-colors ${autoScroll ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-primary-foreground rounded-full shadow-sm transition-all duration-200 ${autoScroll ? "right-1" : "left-1"}`}></span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-200">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Theme</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <button
                      onClick={() => onThemeChange?.("light")}
                      className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all ${theme === "light" ? "border-primary bg-primary/10" : "border-border bg-background hover:border-border/50"}`}
                    >
                      <Sun className="w-6 h-6" />
                      <span className="text-sm font-medium">Light</span>
                    </button>
                    <button
                      onClick={() => onThemeChange?.("dark")}
                      className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all ${theme === "dark" ? "border-primary bg-primary/10" : "border-border bg-muted hover:border-border/50"}`}
                    >
                      <Moon className="w-6 h-6" />
                      <span className="text-sm font-medium">Dark</span>
                    </button>
                    <button
                      className="p-4 border-2 border-border rounded-xl bg-background hover:border-border/50 flex flex-col items-center gap-2 transition-colors"
                    >
                      <Monitor className="w-6 h-6" />
                      <span className="text-sm font-medium">System</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Font Size</h3>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setFontSize("small")}
                      className={`flex-1 p-3 border-2 rounded-lg text-sm transition-all ${fontSize === "small" ? "border-primary bg-primary/10" : "border-border hover:border-border/50"}`}
                    >
                      <span className="text-xs">Small</span>
                    </button>
                    <button
                      onClick={() => setFontSize("medium")}
                      className={`flex-1 p-3 border-2 rounded-lg text-sm transition-all ${fontSize === "medium" ? "border-primary bg-primary/10" : "border-border hover:border-border/50"}`}
                    >
                      <span className="text-base">Medium</span>
                    </button>
                    <button
                      onClick={() => setFontSize("large")}
                      className={`flex-1 p-3 border-2 rounded-lg text-sm transition-all ${fontSize === "large" ? "border-primary bg-primary/10" : "border-border hover:border-border/50"}`}
                    >
                      <span className="text-lg">Large</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Message Density</h3>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setMessageDensity("compact")}
                      className={`flex-1 p-3 border-2 rounded-lg text-sm transition-all ${messageDensity === "compact" ? "border-primary bg-primary/10" : "border-border hover:border-border/50"}`}
                    >
                      Compact
                    </button>
                    <button
                      onClick={() => setMessageDensity("comfortable")}
                      className={`flex-1 p-3 border-2 rounded-lg text-sm transition-all ${messageDensity === "comfortable" ? "border-primary bg-primary/10" : "border-border hover:border-border/50"}`}
                    >
                      Comfortable
                    </button>
                    <button
                      onClick={() => setMessageDensity("spacious")}
                      className={`flex-1 p-3 border-2 rounded-lg text-sm transition-all ${messageDensity === "spacious" ? "border-primary bg-primary/10" : "border-border hover:border-border/50"}`}
                    >
                      Spacious
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "language" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-200">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Language</h3>
                  <select className="w-full p-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option>English (United States)</option>
                    <option>English (United Kingdom)</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                    <option>Chinese (Simplified)</option>
                    <option>Japanese</option>
                  </select>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">AI Response Language</h3>
                  <div className="p-4 bg-muted/30 rounded-xl">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-border accent-primary" />
                      <div>
                        <div className="font-medium">Use browser language</div>
                        <div className="text-sm text-muted-foreground">Let Zen AI detect your browser language automatically</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-200">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <div>
                      <div className="font-medium">Desktop notifications</div>
                      <div className="text-sm text-muted-foreground">Get notified when you receive a response</div>
                    </div>
                    <button
                      onClick={() => setDesktopNotifications(!desktopNotifications)}
                      className={`w-12 h-6 rounded-full relative transition-colors ${desktopNotifications ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-primary-foreground rounded-full shadow-sm transition-all duration-200 ${desktopNotifications ? "right-1" : "left-1"}`}></span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <div>
                      <div className="font-medium">Sound effects</div>
                      <div className="text-sm text-muted-foreground">Play sounds for actions</div>
                    </div>
                    <button
                      onClick={() => setSoundEffects(!soundEffects)}
                      className={`w-12 h-6 rounded-full relative transition-colors ${soundEffects ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-primary-foreground rounded-full shadow-sm transition-all duration-200 ${soundEffects ? "right-1" : "left-1"}`}></span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <div>
                      <div className="font-medium">Email updates</div>
                      <div className="text-sm text-muted-foreground">Receive product updates and news</div>
                    </div>
                    <button
                      onClick={() => setEmailUpdates(!emailUpdates)}
                      className={`w-12 h-6 rounded-full relative transition-colors ${emailUpdates ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-primary-foreground rounded-full shadow-sm transition-all duration-200 ${emailUpdates ? "right-1" : "left-1"}`}></span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "data" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-200">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Export Data</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <button className="p-4 border border-border rounded-xl hover:border-border/50 transition-colors text-left">
                      <FileText className="w-6 h-6 text-muted-foreground mb-2" />
                      <div className="font-medium">Export Chat History</div>
                      <div className="text-sm text-muted-foreground">Download all your conversations</div>
                    </button>
                    <button className="p-4 border border-border rounded-xl hover:border-border/50 transition-colors text-left">
                      <Download className="w-6 h-6 text-muted-foreground mb-2" />
                      <div className="font-medium">Export Account Data</div>
                      <div className="text-sm text-muted-foreground">Get a copy of all your data</div>
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Danger Zone</h3>
                  <button className="w-full p-4 border-2 border-destructive/50 rounded-xl hover:border-destructive transition-colors text-left group">
                    <div className="flex items-center gap-3">
                      <Trash2 className="w-5 h-5 text-destructive group-hover:scale-110 transition-transform" />
                      <div>
                        <div className="font-medium text-destructive">Delete all conversations</div>
                        <div className="text-sm text-muted-foreground">This action cannot be undone</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {activeTab === "keyboard" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-200">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm">New conversation</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">Ctrl</kbd>
                        <span className="text-xs text-muted-foreground">+</span>
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">Shift</kbd>
                        <span className="text-xs text-muted-foreground">+</span>
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">N</kbd>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm">Send message</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">Enter</kbd>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm">New line</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">Shift</kbd>
                        <span className="text-xs text-muted-foreground">+</span>
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">Enter</kbd>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm">Copy last response</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">Ctrl</kbd>
                        <span className="text-xs text-muted-foreground">+</span>
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">C</kbd>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm">Search conversations</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">Ctrl</kbd>
                        <span className="text-xs text-muted-foreground">+</span>
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">K</kbd>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm">Close sidebar</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">Ctrl</kbd>
                        <span className="text-xs text-muted-foreground">+</span>
                        <kbd className="px-2 py-1 rounded bg-background border border-border text-xs font-mono">\</kbd>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
