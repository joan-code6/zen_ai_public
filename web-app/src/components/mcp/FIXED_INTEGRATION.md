# Fixed MCP Integration - No More Infinite Loops!

## The Problem
The original implementation had infinite re-render loops caused by:
1. `useMCPStream` hook recreating on every render due to `options` dependency
2. `MCPRequestContainer` syncing external/internal state in a loop

## The Solution

### 1. Fixed `useMCPStream` Hook
Now uses a **ref** to store callbacks, avoiding dependency issues:

```typescript
const { streamMessages } = useMCPStream({
  onMCPRequest: (request) => {
    // This callback won't cause re-renders
    setMcpRequests(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      request,
      timestamp: Date.now(),
    }]);
  },
  onMCPResponse: (response) => {
    // Find and update the matching request
    setMcpRequests(prev => 
      prev.map(req => 
        req.request.toolName === response.toolName && !req.response
          ? { ...req, response }
          : req
      )
    );
  },
});
```

### 2. Simplified `MCPRequestContainer`
Now **fully controlled** - you manage the state:

```typescript
// ✅ CORRECT - Parent manages state
const [mcpRequests, setMcpRequests] = useState([]);

<MCPRequestContainer
  requests={mcpRequests}
  onClear={() => setMcpRequests([])}
/>

// ❌ WRONG - Don't use onRequestsChange
<MCPRequestContainer
  requests={mcpRequests}
  onRequestsChange={setMcpRequests}  // This caused infinite loops!
/>
```

## Full Working Example

```typescript
import { useState, useCallback } from 'react';
import { MCPRequestContainer, MCPQueuedRequest } from '@/components/mcp';
import { useMCPStream } from '@/hooks/useMCPStream';
import ChatService from '@/services/chatService';

export const ChatComponent = ({ chatId, uid }) => {
  const [mcpRequests, setMcpRequests] = useState<MCPQueuedRequest[]>([]);
  const [messages, setMessages] = useState([]);

  const { streamMessages } = useMCPStream({
    onToken: (token, accumulated) => {
      // Update last assistant message
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg?.role === 'assistant') {
          updated[updated.length - 1] = { ...lastMsg, content: accumulated };
        }
        return updated;
      });
    },

    onMCPRequest: (request) => {
      setMcpRequests(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        request,
        timestamp: Date.now(),
      }]);
    },

    onMCPResponse: (response) => {
      setMcpRequests(prev =>
        prev.map(req =>
          req.request.toolName === response.toolName && !req.response
            ? { ...req, response }
            : req
        )
      );
    },
  });

  const handleSend = async (content: string) => {
    // Clear previous MCP requests
    setMcpRequests([]);
    
    // Create placeholder for assistant
    setMessages(prev => [...prev, {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
    }]);

    // Stream the response
    const stream = await ChatService.createMessageStream(chatId, {
      uid,
      content,
      stream: true,
    });
    
    await streamMessages(stream);
  };

  return (
    <div>
      {/* Messages */}
      {messages.map(msg => (
        <div key={msg.id}>{msg.content}</div>
      ))}

      {/* MCP Requests - Controlled component */}
      <MCPRequestContainer
        requests={mcpRequests}
        onClear={() => setMcpRequests([])}
      />
    </div>
  );
};
```

## Key Changes Summary

### `useMCPStream.ts`
- ✅ Uses `optionsRef.current` instead of `options` directly
- ✅ Empty dependency array `[]` on `streamMessages` callback
- ✅ Updates ref when options change via `useEffect`

### `MCPRequestContainer.tsx`
- ✅ Removed internal state management
- ✅ Removed `onRequestsChange` prop (was causing loops)
- ✅ Added simple `onClear` callback
- ✅ Fully controlled via `requests` prop

### Usage Pattern
- ✅ Parent manages `mcpRequests` state
- ✅ Parent updates state in hook callbacks
- ✅ Pass state directly to `MCPRequestContainer`
- ✅ Use `onClear` to handle clearing

## No More Infinite Loops! 🎉

The component is now stable and won't cause:
- "Maximum update depth exceeded" errors
- Endless re-renders
- Browser crashes
- Console spam

Just manage your state in the parent and everything works smoothly!
