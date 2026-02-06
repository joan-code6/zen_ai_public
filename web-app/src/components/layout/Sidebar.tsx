import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useTypedTranslation } from "@/hooks/useTranslation";
import { MessageCircle, FileText, Calendar, Mail, Search, Plus, ChevronDown, Settings, HelpCircle, LogOut, LogIn, User, Trash2, Edit3, HardDrive, StickyNote } from 'lucide-react';
import SettingsModal from "@/components/settings/SettingsModal";
import ProfileSettingsModal from "@/components/settings/ProfileSettingsModal";
import { useChats } from "@/hooks/useChats";
import { Chat } from "@/services";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  onSearchClick?: () => void;
  isMobile?: boolean;
  isSidebarOpen?: boolean;
  onSidebarToggle?: () => void;
  currentChatId?: string | null;
  onChatSelect?: (chatId: string) => void;
}

export default function Sidebar({ onNewChat, onAuthClick, onSearchClick, isMobile = false, isSidebarOpen = true, onSidebarToggle, currentChatId, onChatSelect }: SidebarProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const { state, actions } = useApp();
  const { t } = useTypedTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { chats, isLoading, deleteChat, updateChat, loadMore, hasMore, isLoadingMore } = useChats();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const chatsContainerRef = useRef<HTMLDivElement>(null);

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

  function handleEditChat(chat: Chat, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title || '');
  }

  async function handleSaveEdit(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!editingTitle.trim()) {
      actions.addToast('Title cannot be empty', 'error');
      return;
    }
    try {
      await updateChat(chatId, editingTitle);
      setEditingChatId(null);
      setEditingTitle("");
    } catch (err) {
      // Error already handled by useChats hook
    }
  }

  function handleCancelEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditingChatId(null);
    setEditingTitle("");
  }

  async function handleDeleteChat(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteChatId(chatId);
  }

  async function confirmDeleteChat() {
    if (!deleteChatId) return;
    try {
      await deleteChat(deleteChatId);
      if (currentChatId === deleteChatId) {
        if (chats.length > 1) {
          onChatSelect?.(chats.find(c => c.id !== deleteChatId)?.id || '');
        } else {
          navigate('/');
        }
      }
    } catch (err) {
      // Error already handled by useChats hook
    } finally {
      setDeleteChatId(null);
    }
  }

  function groupChatsByDate(chats: Chat[]) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const groups: { [key: string]: Chat[] } = {
      'Today': [],
      'Yesterday': [],
      'Previous 7 Days': [],
      'Older': []
    };

    chats.forEach(chat => {
      const chatDate = new Date(chat.updatedAt);
      const chatDay = new Date(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate());

      if (chatDay.getTime() === today.getTime()) {
        groups['Today'].push(chat);
      } else if (chatDay.getTime() === yesterday.getTime()) {
        groups['Yesterday'].push(chat);
      } else if (chatDay >= sevenDaysAgo) {
        groups['Previous 7 Days'].push(chat);
      } else {
        groups['Older'].push(chat);
      }
    });

    return groups;
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

  useEffect(() => {
    const container = chatsContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      
      if (isNearBottom && hasMore && !isLoadingMore && !isLoading) {
        loadMore();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoadingMore, isLoading, loadMore]);

  // Show auth modal when user clicks on chat without being authenticated
  const handleProtectedAction = () => {
    if (!isAuthenticated) {
      onAuthClick?.();
      return;
    }
    onNewChat?.();
  };

  const handleNavigation = (path: string) => {
    if (isAuthenticated) {
      navigate(path);
      if (isMobile) {
        onSidebarToggle?.();
      }
    }
  };

  return (
    <aside
      className={`bg-sidebar p-4 flex flex-col gap-4 ${isMobile ? 'fixed top-0 left-0 h-full w-64 transform transition-transform duration-300 ease-in-out z-50 md:hidden' : 'relative w-60 border-r border-sidebar-border'} ${isMobile && !isSidebarOpen ? '-translate-x-full' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">
          Zen AI
        </div>
      </div>

        <button
          onClick={onSearchClick}
          className="w-full flex items-center bg-input border border-border rounded-lg px-3 py-2.5 gap-2 hover:border-border/80 transition-colors"
        >
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-muted-foreground">{t('sidebar.search')}</span>
        </button>

        <button onClick={handleProtectedAction} className="w-full py-2.5 bg-foreground text-background rounded-lg shadow-sm hover:brightness-95 flex items-center justify-center gap-2 font-medium group">
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
          {t('navigation.newChat')}
        </button>

        <div className="pt-4 space-y-1">
          <NavItem 
            icon={<Mail />} 
            isActive={location.pathname === '/email'}
            onClick={() => handleNavigation('/email')}
          >
            {t('navigation.email')}
          </NavItem>
          <NavItem 
            icon={<Calendar />} 
            isActive={location.pathname === '/calendar'}
            onClick={() => handleNavigation('/calendar')}
          >
            {t('navigation.calendar')}
          </NavItem>
          <NavItem 
            icon={<StickyNote />} 
            isActive={location.pathname === '/notes'}
            onClick={() => handleNavigation('/notes')}
          >
            {t('navigation.notes')}
          </NavItem>
          <NavItem 
            icon={<HardDrive />} 
            isActive={location.pathname === '/files'}
            onClick={() => handleNavigation('/files')}
          >
            {t('navigation.files')}
          </NavItem>
        </div>

        <nav className="flex-1 overflow-y-auto pt-2 space-y-6 custom-scrollbar" ref={chatsContainerRef}>
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-4">{t('common.loading')}</div>
          ) : !isAuthenticated ? (
            <div className="text-center text-sm text-muted-foreground py-4">{t('auth.signIn')}</div>
          ) : chats.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-4">{t('sidebar.noChats')}</div>
          ) : (
            <>
              {Object.entries(groupChatsByDate(chats))
                .filter(([_, groupChats]) => groupChats.length > 0)
                .map(([groupName, groupChats]) => (
                  <div key={groupName}>
                    <div className="text-xs text-muted-foreground uppercase mb-2 font-medium">{groupName}</div>
                    <div className="flex flex-col gap-1">
                      {groupChats.map((chat) => (
                        <div key={chat.id}>
                          {editingChatId === chat.id ? (
                            <div className="px-2 py-1.5 flex items-center gap-1.5 rounded-lg">
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 min-w-0 bg-input border border-border rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit(chat.id, e as any);
                                  if (e.key === 'Escape') handleCancelEdit(e as any);
                                }}
                              />
                              <button
                                onClick={(e) => handleSaveEdit(chat.id, e)}
                                className="p-1 rounded-md hover:bg-primary/10 text-primary transition-colors flex-shrink-0"
                                title="Save"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors flex-shrink-0"
                                title="Cancel"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <NavItem
                              icon={<MessageCircle />}
                              isActive={currentChatId === chat.id}
                              onClick={() => onChatSelect?.(chat.id)}
                              actions={
                                <div className="flex gap-1">
                                  <button
                                    onClick={(e) => handleEditChat(chat, e)}
                                    className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                    title="Edit chat name"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <AlertDialog open={deleteChatId === chat.id} onOpenChange={(open) => !open && setDeleteChatId(null)}>
                                    <AlertDialogTrigger asChild>
                                      <button
                                        onClick={(e) => handleDeleteChat(chat.id, e)}
                                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                        title="Delete chat"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Chat</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete this chat? This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={confirmDeleteChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              }
                            >
                              {chat.title || 'Untitled Chat'}
                            </NavItem>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              {isLoadingMore && (
                <div className="text-center text-sm text-muted-foreground py-4">Loading more chats...</div>
              )}
              {!hasMore && chats.length > 0 && (
                <div className="text-center text-xs text-muted-foreground py-4">No more chats</div>
              )}
            </>
          )}
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
                    {t('settings.profile')}
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
