# Quick Start: Adding MCP Display to Your Chat

## 1. Import Components

```typescript
import { MCPRequestContainer, MCPQueuedRequest } from '@/components/mcp';
import { useMCPStream } from '@/hooks/useMCPStream';
import ChatService from '@/services/chatService';
```

## 2. Setup State

```typescript
const [mcpRequests, setMcpRequests] = useState<MCPQueuedRequest[]>([]);
const mcpRequestMapRef = useRef<Map<string, MCPRequestEvent>>(new Map());
```

## 3. Create Stream Handler

```typescript
const { streamMessages } = useMCPStream({
  onMCPRequest: (request) => {
    const id = `${Date.now()}-${Math.random()}`;
    setMcpRequests((prev) => [
      ...prev,
      {
        id,
        request,
        timestamp: Date.now(),
      },
    ]);
  },

  onMCPResponse: (response) => {
    setMcpRequests((prev) =>
      prev.map((req) => {
        if (req.request.toolName === response.toolName && !req.response) {
          return { ...req, response };
        }
        return req;
      })
    );
  },

  onError: (message) => {
    console.error('Stream error:', message);
  },

  onDone: () => {
    console.log('Streaming complete');
  },
});
```

## 4. Send Message with Streaming

```typescript
const handleSendMessage = async (content: string) => {
  try {
    const stream = await ChatService.createMessageStream(chatId, {
      uid,
      content,
      stream: true,
    });

    await streamMessages(stream);
  } catch (error) {
    console.error('Error:', error);
  }
};
```

## 5. Display in UI

```typescript
<>
  <div>
    {/* Messages here */}
  </div>

  {/* MCP Requests Display */}
  <MCPRequestContainer requests={mcpRequests} />
</>
```

## That's It!

The MCP component will automatically:
- Display tool calls as they happen
- Show loading state while executing
- Update with results or errors
- Allow expanding for details
- Show stats in the header

## Full Example

See `src/components/mcp/EXAMPLE_INTEGRATION.tsx` for a complete working example.

## Customization

### Hide When No Requests
The component automatically returns `null` when there are no requests.

### Compact Mode
```typescript
<MCPRequestContainer requests={mcpRequests} compact={true} />
```

### Clear Requests
```typescript
setMcpRequests([]);
```

### Custom Styling
Override CSS classes:
```css
.mcp-request.loading {
  box-shadow: 0 0 20px rgba(90, 124, 255, 0.2);
}
```

## Common Patterns

### Match Request-Response Pairs
```typescript
onMCPResponse: (response) => {
  setMcpRequests((prev) =>
    prev.map((req) => {
      // Match by tool name for the most recent unmatched request
      if (
        req.request.toolName === response.toolName &&
        !req.response
      ) {
        return { ...req, response };
      }
      return req;
    })
  );
}
```

### Filter by Tool Type
```typescript
const searchNoteRequests = mcpRequests.filter(
  (r) => r.request.toolName === 'search_notes'
);
```

### Get Success Rate
```typescript
const successCount = mcpRequests.filter((r) => r.response?.success).length;
const successRate = (successCount / mcpRequests.length) * 100;
```

## Troubleshooting

### Events not appearing?
1. Check that `stream: true` is being passed
2. Open DevTools Network tab and look for SSE
3. Check browser console for errors

### Wrong response matched to request?
Use a unique ID to match requests and responses instead of just tool name if the same tool is called multiple times:

```typescript
// Better approach
const id = generateUniqueId();
const request: MCPQueuedRequest = {
  id,
  request: { ...mcp_request_with_id },
  timestamp: Date.now(),
};

// Then match by id instead of name
onMCPResponse: (response) => {
  // Find the matching request by comparing arguments
  const matchingReqId = mcpRequests.find(
    (r) =>
      r.request.toolName === response.toolName &&
      JSON.stringify(r.request.toolArgs) === JSON.stringify(response.toolArgs) &&
      !r.response
  )?.id;
  
  if (matchingReqId) {
    updateRequestResponse(matchingReqId, response);
  }
}
```
