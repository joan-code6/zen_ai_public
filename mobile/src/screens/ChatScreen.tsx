import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Clipboard, Modal, ScrollView, StatusBar, PermissionsAndroid,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import Markdown from 'react-native-markdown-display';
import { useAuth } from '../context/AuthContext';
import { chats as chatsApi, streamMessage, streamRegenerate, files, speech, type Message, type Model } from '../services/api';
import { colors, iconSizes, spacing, radius, typography } from '../theme/tokens';
import type { AppStackParams } from '../navigation';
import AppHeader from '../components/AppHeader';
import InputBar from '../components/InputBar';
import { formatError } from '../utils/error';

type Props = NativeStackScreenProps<AppStackParams, 'Chat'>;

// ─── markdown styles ─────────────────────────────────────────────────────────

const mdStyles = {
  body: { color: colors.text, fontSize: typography.body, lineHeight: 23 },
  paragraph: { marginTop: 0, marginBottom: 8, color: colors.text },
  heading1: { color: colors.text, fontWeight: '700' as const, fontSize: typography.h2, marginBottom: 8 },
  heading2: { color: colors.text, fontWeight: '700' as const, fontSize: typography.h3, marginBottom: 6 },
  heading3: { color: colors.text, fontWeight: '600' as const, fontSize: typography.label, marginBottom: 4 },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { color: colors.text },
  code_inline: { backgroundColor: colors.panel, color: '#c9d1d9', fontFamily: 'monospace', paddingHorizontal: 4, borderRadius: 3 },
  fence: { backgroundColor: colors.panel, borderRadius: radius.sm, padding: spacing.md, marginVertical: 8 },
  code_block: { backgroundColor: colors.panel, color: '#c9d1d9', fontFamily: 'monospace' },
  blockquote: { borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: spacing.md, opacity: 0.8 },
  link: { color: '#58a6ff' },
  strong: { color: colors.text, fontWeight: '700' as const },
  em: { color: colors.text, fontStyle: 'italic' as const },
  hr: { backgroundColor: colors.border, marginVertical: 12 },
  table: { borderWidth: 1, borderColor: colors.border, marginVertical: 8 },
  th: { backgroundColor: colors.panel, padding: 6 },
  td: { padding: 6, borderTopWidth: 1, borderTopColor: colors.border },
};

// ─── tool call indicator ──────────────────────────────────────────────────────

function ToolIndicator({ toolName }: { toolName: string }) {
  const label = toolName === 'search_notes' ? 'Searching notes...'
    : toolName === 'create_note' ? 'Creating note...'
    : toolName === 'update_note' ? 'Updating note...'
    : `Using ${toolName}...`;
  return (
    <View style={t.tool}>
      <Feather name="zap" size={iconSizes.sm} color={colors.success} />
      <Text style={t.toolText}>{label}</Text>
    </View>
  );
}

// ─── notes context banner ─────────────────────────────────────────────────────

function NotesContextBanner({ notes }: { notes: { id: string; title: string }[] }) {
  if (!notes.length) return null;
  return (
    <View style={t.notesBanner}>
      <Feather name="book-open" size={iconSizes.sm} color={colors.success} />
      <Text style={t.notesBannerText}>
        Using {notes.length} note{notes.length > 1 ? 's' : ''}: {notes.map(n => n.title).join(', ')}
      </Text>
    </View>
  );
}

// ─── message bubble ───────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: Message;
  isStreaming?: boolean;
  streamingText?: string;
  notesContext?: { id: string; title: string }[];
  toolCalls?: string[];
  onCopy: () => void;
  onRegenerate?: () => void;
}

const MessageBubble = React.memo(function MessageBubble({
  msg,
  isStreaming,
  streamingText,
  notesContext,
  toolCalls,
  onCopy,
  onRegenerate,
}: MessageBubbleProps) {
  const isUser = msg.role === 'user';
  const content = isStreaming ? (streamingText ?? '') : msg.content;

  return (
    <View style={[t.bubble, isUser ? t.bubbleUser : t.bubbleAI]}>
      {!isUser && notesContext && notesContext.length > 0 && (
        <NotesContextBanner notes={notesContext} />
      )}
      {!isUser && toolCalls && toolCalls.map((tc, i) => (
        <ToolIndicator key={i} toolName={tc} />
      ))}
      {isUser ? (
        <Text style={t.userText}>{content}</Text>
      ) : (
        <Markdown style={mdStyles}>
          {content || (isStreaming ? '▋' : '')}
        </Markdown>
      )}
      {isStreaming && (
        <View style={t.streamDot}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      )}
      {/* actions row (only for completed messages) */}
      {!isStreaming && (
        <View style={t.actions}>
          <Pressable onPress={onCopy} hitSlop={8} style={t.actionBtn}>
            <Feather name="copy" size={iconSizes.sm} color={colors.textSoft} />
          </Pressable>
          {!isUser && onRegenerate && (
            <Pressable onPress={onRegenerate} hitSlop={8} style={t.actionBtn}>
              <Feather name="refresh-cw" size={iconSizes.sm} color={colors.textSoft} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
});

// ─── model picker modal ───────────────────────────────────────────────────────

interface GroupedModels {
  provider: string;
  models: Model[];
}

function groupModelsByProvider(models: Model[]): GroupedModels[] {
  const groups: Record<string, Model[]> = {};
  
  for (const model of models) {
    const provider = model.provider || 'Other';
    if (!groups[provider]) {
      groups[provider] = [];
    }
    groups[provider].push(model);
  }
  
  return Object.entries(groups).map(([provider, items]) => ({
    provider,
    models: items,
  }));
}

function ModelPicker({
  visible, models, selected, onSelect, onClose,
}: {
  visible: boolean;
  models: Model[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const groupedModels = groupModelsByProvider(models);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={t.modalBackdrop} onPress={onClose} />
      <View style={t.modelSheet}>
        <View style={t.sheetHandle} />
        <Text style={t.sheetTitle}>Select Model</Text>
        <ScrollView style={t.modelList} showsVerticalScrollIndicator={false}>
          {groupedModels.map(group => (
            <View key={group.provider}>
              <Text style={t.providerLabel}>{group.provider}</Text>
              {group.models.map(m => (
                <Pressable
                  key={m.id}
                  style={[t.modelRow, m.id === selected && t.modelRowActive]}
                  onPress={() => { onSelect(m.id); onClose(); }}
                >
                  <View style={t.modelInfo}>
                    <Text style={[t.modelName, m.id === selected && t.modelNameActive]}>{m.name}</Text>
                    {!!m.description && (
                      <Text style={t.modelDesc} numberOfLines={2}>{m.description}</Text>
                    )}
                  </View>
                  {m.id === selected && <Feather name="check" size={iconSizes.md} color={colors.success} />}
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

const chatSuggestions = [
  'Help me write a creative story',
  'Explain how things work',
  'Help me plan something',
  'Debug my code',
  'Brainstorm ideas',
  'Summarize this text',
];

export default function ChatScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const route = useRoute();
  const params = route.params as AppStackParams['Chat'];
  const { user, getToken } = useAuth();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatTitle, setChatTitle] = useState(params.title || 'New Chat');
  const [loading, setLoading] = useState(true);

  // streaming state
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [notesContext, setNotesContext] = useState<{ id: string; title: string }[]>([]);
  const [activeTools, setActiveTools] = useState<string[]>([]);

  // composer
  const [input, setInput] = useState(params.initialMessage ?? '');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // model/settings
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [webSearch, setWebSearch] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  const listRef = useRef<FlatList>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const activeAssistantMsgIdRef = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── load chat ────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const token = await getToken();
        const [chatData, modelData] = await Promise.all([
          chatsApi.get(params.chatId, user!.uid, token),
          chatsApi.models(token),
        ]);
        if (!isMounted) return;

        setMessages(chatData.messages);
        setChatTitle(chatData.chat.title || 'New Chat');
        setModels(modelData.items);
        setSelectedModel(modelData.defaultModel);

        // if there's an initial message, send it
        if (params.initialMessage && chatData.messages.length === 0) {
          setInput('');
          sendMessage(params.initialMessage, token, modelData.defaultModel);
        }
      } catch (err: unknown) {
        if (isMounted) {
          Alert.alert('Error', formatError(err, 'Failed to load chat.'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
      xhrRef.current?.abort();
      xhrRef.current = null;
      activeAssistantMsgIdRef.current = null;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, []);

  // ── scroll to bottom ─────────────────────────────────────────────────────
  function scrollToBottom() {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
      scrollTimeoutRef.current = null;
    }, 100);
  }

  function markAssistantFailed(messageId: string, fallbackMessage: string) {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const existing = m.content?.trim();
      const suffix = existing ? `\n\n${fallbackMessage}` : fallbackMessage;
      return {
        ...m,
        content: `${existing || ''}${suffix}`,
      };
    }));
  }

  // ── send message ─────────────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || sending) return;
    
    const currentInput = input;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);
    
    try {
      const token = await getToken();
      
      let fileIds: string[] = [];
      if (currentAttachments.length > 0) {
        setUploading(true);
        try {
          if (!user) throw new Error('User not authenticated');
          fileIds = await handleUploadAttachments(params.chatId, user.uid, token);
        } finally {
          setUploading(false);
        }
      }
      
      sendMessage(currentInput, token, selectedModel, fileIds);
    } catch (err: unknown) {
      Alert.alert('Error', formatError(err, 'Failed to authenticate request.'));
      setInput(currentInput);
      setAttachments(currentAttachments);
    }
  }

  function sendMessage(text: string, token: string, model: string, fileIds: string[] = []) {
    if (!user) return;
    setSending(true);
    xhrRef.current?.abort();

    // optimistic user message
    const tempUserMsgId = `temp-user-${Date.now()}`;
    const tempUserMsg: Message = {
      id: tempUserMsgId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    scrollToBottom();

    // placeholder assistant bubble
    const tempAssistantId = `temp-ai-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempAssistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }]);
    activeAssistantMsgIdRef.current = tempAssistantId;
    setStreamingMsgId(tempAssistantId);
    setStreamingText('');
    setNotesContext([]);
    setActiveTools([]);

    xhrRef.current = streamMessage(
      params.chatId, user.uid, token, text,
      {
        model: model || undefined,
        webSearch: webSearch ? { enabled: true, maxResults: 3 } : undefined,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
      },
      {
        onEvent(event) {
          if (event.type === 'user_message') {
            setMessages(prev => prev.map(m => m.id === tempUserMsgId ? event.message : m));
          } else if (event.type === 'notes_context') {
            setNotesContext(event.notes);
          } else if (event.type === 'token') {
            setStreamingText(prev => {
              if (typeof event.text === 'string' && event.text.length > 0) {
                return event.text;
              }
              return prev + (event.token || '');
            });
            scrollToBottom();
          } else if (event.type === 'mcp_request') {
            setActiveTools(prev => [...prev, event.toolName]);
          } else if (event.type === 'mcp_response') {
            setActiveTools(prev => prev.filter(t => t !== event.toolName));
          } else if (event.type === 'assistant_message') {
            const currentAssistantId = activeAssistantMsgIdRef.current ?? tempAssistantId;
            setMessages(prev => prev.map(m => m.id === currentAssistantId ? event.message : m));
            activeAssistantMsgIdRef.current = event.message.id;

            const hasContent = !!event.message.content?.trim();
            if (hasContent) {
              setStreamingMsgId(null);
              setStreamingText('');
              setActiveTools([]);
              activeAssistantMsgIdRef.current = null;
            } else {
              setStreamingMsgId(event.message.id);
            }
            scrollToBottom();
          } else if (event.type === 'chat_title') {
            setChatTitle(event.title);
          } else if (event.type === 'error') {
            markAssistantFailed(tempAssistantId, event.message || 'AI error. Tap regenerate to retry.');
            setStreamingMsgId(null);
            setStreamingText('');
            activeAssistantMsgIdRef.current = null;
            setSending(false);
          }
        },
        onError(err) {
          markAssistantFailed(tempAssistantId, err.message || 'Failed to send message. Tap regenerate to retry.');
          setStreamingMsgId(null);
          setStreamingText('');
          activeAssistantMsgIdRef.current = null;
          setSending(false);
        },
        onDone() {
          activeAssistantMsgIdRef.current = null;
          setSending(false);
        },
      },
    );
  }

  // ── regenerate ───────────────────────────────────────────────────────────
  async function handleRegenerate(msgId: string) {
    if (!user || sending) return;
    setSending(true);
    xhrRef.current?.abort();

    setStreamingMsgId(msgId);
    activeAssistantMsgIdRef.current = msgId;
    setStreamingText('');
    setActiveTools([]);

    let token = '';
    try {
      token = await getToken();
    } catch (err: unknown) {
      setSending(false);
      Alert.alert('Error', formatError(err, 'Failed to authenticate request.'));
      return;
    }

    xhrRef.current = streamRegenerate(
      params.chatId, msgId, user.uid, token, selectedModel || undefined,
      {
        onEvent(event) {
          if (event.type === 'token') {
            setStreamingText(prev => {
              if (typeof event.text === 'string' && event.text.length > 0) {
                return event.text;
              }
              return prev + (event.token || '');
            });
            scrollToBottom();
          } else if (event.type === 'assistant_message') {
            const currentAssistantId = activeAssistantMsgIdRef.current ?? msgId;
            setMessages(prev => prev.map(m => m.id === currentAssistantId ? event.message : m));
            activeAssistantMsgIdRef.current = event.message.id;

            const hasContent = !!event.message.content?.trim();
            if (hasContent) {
              setStreamingMsgId(null);
              setStreamingText('');
              activeAssistantMsgIdRef.current = null;
            } else {
              setStreamingMsgId(event.message.id);
            }
            scrollToBottom();
          }
        },
        onError(err) {
          Alert.alert('Error', err.message || 'Failed to regenerate response.');
          setStreamingMsgId(null);
          setStreamingText('');
          activeAssistantMsgIdRef.current = null;
          setSending(false);
        },
        onDone() {
          activeAssistantMsgIdRef.current = null;
          setSending(false);
        },
      },
    );
  }

  // ── copy ─────────────────────────────────────────────────────────────────
  function handleCopy(content: string) {
    Clipboard.setString(content);
  }

  // ── file upload ─────────────────────────────────────────────────────────
  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setAttachments(prev => [...prev, {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
        }]);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick file');
    }
  }

  async function handleUploadAttachments(chatId: string, uid: string, token: string): Promise<string[]> {
    const fileIds: string[] = [];
    for (const file of attachments) {
      try {
        const uploaded = await files.upload(chatId, uid, token, file);
        fileIds.push(uploaded.id);
      } catch (err) {
        console.warn('Upload failed:', err);
      }
    }
    return fileIds;
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  // ── voice input ────────────────────────────────────────────────────────
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Microphone permission is required for voice input');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(recording);
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording');
    }
  }

  async function stopRecording() {
    if (!recording) return;

    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      
      const uri = recording.getURI();
      setRecording(null);

      if (uri && recordingDuration > 0) {
        setUploading(true);
        try {
          const token = await getToken();
          const result = await speech.transcribe(token, {
            uri,
            name: 'recording.m4a',
            type: 'audio/m4a',
          });
          setInput(prev => prev + (prev ? ' ' : '') + result.text);
        } catch (err) {
          Alert.alert('Error', formatError(err, 'Transcription failed'));
        } finally {
          setUploading(false);
          setRecordingDuration(0);
        }
      } else {
        setRecordingDuration(0);
      }
    } catch (err) {
      setIsRecording(false);
      setRecordingDuration(0);
      Alert.alert('Error', 'Failed to stop recording');
    }
  }

  const displayMessages = messages.filter(m => m.role !== 'system');

  const renderMessage = useCallback(({ item: msg }: { item: Message }) => {
    const isThisStreaming = streamingMsgId === msg.id;
    return (
      <MessageBubble
        msg={msg}
        isStreaming={isThisStreaming}
        streamingText={isThisStreaming ? streamingText : undefined}
        notesContext={isThisStreaming ? notesContext : []}
        toolCalls={isThisStreaming ? activeTools : []}
        onCopy={() => handleCopy(msg.content)}
        onRegenerate={msg.role === 'assistant' ? () => handleRegenerate(msg.id) : undefined}
      />
    );
  }, [activeTools, notesContext, streamingMsgId, streamingText]);

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <AppHeader title={chatTitle} onBack={() => nav.goBack()} />

      {/* messages */}
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={s.flex}>
            {displayMessages.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Feather name="message-circle" size={40} color={colors.success} />
            </View>
            <Text style={s.emptyTitle}>Start a conversation</Text>
            <Text style={s.emptySub}>Type a message below or try a suggestion</Text>
            
            <View style={s.suggestionsContainer}>
              {chatSuggestions.slice(0, 4).map((suggestion, idx) => (
                <Pressable
                  key={idx}
                  style={({ pressed }) => [s.suggestionChip, pressed && s.suggestionChipPressed]}
                  onPress={() => setInput(suggestion)}
                >
                  <Feather name="zap" size={12} color={colors.success} />
                  <Text style={s.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={displayMessages}
            keyExtractor={m => m.id}
            contentContainerStyle={s.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
            renderItem={renderMessage}
          />
        )}

        {/* composer */}
        <View style={{ 
          paddingBottom: insets.bottom + spacing.xs,
          backgroundColor: colors.bg,
        }}>
          <InputBar
            value={input}
            onChangeText={setInput}
            onSend={handleSend}
            onAttachFile={handlePickFile}
            onVoiceInput={() => {
              if (isRecording) {
                stopRecording();
              } else {
                startRecording();
              }
            }}
            onModelSelect={() => setShowModelPicker(true)}
            selectedModel={models.find(m => m.id === selectedModel)?.name || selectedModel}
            isRecording={isRecording}
            isUploading={uploading}
            disabled={sending}
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
          />
        </View>
        </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* model picker */}
      <ModelPicker
        visible={showModelPicker}
        models={models}
        selected={selectedModel}
        onSelect={setSelectedModel}
        onClose={() => setShowModelPicker(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: typography.h2, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptySub: { fontSize: typography.body, color: colors.textMuted, marginBottom: spacing.xl },
  
  suggestionsContainer: {
    width: '100%',
    gap: spacing.sm,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionChipPressed: { backgroundColor: colors.panelSoft },
  suggestionText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },

  messageList: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.lg },

  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  toolbar: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  modelChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.panel, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    maxWidth: 180,
  },
  modelChipText: { color: colors.text, fontSize: typography.small },
  toolChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.panel, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
  },
  toolChipActive: { backgroundColor: colors.primary },
  toolChipText: { color: colors.textMuted, fontSize: typography.small },
  toolChipTextActive: { color: colors.primaryText },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panel,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnRecording: {
    backgroundColor: colors.danger + '20',
    borderColor: colors.danger,
  },
  attachmentsRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    maxHeight: 40,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.panel,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachmentName: {
    color: colors.textMuted,
    fontSize: 12,
    maxWidth: 100,
  },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.body,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.primary,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});

const t = StyleSheet.create({
  // bubbles
  bubble: { marginBottom: spacing.md, maxWidth: '92%' },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderBottomRightRadius: 4,
  },
  bubbleAI: { alignSelf: 'flex-start', maxWidth: '100%' },
  userText: { color: colors.text, fontSize: typography.body, lineHeight: 22 },
  streamDot: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, opacity: 0.6 },
  actionBtn: { padding: 4 },

  // tool indicator
  tool: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  toolText: { fontSize: typography.small, color: colors.success },

  // notes banner
  notesBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.panel, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    marginBottom: spacing.sm,
  },
  notesBannerText: { fontSize: typography.small, color: colors.success, flex: 1 },

  // model sheet
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modelSheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36, height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: typography.label, fontWeight: '600', color: colors.text, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  modelList: { paddingHorizontal: spacing.md },
  providerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderRadius: radius.md,
    marginBottom: spacing.xs, gap: spacing.sm,
  },
  modelRowActive: { backgroundColor: colors.panel },
  modelInfo: { flex: 1 },
  modelName: { color: colors.text, fontSize: typography.body, fontWeight: '500' },
  modelNameActive: { color: colors.text },
  modelDesc: { color: colors.textMuted, fontSize: typography.small, marginTop: 2 },
});
