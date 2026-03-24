/**
 * Example Chat Component with MCP Request Display
 * 
 * This example shows how to integrate the MCP components with your chat interface.
 * It demonstrates:
 * - Sending messages with streaming enabled
 * - Capturing and displaying MCP requests/responses in real-time
 * - Managing the chat state including tokens, messages, and tool calls
 */

import React, { useState, useCallback, useRef } from 'react';
import ChatService, { MCPQueuedRequest } from '@/services/chatService';
import { useMCPStream } from '@/hooks/useMCPStream';
import { MCPRequestContainer } from '@/components/mcp';
import { MCPRequestEvent, MCPResponseEvent } from '@/types/mcp';
import { parseSSEStream } from '@/utils/sseParser';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ExampleChatProps {
  chatId: string;
  uid: string;
}

export const ExampleChat: React.FC<ExampleChatProps> = ({ chatId, uid }) => {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // MCP tracking
  const [mcpRequests, setMcpRequests] = useState<MCPQueuedRequest[]>([]);
  const mcpRequestMapRef = useRef<Map<string, MCPRequestEvent>>(new Map());

  // Use the streaming hook for MCP events
  const { streamMessages, error: streamError } = useMCPStream({
    onUserMessage: (content) => {
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
    },

    onToken: (token, accumulated) => {
      // Update the last assistant message with accumulated text
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg?.role === 'assistant') {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: accumulated,
          };
        }
        return updated;
      });
    },

    onMCPRequest: (request) => {
      // Track the MCP request
      const id = `mcp-${Date.now()}-${Math.random()}`;
      mcpRequestMapRef.current.set(id, request);

      const queuedRequest: MCPQueuedRequest = {
        id,
        request,
        timestamp: Date.now(),
      };
      setMcpRequests((prev) => [...prev, queuedRequest]);
    },

    onMCPResponse: (response) => {
      // Find the matching request and update it with the response
      setMcpRequests((prev) =>
        prev.map((req) => {
          if (
            req.request.toolName === response.toolName &&
            !req.response
          ) {
            return { ...req, response };
          }
          return req;
        })
      );
    },

    onAssistantMessage: (content) => {
      // Message already accumulated via onToken, but this confirms it's done
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg?.role === 'assistant') {
          return updated;
        }
        return [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content,
            timestamp: Date.now(),
          },
        ];
      });
    },

    onChatTitle: (title) => {
      console.log('Chat title:', title);
      // Update chat title in your state/store
    },

    onError: (message, code) => {
      console.error('Stream error:', code, message);
      setIsLoading(false);
    },

    onDone: () => {
      setIsLoading(false);
    },
  });

  // Send a message with streaming
  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim()) return;

    setIsLoading(true);
    setMcpRequests([]);
    mcpRequestMapRef.current.clear();

    try {
      const stream = await ChatService.createMessageStream(chatId, {
        uid,
        content: inputValue,
        role: 'user',
        stream: true,
      });

      // Start a new assistant message placeholder
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        },
      ]);

      // Stream the response
      await streamMessages(stream);

      setInputValue('');
    } catch (error) {
      console.error('Send message error:', error);
      setIsLoading(false);
    }
  }, [chatId, uid, inputValue, streamMessages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages display */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              marginBottom: '12px',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor:
                msg.role === 'user' ? '#e3f2fd' : '#f5f5f5',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <strong>{msg.role === 'user' ? 'You' : 'AI'}: </strong>
            {msg.content}
          </div>
        ))}

        {/* MCP Requests Display */}
        {mcpRequests.length > 0 && (
          <MCPRequestContainer
            requests={mcpRequests}
            onClear={() => setMcpRequests([])}
          />
        )}

        {streamError && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#fee',
              color: '#c00',
              borderRadius: '4px',
              marginTop: '12px',
            }}
          >
            Error: {streamError}
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{ padding: '16px', borderTop: '1px solid #ddd' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !isLoading) {
                handleSendMessage();
              }
            }}
            placeholder="Type your message..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #ddd',
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              backgroundColor: isLoading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExampleChat;
