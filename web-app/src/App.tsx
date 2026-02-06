import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Providers } from "./contexts/Providers";
import { useAuth } from "./contexts/AuthContext";
import { useApp } from "./contexts/AppContext";
import { useNotifications } from "./hooks/useNotifications";
import Sidebar from "./components/layout/Sidebar";
import ChatWindow from "./components/layout/ChatWindow";
import EmailView from "./components/email/EmailViewReal";
import CalendarView from "./components/calendar/CalendarViewReal";
import NotesView from "./components/notes/NotesView";
import FilesView from "./components/files/FilesView";
import { Skeleton } from "./components/ui/skeleton";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import Spotlight from "./components/search/Spotlight";
import { Menu } from 'lucide-react';
import EmailService from "./services/emailService";
import CalendarService from "./services/calendarService";

function AppContent() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { state, actions } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [chatKey, setChatKey] = useState(0);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
   const oauthHandledRef = useRef(false);
   const [spotlightOpen, setSpotlightOpen] = useState(false);
   
   // Initialize notifications
   useNotifications(user?.uid || null);
   
   // Check if we're on an auth page
   const isAuthPage = ['/login', '/signup', '/forgot-password', '/onboarding'].includes(location.pathname);

  function handleNewChat() {
    navigate('/');
    setCurrentChatId(null);
    setChatKey((prev) => prev + 1);
  }

  function handleChatSelect(chatId: string) {
    navigate(`/chat/${chatId}`);
    setCurrentChatId(chatId);
    setChatKey((prev) => prev + 1);
    
    // Close sidebar on mobile after selecting a chat
    if (isMobile) {
      actions.setSidebarOpen(false);
    }
  }

  function handleSidebarToggle() {
    actions.toggleSidebar();
  }

   function handleAuthClick() {
     if (isAuthenticated) {
       // TODO: Show user menu
       console.log('Show user menu');
     } else {
       navigate('/login', { state: { from: location.pathname } });
     }
   }

   function handleSpotlightToggle() {
     setSpotlightOpen(prev => !prev);
   }

  function renderCurrentView() {
    return (
      <Routes>
        <Route 
          path="/onboarding" 
          element={
            !isAuthenticated ? <Navigate to="/login" replace /> : <OnboardingPage />
          } 
        />
        <Route 
          path="/login" 
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
          } 
        />
        <Route 
          path="/signup" 
          element={
            isAuthenticated ? <Navigate to="/onboarding" replace /> : <SignupPage />
          } 
        />
        <Route 
          path="/forgot-password" 
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <ForgotPasswordPage />
          } 
        />
        <Route 
          path="/" 
          element={
            !isAuthenticated ? <Navigate to="/login" replace /> : <ChatWindow key={chatKey} chatId={currentChatId} />
          } 
        />
        <Route 
          path="/chat/:chatId" 
          element={
            !isAuthenticated ? <Navigate to="/login" replace /> : <ChatWindow key={chatKey} chatId={currentChatId} />
          } 
        />
        <Route 
          path="/email" 
          element={
            !isAuthenticated ? <Navigate to="/login" replace /> : <EmailView />
          } 
        />
        <Route 
          path="/calendar" 
          element={
            !isAuthenticated ? <Navigate to="/login" replace /> : <CalendarView />
          } 
        />
        <Route 
          path="/notes" 
          element={
            !isAuthenticated ? <Navigate to="/login" replace /> : <NotesView />
          } 
        />
        <Route 
          path="/files" 
          element={
            !isAuthenticated ? <Navigate to="/login" replace /> : <FilesView />
          } 
        />
      </Routes>
    );
  }

  // Destructure addToast to avoid unstable actions object in dependency array
  const { addToast } = actions;
  useEffect(() => {
    const isEmailCallback = location.pathname === '/email-callback';
    const isCalendarCallback = location.pathname === '/calendar-callback';

    if (!isEmailCallback && !isCalendarCallback) return;

    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const code = params.get('code');
    const codeVerifier = params.get('code_verifier') || undefined;
    const redirectUri = `${window.location.origin}${location.pathname}`;

    const finalize = (view: 'email' | 'calendar') => {
      navigate(`/${view}`);
      oauthHandledRef.current = true;
    };

    const run = async () => {
      try {
        if (error) {
          addToast(errorDescription || 'Authorization failed', 'error');
          finalize(isEmailCallback ? 'email' : 'calendar');
          return;
        }

        if (!code) {
          addToast('Missing authorization code', 'error');
          finalize(isEmailCallback ? 'email' : 'calendar');
          return;
        }

        if (!isAuthenticated || !user) {
          // Persist pending OAuth so we can complete it after sign-in
          try {
            localStorage.setItem(
              'zen_pending_oauth',
              JSON.stringify({ code, codeVerifier, redirectUri, type: isEmailCallback ? 'email' : 'calendar' })
            );
            addToast('Completing connection after sign-in...', 'info');
          } catch (err) {
            console.warn('Failed to persist pending oauth:', err);
            addToast('Please sign in to complete connection', 'error');
            finalize(isEmailCallback ? 'email' : 'calendar');
          }
          return;
        }

        if (isEmailCallback) {
          await EmailService.exchangeGmailCode({ code, redirectUri, codeVerifier });
          addToast('Gmail connected', 'success');
          finalize('email');
        } else if (isCalendarCallback) {
          await CalendarService.exchangeGoogleCalendarCode({ code, redirectUri, codeVerifier });
          addToast('Google Calendar connected', 'success');
          finalize('calendar');
        }
      } catch (err) {
        console.error('OAuth callback failed:', err);
        addToast('Connection failed. Please try again.', 'error');
        finalize(isEmailCallback ? 'email' : 'calendar');
      }
    };

    run();
  }, [location, navigate, addToast, isAuthenticated, user]);

  // When user becomes authenticated, check for pending OAuth and complete exchange
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (oauthHandledRef.current) return;

    const pendingRaw = localStorage.getItem('zen_pending_oauth');
    if (!pendingRaw) return;

    let pending: { code?: string; codeVerifier?: string; redirectUri?: string; type?: string } | null = null;
    try {
      pending = JSON.parse(pendingRaw);
    } catch (err) {
      console.warn('Invalid pending oauth data', err);
      localStorage.removeItem('zen_pending_oauth');
      return;
    }

    if (!pending || !pending.code || !pending.redirectUri || !pending.type) {
      localStorage.removeItem('zen_pending_oauth');
      return;
    }

    oauthHandledRef.current = true;

    (async () => {
      try {
         if (pending!.type === 'email') {
           await EmailService.exchangeGmailCode({ code: pending!.code!, redirectUri: pending!.redirectUri!, codeVerifier: pending!.codeVerifier });
           actions.addToast('Gmail connected', 'success');
           navigate('/email');
         } else if (pending!.type === 'calendar') {
           await CalendarService.exchangeGoogleCalendarCode({ code: pending!.code!, redirectUri: pending!.redirectUri!, codeVerifier: pending!.codeVerifier });
           actions.addToast('Google Calendar connected', 'success');
           navigate('/calendar');
         }
      } catch (err) {
        console.error('Completing pending OAuth failed:', err);
        actions.addToast('Failed to complete connection', 'error');
      } finally {
        localStorage.removeItem('zen_pending_oauth');
         // Clean up URL
         navigate('/');
      }
    })();
  }, [isAuthenticated, user, actions, navigate]);

  // Sync URL with app state and extract chat ID
  useEffect(() => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    
    if (pathSegments.length === 0) {
      // Root path - new chat
      setCurrentChatId(null);
    } else if (pathSegments[0] === 'chat' && pathSegments[1]) {
      // Chat ID path
      setCurrentChatId(pathSegments[1]);
    } else if (pathSegments[0] === 'email' || pathSegments[0] === 'calendar' || 
               pathSegments[0] === 'notes' || pathSegments[0] === 'files') {
      // Other views
      setCurrentChatId(null);
    }
  }, [location]);

   // Handle window resize
   useEffect(() => {
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
   }, [actions]);

   // Handle keyboard shortcuts
   useEffect(() => {
     function handleKeyDown(e: KeyboardEvent) {
       // Cmd/Ctrl + K to open Spotlight
       if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !e.shiftKey) {
         e.preventDefault();
         setSpotlightOpen(true);
       }
     }

     window.addEventListener('keydown', handleKeyDown);

     return () => window.removeEventListener('keydown', handleKeyDown);
   }, []);

   if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground p-8">
        <div className="w-full max-w-2xl space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="space-y-2 pt-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background text-foreground">
      {/* Mobile sidebar toggle button */}
      {isMobile && !isAuthPage && (
        <button
          onClick={handleSidebarToggle}
          className="fixed top-4 left-4 z-50 p-2 bg-popover border border-border rounded-lg shadow-lg hover:shadow-xl transition-all md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      
      {/* Mobile overlay */}
      {isMobile && state.sidebarOpen && !isAuthPage && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={handleSidebarToggle}
        />
      )}
      
      {!isAuthPage && (
         <Sidebar
           onNewChat={handleNewChat}
           onAuthClick={handleAuthClick}
           onSearchClick={handleSpotlightToggle}
           isMobile={isMobile}
           isSidebarOpen={state.sidebarOpen}
           onSidebarToggle={handleSidebarToggle}
           currentChatId={currentChatId}
           onChatSelect={handleChatSelect}
         />
       )}
       <main className="flex-1 overflow-hidden">
         {renderCurrentView()}
       </main>
       
       {/* Spotlight Search */}
       <Spotlight isOpen={spotlightOpen} onClose={handleSpotlightToggle} />
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
