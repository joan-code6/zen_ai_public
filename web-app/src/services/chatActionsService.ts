/**
 * Chat Actions Service
 * Provides utilities for managing chat messages:
 * - Stopping generation
 * - Editing messages
 * - Deleting messages
 * - Regenerating responses
 */

import BaseApiService from './api';
import { Message } from './chatService';
import AuthService from './authService';

export interface GenerationMetadata {
  model: string;
  totalTokens: number;
  tokensPerSecond: number;
  timeToFirstToken: number; // in milliseconds
  totalCost: number;
  startedAt?: string;
  completedAt?: string;
}

export interface StopGenerationRequest {
  uid: string;
}

export interface StopGenerationResponse {
  success: boolean;
  message: string;
}

export interface EditMessageRequest {
  uid: string;
  content: string;
}

export interface EditMessageResponse {
  success: boolean;
  message: Message;
  assistantMessageId?: string;
  assistantMessage?: Message;
}

export interface DeleteMessageRequest {
  uid: string;
}

export interface RegenerateMessageRequest {
  uid: string;
  model?: string;
  stream?: boolean;
}

export interface RegenerateMessageResponse {
  success: boolean;
  message: Message;
}

class ChatActionsService {
  private static instance: ChatActionsService;

  static getInstance(): ChatActionsService {
    if (!ChatActionsService.instance) {
      ChatActionsService.instance = new ChatActionsService();
    }
    return ChatActionsService.instance;
  }

  /**
   * Stop generation for an assistant message
   */
  async stopGeneration(
    chatId: string,
    messageId: string,
    request: StopGenerationRequest
  ): Promise<StopGenerationResponse> {
    const response = await BaseApiService.post<StopGenerationResponse>(
      `/chats/${chatId}/messages/${messageId}/stop`,
      request
    );
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  /**
   * Edit a user message
   */
  async editMessage(
    chatId: string,
    messageId: string,
    request: EditMessageRequest
  ): Promise<EditMessageResponse> {
    const response = await BaseApiService.patch<EditMessageResponse>(
      `/chats/${chatId}/messages/${messageId}`,
      request
    );
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  /**
   * Delete a message from chat
   */
  async deleteMessage(chatId: string, messageId: string, uid: string): Promise<void> {
    const response = await BaseApiService.delete<void>(
      `/chats/${chatId}/messages/${messageId}?uid=${encodeURIComponent(uid)}`
    );
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  /**
   * Regenerate an assistant message (get a new response)
   */
  async regenerateMessage(
    chatId: string,
    messageId: string,
    request: RegenerateMessageRequest
  ): Promise<RegenerateMessageResponse | undefined> {
    const response = await BaseApiService.post<RegenerateMessageResponse>(
      `/chats/${chatId}/messages/${messageId}/regenerate`,
      request
    );
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data;
  }

  /**
   * Regenerate message with streaming
   */
  async regenerateMessageStream(
    chatId: string,
    messageId: string,
    request: RegenerateMessageRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ReadableStream<Uint8Array>> {
    const { getBackendUrl } = await import('@/lib/backend');
    const url = `/chats/${chatId}/messages/${messageId}/regenerate`;
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      throw new Error('Backend URL not configured');
    }

    const token = await AuthService.getValidToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(new URL(url, backendUrl).toString(), {
      method: 'POST',
      headers,
      signal: options?.signal,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    return response.body;
  }
}

export default ChatActionsService;
