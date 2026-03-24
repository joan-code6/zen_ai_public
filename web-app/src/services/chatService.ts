import BaseApiService from './api';
import { getBackendUrl } from '@/lib/backend';
import AuthService from './authService';

export interface Chat {
  id: string;
  uid: string;
  title?: string;
  systemPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MCPQueuedRequest {
  id: string;
  request: {
    type: 'mcp_request';
    toolName: string;
    toolArgs: Record<string, unknown>;
  };
  response?: {
    type: 'mcp_response';
    toolName: string;
    success: boolean;
    result?: Record<string, unknown>;
    error?: string;
  };
  timestamp: number;
  /** Character offset in the assistant message content at which this tool call was initiated. */
  textOffset?: number;
}

export interface Message {
  id: string;
  uid: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  fileIds?: string[];
  reasoning?: string;
  mcpRequests?: MCPQueuedRequest[];
  metadata?: MessageMetadata;
  appendedNotes?: Array<{ id: string; title: string }>;
  createdAt: string;
}

export interface WebSearchMetadata {
  enabled: boolean;
  maxResults?: number;
}

export interface Citation {
  url: string;
  text?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface GenerationMetadata {
  model: string;
  totalTokens: number;
  tokensPerSecond: number;
  timeToFirstToken: number;
  totalCost: number;
  startedAt?: string;
  completedAt?: string;
}

export interface MessageMetadata extends Record<string, unknown> {
  webSearch?: WebSearchMetadata;
  citations?: Citation[];
  model?: string;
  totalTokens?: number;
  tokensPerSecond?: number;
  timeToFirstToken?: number;
  totalCost?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface ChatFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  downloadPath: string;
  textPreview?: string;
  createdAt: string;
}

export interface AIModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
  supportsVision?: boolean;
  modality?: string;
}

export interface AIModelsResponse {
  items: AIModel[];
  defaultModel: string;
}

export interface ChatDetail {
  chat: Chat;
  messages: Message[];
  mcpEvents?: MCPEventRecord[];
  files: ChatFile[];
}

export interface MCPEventRecord {
  id?: string;
  type: 'mcp_request' | 'mcp_response';
  toolName: string;
  toolArgs?: Record<string, unknown>;
  success?: boolean;
  result?: Record<string, unknown>;
  error?: string | null;
  createdAt?: string | null;
}

export interface CreateChatRequest {
  uid: string;
  title?: string;
  systemPrompt?: string;
}

export interface CreateMessageRequest {
  uid: string;
  content?: string;
  role?: 'user' | 'system';
  fileIds?: string[];
  stream?: boolean;
  model?: string;
  webSearch?: {
    enabled: boolean;
    maxResults?: number;
  };
}

export interface CreateMessageResponse {
  userMessage: Message;
  assistantMessage?: Message;
}

export interface CreateImageMessagesRequest {
  uid: string;
  prompt: string;
  fileId: string;
  revisedPrompt?: string;
}

export interface CreateImageMessagesResponse {
  userMessage: Message;
  assistantMessage: Message;
}

class ChatService {
  private static instance: ChatService;

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  async getModels(): Promise<AIModelsResponse> {
    const response = await BaseApiService.get<AIModelsResponse>('/chats/models');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async createChat(request: CreateChatRequest): Promise<Chat> {
    const response = await BaseApiService.post<Chat>('/chats', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getChats(uid: string, limit?: number, offset?: number): Promise<Chat[]> {
    let url = `/chats?uid=${encodeURIComponent(uid)}`;
    if (limit !== undefined) {
      url += `&limit=${limit}`;
    }
    if (offset !== undefined) {
      url += `&offset=${offset}`;
    }
    const response = await BaseApiService.get<{ items: Chat[] }>(url);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.items || [];
  }

  async getChat(chatId: string, uid: string): Promise<ChatDetail> {
    const response = await BaseApiService.get<ChatDetail>(`/chats/${chatId}?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async updateChat(chatId: string, request: Partial<CreateChatRequest> & { uid: string }): Promise<Chat> {
    const response = await BaseApiService.patch<Chat>(`/chats/${chatId}`, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async deleteChat(chatId: string, uid: string): Promise<void> {
    const response = await BaseApiService.delete(`/chats/${chatId}`, {
      body: JSON.stringify({ uid }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async createMessage(chatId: string, request: CreateMessageRequest): Promise<CreateMessageResponse> {
    const response = await BaseApiService.post<CreateMessageResponse>(`/chats/${chatId}/messages`, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async createImageMessages(chatId: string, request: CreateImageMessagesRequest): Promise<CreateImageMessagesResponse> {
    const response = await BaseApiService.post<CreateImageMessagesResponse>(`/chats/${chatId}/image-messages`, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async createMessageStream(
    chatId: string,
    request: CreateMessageRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ReadableStream<Uint8Array>> {
    const url = `/chats/${chatId}/messages`;
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      throw new Error('Backend URL not configured');
    }
    
    const token = await AuthService.getValidToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    
    console.log('Creating message stream for chat:', chatId);
    const response = await fetch(new URL(url, backendUrl).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${token}`,
      },
      signal: options?.signal,
      body: JSON.stringify(request),
    });

    console.log('Stream response status:', response.status, 'headers:', {
      contentType: response.headers.get('content-type'),
      cacheControl: response.headers.get('cache-control'),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    console.log('Stream body available, starting to read...');
    return response.body;
  }

  async getChatFiles(chatId: string, uid: string): Promise<ChatFile[]> {
    const response = await BaseApiService.get<{ items: ChatFile[] }>(`/chats/${chatId}/files?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    const backendUrl = getBackendUrl();
    const files = response.data?.items || [];
    // Transform relative downloadPath to absolute URL for image preview
    return files.map(file => ({
      ...file,
      downloadPath: file.downloadPath && backendUrl 
        ? `${backendUrl.replace(/\/$/, '')}${file.downloadPath}`
        : file.downloadPath
    }));
  }

  async uploadChatFile(chatId: string, uid: string, file: File): Promise<ChatFile> {
    const formData = new FormData();
    formData.append('uid', uid);
    formData.append('file', file);

    const response = await BaseApiService.upload<{ file: ChatFile }>(`/chats/${chatId}/files`, formData);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!.file;
  }

  async downloadChatFile(chatId: string, fileId: string, uid: string): Promise<Blob> {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      throw new Error('Backend URL not configured');
    }
    
    const token = await AuthService.getValidToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    
    const response = await fetch(new URL(`/chats/${chatId}/files/${fileId}/download?uid=${encodeURIComponent(uid)}`, backendUrl).toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return response.blob();
  }

  async getAllFiles(): Promise<{ chat: Chat; file: ChatFile }[]> {
    const response = await BaseApiService.get<{ items: { chat: Chat; file: ChatFile }[] }>('/files');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.items || [];
  }
}

export default ChatService.getInstance();