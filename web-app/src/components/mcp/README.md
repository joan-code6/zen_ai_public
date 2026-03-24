# MCP (Model Context Protocol) Request Display

This directory contains React components and utilities for displaying Model Context Protocol (MCP) requests and responses in real-time as the AI executes tool calls.

## Overview

When the AI assistant needs to use tools (like creating notes, searching notes, etc.), these requests are now streamed to the frontend in real-time, allowing users to see exactly what the AI is doing.

## Components

### MCPRequest

A single MCP request/response display component.

**Features:**
- Shows tool name with formatted display
- Loading state with spinner animation
- Success/error status indicators
- Expandable details view with:
  - Tool arguments (formatted as JSON)
  - Execution result or error message
- Beautiful, responsive design with smooth transitions

**Usage:**
```tsx
import { MCPRequest } from '@/components/mcp';

<MCPRequest
  request={{
    type: 'mcp_request',
    toolName: 'search_notes',
    toolArgs: { query: 'important facts' }
  }}
  response={{
    type: 'mcp_response',
    toolName: 'search_notes',
    success: true,
    result: { notes: [...], count: 2 }
  }}
/>
```

### MCPRequestContainer

A container that manages and displays multiple MCP requests with statistics.

**Features:**
- Header with tool icon and stats
- Compactness mode for smaller displays
- Clear all button
- Automatic scrolling with max height
- Stats showing pending/success/error counts
- Smooth animations for new requests

**Usage:**
```tsx
import { MCPRequestContainer } from '@/components/mcp';

const [requests, setRequests] = useState<MCPQueuedRequest[]>([]);

<MCPRequestContainer
  requests={requests}
  onRequestsChange={setRequests}
  compact={false}
/>
```

## Hooks

### useMCPStream

A React hook for handling Server-Sent Events (SSE) stream from the chat API.

**Features:**
- Parses SSE events and emits callbacks
- Tracks streaming state
- Error handling
- Cancel/reset functionality

**Usage:**
```tsx
import { useMCPStream } from '@/hooks/useMCPStream';

const { streamMessages, isStreaming, error, cancel } = useMCPStream({
  onUserMessage: (content) => console.log('User:', content),
  onToken: (token, accumulated) => console.log('Token:', token),
  onMCPRequest: (request) => console.log('MCP Request:', request),
  onMCPResponse: (response) => console.log('MCP Response:', response),
  onAssistantMessage: (content) => console.log('Assistant:', content),
  onError: (message, code) => console.error(message),
  onDone: () => console.log('Done'),
});

// Stream a response
const stream = await ChatService.createMessageStream(chatId, {
  uid,
  content: 'Hello',
  stream: true,
});
await streamMessages(stream);
```

## Utilities

### parseSSEStream

Converts a ReadableStream from SSE response into an async iterable of ChatStreamEvent objects.

```tsx
import { parseSSEStream } from '@/utils/sseParser';

for await (const event of parseSSEStream(stream)) {
  console.log('Event:', event);
}
```

## Stream Event Types

The chat API supports the following SSE event types:

- **user_message**: User message confirmation
- **token**: Streamed text token from AI
- **mcp_request**: Tool/function call initiated by AI
- **mcp_response**: Tool execution result
- **assistant_message**: Final assistant message
- **chat_title**: Auto-generated chat title
- **error**: Error during processing
- **done**: Streaming completed

## Integration Example

See `EXAMPLE_INTEGRATION.tsx` for a complete example of how to integrate MCP components into a chat interface.

## Styling

### Color Scheme

- **Pending**: Blue (#5a7cff) - Tool is running
- **Success**: Green (#22c55e) - Tool executed successfully
- **Error**: Red (#ef4444) - Tool execution failed

### CSS Variables (available for customization)

The components use inline styling but can be extended with CSS variables. Customize colors by overriding the classes in your global styles:

```css
.mcp-request.loading {
  --color-primary: #5a7cff;
}

.mcp-request.success {
  --color-primary: #22c55e;
}

.mcp-request.error {
  --color-primary: #ef4444;
}
```

## Backend Integration

The backend (Flask) streams MCP events via Server-Sent Events (SSE) when `stream: true` is passed to the message creation endpoint:

```bash
POST /chats/{chat_id}/messages
Content-Type: application/json

{
  "uid": "user-id",
  "content": "Search my notes about projects",
  "stream": true
}
```

### Response Format

Each SSE message follows this format:
```
event: [event_type]
data: {json_payload}

```

Example MCP request event:
```
event: mcp_request
data: {"type":"mcp_request","toolName":"search_notes","toolArgs":{"query":"projects"}}

```

Example MCP response event:
```
event: mcp_response
data: {"type":"mcp_response","toolName":"search_notes","success":true,"result":{"notes":[...],"count":2},"error":null}

```

## Accessibility

- All interactive elements are keyboard navigable
- Proper ARIA roles and labels
- Color is not the only indicator of status (icons/text used as well)
- Responsive design works on mobile devices

## Performance Notes

- MCP requests are rendered in a virtual list (within the container's 500px max-height)
- Smooth CSS animations (60fps)
- Minimal re-renders through React hooks
- SSE stream parsing is efficient with minimal memory overhead

## Types

All TypeScript types are exported from `@/types/mcp`:

```tsx
import {
  MCPEventType,
  MCPRequestEvent,
  MCPResponseEvent,
  ChatStreamEvent,
} from '@/types/mcp';
```

## Browser Compatibility

- Modern browsers with ReadableStream support (Chrome, Firefox, Safari, Edge)
- Graceful fallback for older browsers through error handling
- Server-Sent Events (SSE) supported in all modern browsers

## Future Enhancements

Possible future improvements:
- Tool execution history/replay
- Tool performance analytics
- Custom tool result visualizations
- Tool permissions/approvals
- Results export/sharing
