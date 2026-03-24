# MCP Request Streaming Implementation Summary

## Overview

This implementation enables real-time display of MCP (Model Context Protocol) requests that the AI executes while processing user queries. Users can now see exactly what tools the AI is using, what arguments it's passing, and what results it gets back.

## What Was Implemented

### 1. Backend Changes (Python/Flask)

**File: `backend/zen_backend/chats/routes.py`**

Modified the SSE event streaming for the `POST /chats/<chat_id>/messages` endpoint to emit MCP events:

- **mcp_request**: Sent when AI initiates a tool call with the tool name and arguments
- **mcp_response**: Sent when tool execution completes with result or error

Execution happens in the streaming context with:
```python
# When tool calls detected during streaming
yield _sse_message({
    "type": "mcp_request",
    "toolName": tool_name,
    "toolArgs": tool_args,
})

# Execute tool and stream response
result = execute_tool_call(tool_name, tool_args, uid, ...)
yield _sse_message({
    "type": "mcp_response",
    "toolName": tool_name,
    "success": result.get("success"),
    "result": result.get("result") if success else None,
    "error": result.get("error") if not success else None,
})
```

**File: `backend/api-documentation.md`**

Added documentation for the new SSE event types in the streaming section of the `/chats/<chat_id>/messages` endpoint.

### 2. Frontend Components (React/TypeScript)

#### New Files Created:

**`web-app/src/types/mcp.ts`**
- Type definitions for all MCP events
- MCPRequestEvent, MCPResponseEvent, ChatStreamEvent types
- Proper TypeScript interfaces for full type safety

**`web-app/src/utils/sseParser.ts`**
- SSEParser class: Parses raw SSE stream data into events
- parseSSEStream generator: Converts ReadableStream to async iterable
- Robust error handling and buffering for incomplete messages

**`web-app/src/components/mcp/MCPRequest.tsx`**
- Single MCP request/response display component
- Expandable details with formatted JSON arguments and results
- Status indicators (loading, success, error)
- Beautiful gradient backgrounds and smooth animations

**`web-app/src/components/mcp/MCPRequest.css`**
- Modern, clean styling with:
  - Color-coded status indicators (blue=pending, green=success, red=error)
  - Smooth transitions and animations
  - Responsive design for mobile
  - Code syntax highlighting for JSON display
  - Custom scrollbars

**`web-app/src/components/mcp/MCPRequestContainer.tsx`**
- Container component managing multiple requests
- Header with stats (pending/success/error counts)
- Clear all button
- Automatic scrolling with max-height overflow
- Compact mode for smaller displays

**`web-app/src/components/mcp/MCPRequestContainer.css`**
- Container styling with rotating gear icon
- Stat badges with pulse animations
- Professional header design

**`web-app/src/hooks/useMCPStream.ts`**
- React hook for handling SSE streams
- Callback handlers for each event type
- Streaming state management
- Error handling and cancellation

**`web-app/src/components/mcp/EXAMPLE_INTEGRATION.tsx`**
- Complete example showing integration into a chat component
- Demonstrates message streaming, MCP tracking, and display

**`web-app/src/components/mcp/README.md`**
- Comprehensive documentation
- Usage examples
- Type definitions
- Styling guide
- Accessibility notes

## How It Works

### 1. User Sends Message with Streaming

```typescript
const stream = await ChatService.createMessageStream(chatId, {
  uid: 'user-id',
  content: 'Search my notes and create a summary',
  stream: true  // Enable SSE streaming
});
```

### 2. Backend Processes Request

- AI analyzes the user message
- Detects that it needs to use tools (e.g., search_notes)
- Streams `mcp_request` event with tool details
- Executes the tool
- Streams `mcp_response` event with result

### 3. Frontend Receives and Displays

```typescript
const { streamMessages } = useMCPStream({
  onMCPRequest: (request) => {
    // Add to UI
    setMcpRequests(prev => [...prev, {
      id: generateId(),
      request,
      timestamp: Date.now()
    }]);
  },
  onMCPResponse: (response) => {
    // Update request with response
    setMcpRequests(prev => 
      prev.map(req => 
        req.request.toolName === response.toolName
          ? { ...req, response }
          : req
      )
    );
  }
});

await streamMessages(stream);
```

### 4. User Sees Real-time Updates

- Loading spinner appears for each tool call
- Arguments are displayed in expanded view
- Status updates from pending → success/error
- Results are shown with syntax highlighting

## Stream Event Flow

```
USER MESSAGE
    ↓
[user_message event]
    ↓
AI PROCESSING
    ↓
[token events] - streaming text
    ↓
AI REQUESTS TOOL
    ↓
[mcp_request event] ← USER SEES THIS
    ↓
TOOL EXECUTION
    ↓
[mcp_response event] ← USER SEES THIS
    ↓
MORE TOKENS / TOOLS / DONE
    ↓
[assistant_message event] - final message
```

## Visual Design

The MCP components feature a refined, modern aesthetic:

- **Color Palette:**
  - Pending (Blue): #5a7cff - indicates ongoing execution
  - Success (Green): #22c55e - tool executed without errors
  - Error (Red): #ef4444 - tool failed

- **Design Elements:**
  - Gradient backgrounds for visual depth
  - Smooth transitions (0.2s ease)
  - Rotating gear icon in header
  - Pulsing status text while loading
  - Code syntax highlighting
  - Professional typography

- **Responsive:**
  - Works on mobile, tablet, desktop
  - Adjusts padding and font sizes
  - Touch-friendly interactive areas

## Usage Tips

1. **Always use useCallback** for stream handlers to avoid recreating functions:
   ```typescript
   const { streamMessages } = useMCPStream({
     onMCPRequest: useCallback((request) => {
       // handler
     }, [dependencies])
   });
   ```

2. **Track request-response pairs** by unique request properties:
   ```typescript
   const updated = prev.map(req =>
     req.request.toolName === response.toolName
       ? { ...req, response }
       : req
   );
   ```

3. **Handle errors gracefully**:
   ```typescript
   onError: (message, code) => {
     console.error(`Error [${code}]: ${message}`);
     // Show error to user
   }
   ```

4. **Clear requests** when starting new conversation:
   ```typescript
   const handleNewChat = () => {
     setMcpRequests([]);
     // ... other cleanup
   };
   ```

## Testing

To test the implementation:

1. Ensure backend is running: `python backend/app.py`
2. Create a chat
3. Send a message that requires tool use (e.g., "Remember that I like coffee")
4. Observe MCP request/response events in the UI

## Files Modified

- `backend/zen_backend/chats/routes.py` - Added MCP event streaming
- `backend/api-documentation.md` - Added SSE event documentation

## Files Created

- `web-app/src/types/mcp.ts` - Type definitions
- `web-app/src/utils/sseParser.ts` - SSE parsing utility
- `web-app/src/hooks/useMCPStream.ts` - React hook
- `web-app/src/components/mcp/MCPRequest.tsx` - Request component
- `web-app/src/components/mcp/MCPRequest.css` - Component styles
- `web-app/src/components/mcp/MCPRequestContainer.tsx` - Container component
- `web-app/src/components/mcp/MCPRequestContainer.css` - Container styles
- `web-app/src/components/mcp/index.ts` - Exports
- `web-app/src/components/mcp/EXAMPLE_INTEGRATION.tsx` - Integration example
- `web-app/src/components/mcp/README.md` - Documentation

## Next Steps

1. **Integrate into existing chat UI**: Replace stubs in your chat component with actual MCPRequest/Container usage
2. **Add analytics**: Track which tools are used most frequently
3. **Custom visualizations**: Override tool result display for specific tools
4. **Persisting tool history**: Store MCP requests in database for user review
5. **Tool permissions**: Add UI for users to approve/deny tool execution

## Troubleshooting

**MCP events not showing:**
- Ensure `stream: true` is passed to `createMessageStream`
- Check browser console for parsing errors
- Verify backend is streaming events (check network tab in DevTools)

**Events appear but responses don't:**
- Check tool execution errors in backend logs
- Verify tool arguments are correct
- Check Firestore permissions for tool operations

**Styling issues:**
- Clear browser cache
- Ensure CSS files are imported in components
- Check for CSS conflicts with existing styles

## References

- [Server-Sent Events (SSE) MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [React Streams](https://react.dev/reference/react/use)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
