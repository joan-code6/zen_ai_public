/**
 * Types for Model Context Protocol (MCP) events and streaming
 */

export type MCPEventType = 
  | 'user_message'
  | 'token'
  | 'mcp_request'
  | 'mcp_response'
  | 'assistant_message'
  | 'chat_title'
  | 'error'
  | 'done';

export interface UserMessageEvent {
  type: 'user_message';
  message: {
    id: string;
    role: 'user';
    content: string;
    fileIds?: string[];
    createdAt: string;
  };
}

export interface TokenEvent {
  type: 'token';
  token: string;
  text: string;
}

export interface MCPRequest {
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export interface MCPRequestEvent {
  type: 'mcp_request';
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export interface MCPResponse {
  toolName: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

export interface MCPResponseEvent {
  type: 'mcp_response';
  toolName: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string | null;
}

export interface AssistantMessageEvent {
  type: 'assistant_message';
  message: {
    id: string;
    role: 'assistant';
    content: string;
    createdAt: string;
  };
}

export interface ChatTitleEvent {
  type: 'chat_title';
  title: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  error: string;
  detail?: string;
}

export interface DoneEvent {
  type: 'done';
}

export interface NotesContextEvent {
  type: 'notes_context';
  notes: Array<{ id: string; title: string }>;
}

export type ChatStreamEvent = 
  | UserMessageEvent
  | TokenEvent
  | MCPRequestEvent
  | MCPResponseEvent
  | AssistantMessageEvent
  | ChatTitleEvent
  | ErrorEvent
  | DoneEvent
  | NotesContextEvent;

export interface MCPEventWithTimestamp {
  event: ChatStreamEvent;
  timestamp: number;
}
