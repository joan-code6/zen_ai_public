import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { MessageCircle, FileText, Calendar, Mail, Search, Plus, ChevronDown, Settings, HelpCircle, LogOut, LogIn, User, Trash2, Edit3 } from 'lucide-react';
import SettingsModal from "@/components/settings/SettingsModal";
import ProfileSettingsModal from "@/components/settings/ProfileSettingsModal";

interface NavItemProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  actions?: React.ReactNode;
}

function NavItem({ icon, children, isActive, onClick, actions }: NavItemProps) {
  return (
    <div onClick={onClick} className={`group relative px-3 py-2 rounded-lg cursor-pointer flex items-center gap-3 transition-colors ${isActive ? "bg-primary/10 text-primary" : "hover:bg-muted/50"}`}>
      <div className={`w-5 h-5 flex items-center justify-center transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>{icon}</div>
      <div className={`text-sm truncate flex-1 ${isActive ? "font-medium text-primary" : "text-foreground/80 group-hover:text-foreground transition-colors"}`}>{children}</div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">{actions}</div>
    </div>
  );
}

interface SidebarProps {
  onNewChat?: () => void;
  onAuthClick?: () => void;
  isMobile?: boolean;
  isSidebarOpen?: boolean;
  onSidebarToggle?: () => void;
}

export default function Sidebar({ onNewChat, onAuthClick, isMobile = false, isSidebarOpen = true }: SidebarProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const { state, actions } = useApp();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  function openSettings() {
    setShowProfileMenu(false);
    setShowSettings(true);
  }

  function openProfileSettings() {
    setShowProfileMenu(false);
    setShowProfileSettings(true);
  }

  function handleSignOut() {
    setShowProfileMenu(false);
    logout();
    actions.addToast('Signed out successfully', 'success');
  }



  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Show auth modal when user clicks on chat without being authenticated
  const handleProtectedAction = () => {
    if (!isAuthenticated) {
      onAuthClick?.();
      return;
    }
    onNewChat?.();
  };

  const sidebarClasses = isMobile
    ? `fixed top-0 left-0 h-full w-64 transform transition-transform duration-300 ease-in-out z-50 md:hidden ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`
    : "w-60 border-r border-sidebar-border bg-sidebar p-4 flex flex-col gap-4";

  if (isMobile) {
    return (
      <>
        <aside className={`${sidebarClasses} bg-sidebar`}>
          <div className="flex items-center p-4">
            <div className="text-lg font-semibold">
              Zen AI
            </div>
          </div>
          
          <div className="px-4 pb-4">
            <div className="flex items-center bg-input border border-border rounded-lg px-3 py-2 gap-2 mb-4">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                placeholder="Search..."
                className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground/60"
              />
            </div>

            <button onClick={handleProtectedAction} className="w-full py-2.5 bg-foreground text-background rounded-lg shadow-sm hover:brightness-95 flex items-center justify-center gap-2 font-medium group mb-4">
              <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
              New Chat
            </button>

            <div className="pt-4 space-y-1">
              <NavItem 
                icon={<Mail />} 
                isActive={state.currentView === 'email'}
                onClick={() => isAuthenticated && actions.setCurrentView('email')}
              >
                Email
              </NavItem>
              <NavItem 
                icon={<Calendar />} 
                isActive={state.currentView === 'calendar'}
                onClick={() => isAuthenticated && actions.setCurrentView('calendar')}
              >
                Calendar
              </NavItem>
              <NavItem icon={<FileText />} onClick={() => isAuthenticated && actions.setCurrentView('chat')}>Notes</NavItem>
            </div>
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside className={sidebarClasses}>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">
          Zen AI
        </div>
      </div>

        <div className="flex items-center bg-input border border-border rounded-lg px-3 py-2 gap-2">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            placeholder="Search..."
            className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground/60"
          />
        </div>

        <button onClick={handleProtectedAction} className="w-full py-2.5 bg-foreground text-background rounded-lg shadow-sm hover:brightness-95 flex items-center justify-center gap-2 font-medium group">
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
          New Chat
        </button>

        <div className="pt-4 space-y-1">
          <NavItem 
            icon={<Mail />} 
            isActive={state.currentView === 'email'}
            onClick={() => isAuthenticated && actions.setCurrentView('email')}
          >
            Email
          </NavItem>
          <NavItem 
            icon={<Calendar />} 
            isActive={state.currentView === 'calendar'}
            onClick={() => isAuthenticated && actions.setCurrentView('calendar')}
          >
            Calendar
          </NavItem>
          <NavItem icon={<FileText />} onClick={() => isAuthenticated && actions.setCurrentView('chat')}>Notes</NavItem>
        </div>

        <nav className="flex-1 overflow-y-auto pt-2 space-y-6 custom-scrollbar">
          <div>
            <div className="text-xs text-muted-foreground uppercase mb-2 font-medium">Today</div>
            <div className="flex flex-col gap-1">
              <NavItem
                icon={<MessageCircle />}
                isActive={activeChatId === "1"}
                onClick={() => setActiveChatId("1")}
                actions={
                  <div className="flex gap-1">
                    <button className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                }
              >
                Morning planning
              </NavItem>
              <NavItem icon={<MessageCircle />} isActive={activeChatId === "2"} onClick={() => setActiveChatId("2")}>Inbox cleanup</NavItem>
              <NavItem icon={<MessageCircle />} isActive={activeChatId === "3"} onClick={() => setActiveChatId("3")}>Draft email to Anna</NavItem>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase mb-2 font-medium">Yesterday</div>
            <div className="flex flex-col gap-1">
              <NavItem icon={<MessageCircle />} isActive={activeChatId === "4"} onClick={() => setActiveChatId("4")}>Project notes</NavItem>
              <NavItem icon={<MessageCircle />} isActive={activeChatId === "5"} onClick={() => setActiveChatId("5")}>Meeting prep</NavItem>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase mb-2 font-medium">Previous 7 Days</div>
            <div className="flex flex-col gap-1">
              <NavItem icon={<MessageCircle />} isActive={activeChatId === "6"} onClick={() => setActiveChatId("6")}>Email templates</NavItem>
              <NavItem icon={<MessageCircle />} isActive={activeChatId === "7"} onClick={() => setActiveChatId("7")}>Code review</NavItem>
            </div>
          </div>
        </nav>

        <div className="pt-4 border-t border-sidebar-border relative" ref={profileMenuRef}>
          {isAuthenticated && user ? (
            <>
              <div
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-lg p-2 -m-2 transition-colors"
              >
                {user.photoUrl ? (
                  <img 
                    src={user.photoUrl} 
                    alt={user.displayName || user.email}
                    className="h-8 w-8 rounded-full object-cover shadow-md ring-2 ring-primary/20"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-sm font-medium shadow-md ring-2 ring-primary/20">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {user.displayName || user.email}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </div>

              {showProfileMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="px-3 py-2 border-b border-border/50 mb-1">
                    <div className="flex items-center gap-3">
                      {user.photoUrl ? (
                        <img 
                          src={user.photoUrl} 
                          alt={user.displayName || user.email}
                          className="h-10 w-10 rounded-full object-cover shadow-md ring-2 ring-primary/20"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-sm font-medium shadow-md ring-2 ring-primary/20">
                          {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          {user.displayName || user.email}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button onClick={openProfileSettings} className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-3 transition-colors mx-1.5 rounded-lg">
                    <User />
                    Profile Settings
                  </button>
                  <button onClick={openSettings} className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-3 transition-colors mx-1.5 rounded-lg">
                    <Settings />
                    Settings
                  </button>
                  <button className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-3 transition-colors mx-1.5 rounded-lg">
                    <HelpCircle />
                    Help & Feedback
                  </button>
                  <button className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-3 transition-colors mx-1.5 rounded-lg">
                    <FileText />
                    Terms & Privacy
                  </button>
                  <div className="px-3 py-2 border-t border-border/50 mt-1 pt-2">
                    <button onClick={handleSignOut} className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors rounded-lg">
                      <LogOut />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={onAuthClick}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 flex items-center justify-center gap-2 font-medium transition-colors"
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </button>
          )}
        </div>
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} theme={state.theme} onThemeChange={actions.setTheme} />
        <ProfileSettingsModal isOpen={showProfileSettings} onClose={() => setShowProfileSettings(false)} />
      </aside>
  );
}
