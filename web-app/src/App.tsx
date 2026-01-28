import React, { useState } from "react";
import { Providers } from "./contexts/Providers";
import { useAuth } from "./contexts/AuthContext";
import { useApp } from "./contexts/AppContext";
import AuthModal from "./components/auth/AuthModal";
import Sidebar from "./components/layout/Sidebar";
import ChatWindow from "./components/layout/ChatWindow";
import EmailView from "./components/email/EmailView";
import CalendarView from "./components/calendar/CalendarView";
import LoadingSpinner from "./components/LoadingSpinner";
import { Menu, LogIn, User } from 'lucide-react';

type View = 'chat' | 'email' | 'calendar';

function AppContent() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { state, actions } = useApp();
  const [chatKey, setChatKey] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showAuthModal, setShowAuthModal] = useState(false);

  function handleNewChat() {
    actions.setCurrentView('chat');
    setChatKey((prev) => prev + 1);
  }

  function handleSidebarToggle() {
    actions.toggleSidebar();
  }

  function handleAuthClick() {
    if (isAuthenticated) {
      // TODO: Show user menu
      console.log('Show user menu');
    } else {
      setShowAuthModal(true);
    }
  }

  function renderCurrentView() {
    switch (state.currentView) {
      case 'email':
        return <EmailView />;
      case 'calendar':
        return <CalendarView />;
      default:
        return <ChatWindow key={chatKey} />;
    }
  }

  // Handle window resize
  React.useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        actions.setSidebarOpen(false);
      } else {
        actions.setSidebarOpen(true);
      }
    }

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background text-foreground">
      {/* Mobile sidebar toggle button */}
      {isMobile && (
        <button
          onClick={handleSidebarToggle}
          className="fixed top-4 left-4 z-50 p-2 bg-popover border border-border rounded-lg shadow-lg hover:shadow-xl transition-all md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Mobile overlay */}
      {isMobile && state.sidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={handleSidebarToggle}
        />
      )}

      <Sidebar
        onNewChat={handleNewChat}
        onAuthClick={handleAuthClick}
        isMobile={isMobile}
        isSidebarOpen={state.sidebarOpen}
        onSidebarToggle={handleSidebarToggle}
      />
      <main className="flex-1 overflow-hidden">
        {renderCurrentView()}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}

export function App() {
  return (
    <Providers>
      <AppContent />
    </Providers>
  );
}

export default App;
