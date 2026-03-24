import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useTypedTranslation } from "@/hooks/useTranslation";
import { useChat } from "@/hooks/useChat";
import MessageBubble from "./MessageBubble";
import Lottie from "lottie-react";
import lottieZenIcon from "@/assets/Zen AI Icon.json";
import FileInput, { FileInputHandle } from "./FileInput";
import VoiceInput from "./VoiceInput";
import ModelSelector from "@/components/chat/ModelSelector";
import ImageConfigPopup, { ImageConfig } from "@/components/image/ImageConfigPopup";
import { ArrowDown, Paperclip, Bot, Globe, Image, Square } from 'lucide-react';
import { ChatService, ChatFile, AIModel, ImageService, Message } from "@/services";

const SELECTED_MODEL_KEY = 'zen_selected_model';
const SELECTED_MODEL_NAME_KEY = 'zen_selected_model_name';

const suggestions = [
  "Explain quantum computing",
  "Help me debug code",
  "Write a story",
  "Plan a trip"
];

function getDefaultModelFromCache(): string | undefined {
  try {
    const cached = localStorage.getItem('zen_settings');
    if (cached) {
      const s = JSON.parse(cached);
      return (s.defaultModel as string | undefined) || undefined;
    }
  } catch {}
  return undefined;
}

interface ChatWindowProps {
  chatId?: string | null;
}

export default function ChatWindow({ chatId = null }: ChatWindowProps) {
  const { user, isAuthenticated } = useAuth();
  const { state, actions } = useApp();
  const { t } = useTypedTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const resolvedChatId = chatId ?? params.chatId ?? null;
  const { 
    chat, 
    messages, 
    mcpRequests, 
    isLoading, 
    error, 
    sendMessage, 
    createChat, 
    uploadFile, 
    stopGeneration,
    clearMCPRequests 
  } = useChat(resolvedChatId, { autoCreate: false });
  const [input, setInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const [selectedModel, setSelectedModel] = useState<string | undefined>(() => {
    return localStorage.getItem(SELECTED_MODEL_KEY) || getDefaultModelFromCache();
  });
  const [selectedModelName, setSelectedModelName] = useState<string | undefined>(() => {
    const id = localStorage.getItem(SELECTED_MODEL_NAME_KEY) || getDefaultModelFromCache();
    return id ? id.split('/')[1] || id : undefined;
  });
  const [selectedModelObject, setSelectedModelObject] = useState<AIModel | undefined>(undefined);
  const [modelsDefault, setModelsDefault] = useState<AIModel | undefined>(undefined);
  const settingsApplied = useRef(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSearchMaxResults, setWebSearchMaxResults] = useState(3);

  // Image generation state
  const [imageMode, setImageMode] = useState(false);
  const [showImageConfigPopup, setShowImageConfigPopup] = useState(false);
  const [imageConfig, setImageConfig] = useState<ImageConfig>({
    model: '', // Will be set by ImageConfigPopup when it loads available models
    size: '1024x1024',
    quality: 'standard',
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [voiceIsRecording, setVoiceIsRecording] = useState(false);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<FileInputHandle>(null);

  // Combined messages (real chat + local image results), sorted by time
  const displayMessages = messages.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const isLoadingChat = Boolean(resolvedChatId) && messages.length === 0 && isLoading;
  const isNewChat = !resolvedChatId && messages.length === 0;

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
      setShowScrollButton(!isNearBottom && displayMessages.length > 0);
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

    // === Image mode: generate image instead of normal chat ===
    if (imageMode && content) {
      try {
        actions.setChatLoading(true);
        
        // Create chat if it doesn't exist (IMPORTANT: do this BEFORE image generation)
        let targetChat = chat;
        if (!targetChat) {
          console.log('Creating new chat for image generation');
          targetChat = await createChat(t('navigation.newChat'));
          console.log('New chat created:', targetChat.id);
          navigate(`/chat/${targetChat.id}`);
        }

        console.log('Generating image...');
        const result = await ImageService.generateImages({
          prompt: content,
          model: imageConfig.model,
          size: imageConfig.size,
          quality: imageConfig.quality,
          n: 1,
        });
        
        // Handle new format (with file_id) or old format (with url)
        const generatedImage = result.images[0];
        if (!generatedImage) {
          throw new Error('No image generated');
        }

        let fileIds: string[] = [];
        let messageContent = content;  // Use the original prompt as message content
        
        if (generatedImage.file_id) {
          // New format: file_id returned from backend
          fileIds = [generatedImage.file_id];
          console.log('Got file_id from backend:', generatedImage.file_id);
        } else if (generatedImage.url) {
          // Old format: url returned
          console.log('Got URL from backend (old format)');
          messageContent = `![${t('imageGenerator.generatedImage')}](${generatedImage.url})`;
        } else {
          throw new Error('Generated image has no file_id or url');
        }

        const revisedPrompt = generatedImage.revised_prompt;
        if (revisedPrompt && revisedPrompt !== content) {
          messageContent = `*${revisedPrompt}*`;
        }

        console.log('Sending image message to backend with fileIds:', fileIds);
        // Send as a proper message with file attachment
        await sendMessage(messageContent, fileIds, targetChat.id, selectedModel);
        console.log('Image message sent and stored');
        
      } catch (err: any) {
        const msg = err?.message || t('imageGenerator.generationFailed');
        console.error('Image generation error:', err);
        actions.addToast(msg, 'error');
      } finally {
        actions.setChatLoading(false);
      }
      return;
    }

    // === Normal chat flow ===
    setIsUploadingFiles(true);

    try {
       // Create chat if it doesn't exist (IMPORTANT: do this BEFORE file uploads)
      let targetChat = chat;
      if (!targetChat) {
        console.log('Creating new chat for message send');
        targetChat = await createChat(t('navigation.newChat'));
        console.log('New chat created:', targetChat.id);
        navigate(`/chat/${targetChat.id}`);
      } else {
        console.log('Using existing chat:', targetChat.id);
      }
      
      // Upload files if any are selected (use the same chat)
      const fileIds: string[] = [];
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
      }

      // Send message with content and/or file IDs
      if (content || fileIds.length > 0) {
        console.log(`Sending message with ${fileIds.length} file IDs to chat ${targetChat.id}:`, fileIds);
        const webSearchConfig = webSearchEnabled
          ? { enabled: true, maxResults: webSearchMaxResults }
          : undefined;
        await sendMessage(content, fileIds, targetChat.id, selectedModel, webSearchConfig);
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
  }

  function validateAndAddFiles(files: FileList | File[]) {
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const validFiles: File[] = [];
    const modelSupportsVision = selectedModelObject?.supportsVision ?? true;
    
    Array.from(files).forEach((file) => {
      if (file.size > maxFileSize) {
        actions.addToast(`"${file.name}" exceeds 10MB limit`, 'error');
        return;
      }
      
      // Check if model supports vision for image files
      const isImageFile = file.type.startsWith('image/');
      if (isImageFile && !modelSupportsVision) {
        actions.addToast(t('chat.modelNoVision', { fileName: file.name }), 'warning');
        return;
      }
      
      validFiles.push(file);
    });
    
    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploadingFiles) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (isUploadingFiles) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      validateAndAddFiles(files);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (isUploadingFiles) return;
    
    const items = e.clipboardData.items;
    const files: File[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
    
    if (files.length > 0) {
      validateAndAddFiles(files);
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      autoGrowTextarea(textareaRef.current);
    }
  }, [input]);

  useEffect(() => {
    if (voiceIsRecording || isLoadingChat) return;

    const frame = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      const cursor = textarea.value.length;
      textarea.setSelectionRange(cursor, cursor);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [resolvedChatId, isNewChat, isLoadingChat, voiceIsRecording]);

  // When voice recording starts, blur the textarea and prevent typing
  useEffect(() => {
    if (voiceIsRecording) {
      textareaRef.current?.blur();
    }
  }, [voiceIsRecording]);

  // Voice input handlers
  function handleVoiceTranscribeStart() {
    setIsVoiceProcessing(true);
  }

  function handleVoiceTranscribeComplete(text: string) {
    setIsVoiceProcessing(false);
    setInput(text);
    textareaRef.current?.focus();
    actions.addToast(t('voice.transcriptionSuccess'), 'success');
  }

  function handleVoiceError(error: string) {
    setIsVoiceProcessing(false);
    actions.addToast(error, 'error');
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
      const shouldSmoothScroll = displayMessages.length > 1;
      listRef.current.scrollIntoView({ behavior: shouldSmoothScroll ? "smooth" : "auto", block: "end" });
    }
  }, [displayMessages]);

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
    localStorage.setItem(SELECTED_MODEL_KEY, model.id);
    if (model.name) localStorage.setItem(SELECTED_MODEL_NAME_KEY, model.name);
    setModelsDefault((prev) => prev ?? model);
    setSelectedModelObject(model);
  }

  // Apply user's preferred default model from settings (only once per mount)
  useEffect(() => {
    if (settingsApplied.current) return;
    const userDefaultModel = state.settings?.defaultModel;
    if (userDefaultModel) {
      settingsApplied.current = true;
      setSelectedModel(userDefaultModel);
      setSelectedModelName(userDefaultModel.split('/')[1] || userDefaultModel);
    }
  }, [state.settings?.defaultModel]);

  // Only set default model once
  useEffect(() => {
    if (!selectedModel && modelsDefault) {
      setSelectedModel(modelsDefault.id);
      setSelectedModelName(modelsDefault.name);
      localStorage.setItem(SELECTED_MODEL_KEY, modelsDefault.id);
      if (modelsDefault.name) localStorage.setItem(SELECTED_MODEL_NAME_KEY, modelsDefault.name);
      setSelectedModelObject(modelsDefault);
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

  function handleImageButtonClick() {
    if (imageMode) {
      // Toggle off
      setImageMode(false);
      setShowImageConfigPopup(false);
    } else {
      // Open config popup
      setShowImageConfigPopup(prev => !prev);
    }
  }

  function handleImageConfigApply() {
    setShowImageConfigPopup(false);
    setImageMode(true);
  }

  // Shared toolbar left buttons (model, web, image)
  function renderLeftButtons() {
    return (
      <div className="flex items-center gap-2">
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
        {/* Web Search Toggle */}
        <button
          type="button"
          onClick={() => setWebSearchEnabled(prev => !prev)}
          className={`flex items-center gap-2 text-xs h-8 px-2 rounded-md border transition-colors ${
            webSearchEnabled
              ? 'border-primary/60 text-primary bg-primary/10'
              : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
          }`}
          aria-pressed={webSearchEnabled}
          aria-label="Toggle web search"
          title="Web search"
        >
          <Globe className="w-4 h-4" />
          <span>Web</span>
        </button>
        {webSearchEnabled && (
          <select
            value={webSearchMaxResults}
            onChange={(e) => setWebSearchMaxResults(Number(e.target.value))}
            className="h-8 rounded-md border border-border/60 bg-background text-xs px-2 text-foreground"
            aria-label="Web search results count"
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count} result{count === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        )}
        {/* Image Generation Toggle — relative for popup positioning */}
        <div className="relative">
          <button
            type="button"
            onClick={handleImageButtonClick}
            className={`flex items-center gap-1.5 text-xs h-8 px-2 rounded-md border transition-colors ${
              imageMode
                ? 'border-primary/60 text-primary bg-primary/10'
                : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
            }`}
            aria-pressed={imageMode}
            aria-label={imageMode ? t('imageGenerator.disableMode') : t('imageGenerator.enableMode')}
            title={imageMode ? t('imageGenerator.disableMode') : t('imageGenerator.enableMode')}
          >
            <Image className="w-4 h-4" />
            <span>{t('imageGenerator.image')}</span>
          </button>
          <ImageConfigPopup
            isOpen={showImageConfigPopup}
            config={imageConfig}
            onChange={setImageConfig}
            onApply={handleImageConfigApply}
            onClose={() => setShowImageConfigPopup(false)}
          />
        </div>
      </div>
    );
  }

  // Shared toolbar right buttons (file, send)
  function renderRightButtons() {
    const hasInput = input.trim().length > 0 || selectedFiles.length > 0;

    return (
      <div className="flex items-center gap-1">
        {/* File Upload Button */}
        <button
          onClick={() => fileInputRef.current?.openFilePicker()}
          disabled={isUploadingFiles}
          className={`flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-9 w-9 rounded-lg hover:bg-muted ${selectedFiles.length > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          aria-label="Attach files"
          title="Attach files"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Stop generation / Voice / Send */}
        {state.loading.chat ? (
          <button
            onClick={stopGeneration}
            className={`flex items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded-xl hover:shadow-lg active:translate-y-0 transition-all duration-200 h-9 w-9`}
            aria-label="Stop generation"
            title="Stop generation"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : !hasInput ? (
          <VoiceInput
            canvasRef={waveformCanvasRef}
            onRecordingStateChange={setVoiceIsRecording}
            onTranscribeStart={handleVoiceTranscribeStart}
            onTranscribeComplete={handleVoiceTranscribeComplete}
            onError={handleVoiceError}
            isProcessing={isVoiceProcessing}
          />
        ) : (
          <button
            onClick={send}
            disabled={!input.trim() && selectedFiles.length === 0}
            className={`flex items-center justify-center bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl hover:shadow-lg active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${(input.trim() || selectedFiles.length > 0) ? 'button-ready' : ''} h-9 w-9`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-start p-0 relative">
      <div className="w-full h-full flex flex-col overflow-hidden">
        {isLoadingChat ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-44 h-44">
              <Lottie animationData={lottieZenIcon} loop autoplay className="w-full h-full lottie-spinner" />
            </div>
          </div>
        ) : isNewChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
            <div className="w-full max-w-4xl px-4 md:px-6">
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-2">
                {t('chat.startConversation')}, {user?.displayName || user?.email || 'User'}
              </h1>
              <p className="text-muted-foreground mb-8 md:mb-12">{t('chat.typeMessage')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
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
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className={`rounded-2xl border transition-all duration-200 p-2 sm:p-3 flex flex-col ${isDragging ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/60 focus-within:ring-1 focus-within:ring-primary/30'}`}>
                  {/* File chips */}
                  <FileInput
                    ref={fileInputRef}
                    files={selectedFiles}
                    onFilesSelected={setSelectedFiles}
                    maxFileSize={10 * 1024 * 1024}
                    multiple={true}
                    disabled={isUploadingFiles}
                  />
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={voiceIsRecording ? '' : (imageMode ? t('imageGenerator.inputPlaceholder') : t('chat.typeMessage'))}
                    onPaste={handlePaste}
                    rows={1}
                    readOnly={voiceIsRecording}
                    aria-disabled={voiceIsRecording}
                    className="w-full max-h-[120px] sm:max-h-[264px] resize-none px-2 sm:px-3 py-2 rounded-xl bg-transparent border-0 focus:outline-none text-base placeholder:text-muted-foreground/70 overflow-hidden"
                  />
                  {voiceIsRecording && (
                    <canvas
                      ref={waveformCanvasRef}
                      data-slot="textarea"
                      className="w-full h-20 rounded-xl"
                    />
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {renderLeftButtons()}
                    {renderRightButtons()}
                  </div>
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
              <div className="p-4 md:p-6 max-w-4xl mx-auto" ref={listRef}>
                {displayMessages.map((m, index) => {
                  const isLastAssistantMessage = m.role === 'assistant' && index === displayMessages.length - 1;
                  const isStreaming = isLastAssistantMessage && state.loading.chat;
                  const isReasoningStreaming = isLastAssistantMessage && state.loading.chat && !!m.reasoning;
                  const messageFiles = getFilesForMessage(m.fileIds);
                  
                  return (
                    <div key={m.id}>
                      <MessageBubble
                        role={m.role as any}
                        isStreaming={isStreaming}
                        reasoning={m.reasoning}
                        isReasoningStreaming={isReasoningStreaming}
                        mcpRequests={m.mcpRequests}
                        citations={m.metadata?.citations}
                        appendedNotes={m.appendedNotes}
                        onCopy={() => handleCopy(m.content)}
                        onEdit={handleEdit}
                        onRegenerate={handleRegenerate}
                        fileIds={m.fileIds}
                        files={messageFiles}
                        onDownloadFile={handleDownloadFile}
                      >
                        {m.content}
                      </MessageBubble>
                    </div>
                  );
                })}
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

            <div className="px-3 md:px-6 pb-4 md:pb-6 slide-up">
              <div
                className="max-w-4xl mx-auto space-y-2"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Input Box */}
                <div className={`rounded-2xl border transition-all duration-200 p-2 sm:p-3 flex flex-col ${isDragging ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/60 focus-within:ring-1 focus-within:ring-primary/30'}`}>
                  {/* File chips */}
                  <FileInput
                    ref={fileInputRef}
                    files={selectedFiles}
                    onFilesSelected={setSelectedFiles}
                    maxFileSize={10 * 1024 * 1024}
                    multiple={true}
                    disabled={isUploadingFiles}
                  />
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={voiceIsRecording ? '' : (imageMode ? t('imageGenerator.inputPlaceholder') : t('chat.askAnything'))}
                    onPaste={handlePaste}
                    rows={1}
                    readOnly={voiceIsRecording}
                    aria-disabled={voiceIsRecording}
                    className="w-full max-h-[120px] sm:max-h-[264px] resize-none px-2 sm:px-3 py-2 rounded-xl bg-transparent border-0 focus:outline-none text-base sm:text-base placeholder:text-muted-foreground/70 overflow-hidden"
                  />
                  {voiceIsRecording && (
                    <canvas
                      ref={waveformCanvasRef}
                      data-slot="textarea"
                      className="w-full h-20 rounded-xl"
                    />
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {renderLeftButtons()}
                    {renderRightButtons()}
                  </div>
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground/50 text-center mt-2 hidden sm:block">
                  Press <kbd className="px-1 py-0.5 rounded bg-muted/50 border border-border/50 font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-muted/50 border border-border/50 font-mono text-[10px]">Shift + Enter</kbd> for new line
                </p>
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
