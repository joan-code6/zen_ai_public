import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useTypedTranslation } from "@/hooks/useTranslation";
import { useChat } from "@/hooks/useChat";
import MessageBubble from "./MessageBubble";
import { Skeleton } from "@/components/ui/skeleton";
import FileInput from "./FileInput";
import ModelSelector from "@/components/chat/ModelSelector";
import { ArrowDown, Paperclip, Bot } from 'lucide-react';
import { ChatService, ChatFile, AIModel } from "@/services";

const suggestions = [
  "Explain quantum computing",
  "Help me debug code",
  "Write a story",
  "Plan a trip"
];

interface ChatWindowProps {
  chatId?: string | null;
}

export default function ChatWindow({ chatId = null }: ChatWindowProps) {
  const { user, isAuthenticated } = useAuth();
  const { actions } = useApp();
  const { t } = useTypedTranslation();
  const { chat, messages, isLoading, error, sendMessage, createChat, uploadFile } = useChat(chatId, { autoCreate: false });
  const [input, setInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isMultiLine, setIsMultiLine] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [showFileInput, setShowFileInput] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [selectedModelName, setSelectedModelName] = useState<string | undefined>(undefined);
  const [modelsDefault, setModelsDefault] = useState<AIModel | undefined>(undefined);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Load chat files when chat changes
  useEffect(() => {
    if (chat?.id && user?.uid) {
      setIsLoadingFiles(true);
      ChatService.getChatFiles(chat.id, user.uid)
        .then(setChatFiles)
        .catch((err) => {
          console.error('Failed to load chat files:', err);
          setChatFiles([]);
        })
        .finally(() => setIsLoadingFiles(false));
    } else {
      setChatFiles([]);
    }
  }, [chat?.id, user?.uid]);

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
    if ((!input.trim() && selectedFiles.length === 0) || !isAuthenticated || isLoading || isUploadingFiles) return;
    
    const content = input.trim();
    setInput("");
    textareaRef.current?.focus();
    setIsUploadingFiles(true);

    try {
       // Create chat if it doesn't exist (IMPORTANT: do this BEFORE file uploads)
      let targetChat = chat;
      if (!targetChat) {
        console.log('Creating new chat for message send');
        targetChat = await createChat(content.slice(0, 50) || t('navigation.newChat'));
        console.log('New chat created:', targetChat.id);
      } else {
        console.log('Using existing chat:', targetChat.id);
      }
      
      // Upload files if any are selected (use the same chat)
      let fileIds: string[] = [];
      if (selectedFiles.length > 0 && targetChat) {
        console.log(`Uploading ${selectedFiles.length} files to chat ${targetChat.id}`);
        for (const file of selectedFiles) {
          try {
            const uploadedFile = await ChatService.uploadChatFile(targetChat.id, user!.uid, file);
            console.log(`File uploaded: ${file.name} -> ${uploadedFile.id}`);
            fileIds.push(uploadedFile.id);
          } catch (error) {
            console.error(`Failed to upload file ${file.name}:`, error);
            actions.addToast(`Failed to upload ${file.name}`, 'error');
          }
        }
        setSelectedFiles([]);
        setShowFileInput(false);
      }

      // Send message with content and/or file IDs
      if (content || fileIds.length > 0) {
        console.log(`Sending message with ${fileIds.length} file IDs to chat ${targetChat.id}:`, fileIds);
        await sendMessage(content, fileIds, targetChat.id, selectedModel);
      }
    } catch (error) {
      // Error is already handled by the useChat hook
      console.error('Failed to send message:', error);
    } finally {
      setIsUploadingFiles(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function autoGrowTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 264) + 'px';
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    autoGrowTextarea(e.target);
    // Check if multi-line
    const lineCount = e.target.value.split('\n').length;
    setIsMultiLine(lineCount > 1);
  }

  useEffect(() => {
    if (textareaRef.current) {
      autoGrowTextarea(textareaRef.current);
    }
  }, [input]);

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

  function getFilesForMessage(fileIds?: string[]): ChatFile[] {
    if (!fileIds || fileIds.length === 0) return [];
    return chatFiles.filter(f => fileIds.includes(f.id));
  }

  async function handleDownloadFile(file: ChatFile) {
    if (!chat || !user) return;
    try {
      const blob = await ChatService.downloadChatFile(chat.id, file.id, user.uid);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      actions.addToast(`Downloaded ${file.fileName}`, 'success');
    } catch (error) {
      console.error('Failed to download file:', error);
      actions.addToast('Failed to download file', 'error');
    }
  }

  useEffect(() => {
    if (listRef.current) {
      const shouldSmoothScroll = messages.length > 1;
      listRef.current.scrollIntoView({ behavior: shouldSmoothScroll ? "smooth" : "auto", block: "end" });
    }
  }, [messages]);

  const isNewChat = !chat || messages.length === 0;
  const isLoadingChat = chat && messages.length === 0 && isLoading;

   if (!isAuthenticated) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">{t('auth.signIn')} to start chatting</h2>
          <p className="text-muted-foreground">{t('marketing.smartAI')}</p>
        </div>
      </div>
    );
  }

  // Listen for default model from ModelSelector
  function handleModelChange(model: AIModel) {
    setSelectedModel(model.id);
    setSelectedModelName(model.name);
    setModelsDefault((prev) => prev ?? model);
  }

  // Only set default model once
  useEffect(() => {
    if (!selectedModel && modelsDefault) {
      setSelectedModel(modelsDefault.id);
      setSelectedModelName(modelsDefault.name);
    }
  }, [selectedModel, modelsDefault]);

  function formatModelLabel(modelName?: string, modelId?: string) {
    if (modelName) {
      const parts = modelName.split(':');
      const trimmed = (parts.length > 1 ? parts.slice(1).join(':') : modelName).trim();
      return trimmed || modelName.trim();
    }
    if (modelId) {
      return (modelId.split('/')[1] || modelId).trim();
    }
    return 'Select model';
  }

  const modelLabel = formatModelLabel(selectedModelName, selectedModel);

  return (
    <div className="h-full flex flex-col items-start p-0 relative">
      <div className="w-full h-full flex flex-col overflow-hidden">
        {isNewChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
            <div className="w-full max-w-4xl px-6">
              <h1 className="text-3xl font-semibold text-foreground mb-2">
                {t('chat.startConversation')}, {user?.displayName || user?.email || 'User'}
              </h1>
              <p className="text-muted-foreground mb-12">{t('chat.typeMessage')}</p>
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
              <div>
                {/* File Input */}
                {showFileInput && (
                  <FileInput
                    onFilesSelected={setSelectedFiles}
                    maxFileSize={10 * 1024 * 1024}
                    multiple={true}
                    disabled={isUploadingFiles}
                  />
                )}

                <div className="relative rounded-2xl border border-border/60 focus-within:ring-1 focus-within:ring-primary/30 transition-all duration-200 p-2">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything..."
                    className={`w-full min-h-[40px] max-h-[264px] resize-none p-3 ${isMultiLine ? 'pl-4 pr-4' : 'pl-4 pr-28'} rounded-xl bg-transparent border-0 focus:outline-none text-base placeholder:text-muted-foreground/70 overflow-hidden`}
                  />
                  {!isMultiLine && (
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                      {/* Model Selector Button */}
                      <button
                        onClick={() => setShowModelSelector(true)}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors h-9 px-2 rounded-lg hover:bg-muted max-w-[200px]"
                        aria-label="Select model"
                        title="Select model"
                      >
                        <Bot className="w-5 h-5" />
                        <span className="text-xs font-medium truncate">{modelLabel}</span>
                      </button>
                      <div className="flex items-center gap-1">
                        {/* File Upload Button */}
                        <button
                          onClick={() => setShowFileInput(!showFileInput)}
                          disabled={isUploadingFiles}
                          className={`flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-9 w-9 rounded-lg hover:bg-muted`}
                          aria-label="Attach files"
                          title="Attach files"
                        >
                          <Paperclip className="w-5 h-5" />
                        </button>
                        {/* Send Button */}
                        <button
                          onClick={send}
                          disabled={!input.trim() && selectedFiles.length === 0}
                          className={`flex items-center justify-center bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl hover:shadow-lg active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${(input.trim() || selectedFiles.length > 0) ? 'button-ready' : ''} h-9 w-9`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {isMultiLine && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {/* Model Selector Button */}
                      <button
                        onClick={() => setShowModelSelector(true)}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors h-9 px-2 rounded-lg hover:bg-muted max-w-[200px]"
                        aria-label="Select model"
                        title="Select model"
                      >
                        <Bot className="w-5 h-5" />
                        <span className="text-xs font-medium truncate">{modelLabel}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        {/* File Upload Button */}
                        <button
                          onClick={() => setShowFileInput(!showFileInput)}
                          disabled={isUploadingFiles}
                          className={`flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-9 w-9 rounded-lg hover:bg-muted`}
                          aria-label="Attach files"
                          title="Attach files"
                        >
                          <Paperclip className="w-5 h-5" />
                        </button>
                        {/* Send Button */}
                        <button
                          onClick={send}
                          disabled={!input.trim() && selectedFiles.length === 0}
                          className={`flex items-center justify-center bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl hover:shadow-lg active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${(input.trim() || selectedFiles.length > 0) ? 'button-ready' : ''} h-9 w-9`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
                {isLoadingChat ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'} items-start`}>
                        {i % 2 !== 0 && (
                          <Skeleton className="h-8 w-8 rounded-full mr-3 flex-shrink-0" />
                        )}
                        <div className={`max-w-[72%] space-y-2 ${i % 2 === 0 ? 'bg-foreground/10' : 'bg-card'}`}>
                          <Skeleton className={`h-4 ${i % 2 === 0 ? 'w-4/5 ml-auto' : 'w-4/5'}`} />
                          <Skeleton className={`h-4 ${i % 2 === 0 ? 'w-3/5 ml-auto' : 'w-3/4'}`} />
                          {i % 2 === 0 && <Skeleton className="h-4 w-2/5 ml-auto" />}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  messages.map((m, index) => {
                    const isLastAssistantMessage = m.role === 'assistant' && index === messages.length - 1;
                    const isStreaming = isLastAssistantMessage && isLoading && m.content && !m.id.startsWith('temp-');
                    const messageFiles = getFilesForMessage(m.fileIds);
                    
                    return (
                      <MessageBubble
                        key={m.id}
                        role={m.role as any}
                        isStreaming={isStreaming}
                        onCopy={() => handleCopy(m.content)}
                        onEdit={handleEdit}
                        onRegenerate={handleRegenerate}
                        fileIds={m.fileIds}
                        files={messageFiles}
                        onDownloadFile={handleDownloadFile}
                      >
                        {m.content}
                      </MessageBubble>
                    );
                  })
                )}
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

            <div className="px-6 pb-6 slide-up">
              <div className="max-w-4xl mx-auto space-y-2">
                {/* File Input */}
                {showFileInput && (
                  <FileInput
                    onFilesSelected={setSelectedFiles}
                    maxFileSize={10 * 1024 * 1024}
                    multiple={true}
                    disabled={isUploadingFiles}
                  />
                )}

                {/* Input Box */}
                <div className="relative rounded-2xl border border-border/60 focus-within:ring-1 focus-within:ring-primary/30 transition-all duration-200 p-2">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything..."
                    className={`w-full min-h-[40px] max-h-[264px] resize-none p-3 ${isMultiLine ? 'pl-4 pr-4' : 'pl-4 pr-28'} rounded-xl bg-transparent border-0 focus:outline-none text-base placeholder:text-muted-foreground/70 overflow-hidden`}
                  />
                  {!isMultiLine && (
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                      {/* Model Selector Button */}
                      <button
                        onClick={() => setShowModelSelector(true)}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors h-9 px-2 rounded-lg hover:bg-muted max-w-[200px]"
                        aria-label="Select model"
                        title="Select model"
                      >
                        <Bot className="w-5 h-5" />
                        <span className="text-xs font-medium truncate">{modelLabel}</span>
                      </button>
                      <div className="flex items-center gap-1">
                        {/* File Upload Button */}
                        <button
                          onClick={() => setShowFileInput(!showFileInput)}
                          disabled={isUploadingFiles}
                          className={`flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-9 w-9 rounded-lg hover:bg-muted`}
                          aria-label="Attach files"
                          title="Attach files"
                        >
                          <Paperclip className="w-5 h-5" />
                        </button>
                        {/* Send Button */}
                        <button
                          onClick={send}
                          disabled={!input.trim() && selectedFiles.length === 0}
                          className={`flex items-center justify-center bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl hover:shadow-lg active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${(input.trim() || selectedFiles.length > 0) ? 'button-ready' : ''} h-9 w-9`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {isMultiLine && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {/* Model Selector Button */}
                      <button
                        onClick={() => setShowModelSelector(true)}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors h-9 px-2 rounded-lg hover:bg-muted max-w-[200px]"
                        aria-label="Select model"
                        title="Select model"
                      >
                        <Bot className="w-5 h-5" />
                        <span className="text-xs font-medium truncate">{modelLabel}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        {/* File Upload Button */}
                        <button
                          onClick={() => setShowFileInput(!showFileInput)}
                          disabled={isUploadingFiles}
                          className={`flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-9 w-9 rounded-lg hover:bg-muted`}
                          aria-label="Attach files"
                          title="Attach files"
                        >
                          <Paperclip className="w-5 h-5" />
                        </button>
                        {/* Send Button */}
                        <button
                          onClick={send}
                          disabled={!input.trim() && selectedFiles.length === 0}
                          className={`flex items-center justify-center bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl hover:shadow-lg active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${(input.trim() || selectedFiles.length > 0) ? 'button-ready' : ''} h-9 w-9`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <ModelSelector
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
      />
    </div>
  );
}
