import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useChat } from "@/hooks/useChat";
import MessageBubble from "./MessageBubble";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ArrowDown } from 'lucide-react';

const suggestions = [
  "Explain quantum computing",
  "Help me debug code",
  "Write a story",
  "Plan a trip"
];

export default function ChatWindow() {
  const { user, isAuthenticated } = useAuth();
  const { actions } = useApp();
  const { chat, messages, isLoading, error, sendMessage, createChat } = useChat(null, { autoCreate: true });
  const [input, setInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Show error toast if there's an error
  useEffect(() => {
    if (error) {
      actions.addToast(error, 'error');
    }
  }, [error, actions]);

  function handleScroll() {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom && messages.length > 0);
    }
  }

  function scrollToBottom() {
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  async function send() {
    if (!input.trim() || !isAuthenticated || isLoading) return;
    
    const content = input.trim();
    setInput("");
    textareaRef.current?.focus();

    try {
      await sendMessage(content);
    } catch (error) {
      // Error is already handled by the useChat hook
      console.error('Failed to send message:', error);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleCopy(messageText: string) {
    navigator.clipboard.writeText(messageText);
    actions.addToast("Copied to clipboard", "success");
  }

  function handleEdit() {
    actions.addToast("Edit feature coming soon!", "info");
  }

  function handleRegenerate() {
    actions.addToast("Regenerating response...", "info");
  }

  useEffect(() => {
    if (listRef.current) {
      const shouldSmoothScroll = messages.length > 1;
      listRef.current.scrollIntoView({ behavior: shouldSmoothScroll ? "smooth" : "auto", block: "end" });
    }
  }, [messages]);

  const isNewChat = messages.length === 0;

  if (!isAuthenticated) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Sign in to start chatting</h2>
          <p className="text-muted-foreground">Connect with AI to get personalized assistance</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-start p-0 relative">
      <div className="w-full h-full flex flex-col overflow-hidden">
        {isNewChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
            <div className="w-full max-w-4xl px-6">
              <h1 className="text-3xl font-semibold text-foreground mb-2">
                Hello, {user?.displayName || user?.email || 'User'}
              </h1>
              <p className="text-muted-foreground mb-12">How can I help you today?</p>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="text-left px-4 py-3 rounded-xl border border-border/50 hover:border-border bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all duration-200 text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>  
              <div className="flex gap-3 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  className="flex-1 min-h-[56px] max-h-48 resize-none p-4 pr-14 rounded-3xl bg-input/80 border border-border/50 focus:outline-none input-glow transition-all duration-200 text-base placeholder:text-muted-foreground/60"
                />
                <button
                  onClick={send}
                  disabled={!input.trim()}
                  className={`h-12 w-12 flex items-center justify-center bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-md disabled:hover:translate-y-0 ${input.trim() ? 'button-ready' : ''}`}
                >
                  <svg className="w-5 h-5 -mr-0.5 -mt-0.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto space-y-6 bg-gradient-to-b from-transparent to-muted/10 custom-scrollbar scroll-smooth relative"
            >
              <div className="p-6 max-w-4xl mx-auto" ref={listRef}>
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    role={m.role as any}
                    isStreaming={m.isStreaming}
                    onCopy={() => handleCopy(m.text)}
                    onEdit={handleEdit}
                    onRegenerate={handleRegenerate}
                  >
                    {m.text}
                  </MessageBubble>
                ))}
              </div>
            </div>

            {showScrollButton && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-32 left-1/2 -translate-x-1/2 p-2 bg-popover border border-border rounded-full shadow-lg hover:shadow-xl transition-all animate-in fade-in slide-in-from-bottom-2"
              >
                <ArrowDown className="w-5 h-5 text-muted-foreground" />
              </button>
            )}

            <div className="p-6 border-t border-border/50 bg-gradient-to-t from-popover/90 to-popover/50 backdrop-blur-sm slide-up">
              <div className="max-w-4xl mx-auto">
                <div className="flex gap-3 items-end">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything..."
                    className="flex-1 min-h-[56px] max-h-48 resize-none p-4 pr-14 rounded-3xl bg-input/80 border border-border/50 focus:outline-none input-glow transition-all duration-200 text-base placeholder:text-muted-foreground/60"
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim()}
                    className={`h-12 w-12 flex items-center justify-center bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-md disabled:hover:translate-y-0 ${input.trim() ? 'button-ready' : ''}`}
                  >
                    <svg className="w-5 h-5 -mr-0.5 -mt-0.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {isLoading && <LoadingSpinner size="lg" withBackdrop />}
    </div>
  );
}
