import BaseApiService from './api';

export interface Chat {
  id: string;
  uid: string;
  title?: string;
  systemPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  uid: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  fileIds?: string[];
  createdAt: string;
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

export interface ChatDetail {
  chat: Chat;
  messages: Message[];
  files: ChatFile[];
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
}

export interface CreateMessageResponse {
  userMessage: Message;
  assistantMessage?: Message;
}

class ChatService {
  private static instance: ChatService;

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  async createChat(request: CreateChatRequest): Promise<Chat> {
    const response = await BaseApiService.post<Chat>('/chats', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getChats(uid: string): Promise<Chat[]> {
    const response = await BaseApiService.get<{ items: Chat[] }>(`/chats?uid=${encodeURIComponent(uid)}`);
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

  async getChatFiles(chatId: string, uid: string): Promise<ChatFile[]> {
    const response = await BaseApiService.get<{ items: ChatFile[] }>(`/chats/${chatId}/files?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.items || [];
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
    const response = await fetch(`/chats/${chatId}/files/${fileId}/download?uid=${encodeURIComponent(uid)}`, {
      headers: {
        'Authorization': `Bearer ${await BaseApiService.getValidToken()}`,
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