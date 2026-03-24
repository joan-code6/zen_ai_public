```
MCP REQUEST STREAMING ARCHITECTURE
===================================

┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE LAYER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────┐   ┌──────────────────────────┐    │
│  │   Chat Component                    │   │  MCPRequestContainer     │    │
│  │                                     │   │  - Shows all MCP calls   │    │
│  │  - Message input                    │◄──┤  - Stats (pending/ok/no) │    │
│  │  - Message display                  │   │  - Expandable details    │    │
│  │  - Send button                      │   │                          │    │
│  │                                     │   └──────────────────────────┘    │
│  └─────────────────────────────────────┘              ▲                    │
│            ▲                                          │                    │
│            │                                    MCPQueuedRequest[]         │
│            │                                          │                    │
│        chat                                    ┌──────────────────────────┐ │
│        messages                                │  MCPRequest Component    │ │
│            │                                   │  - Tool name             │ │
│            │ (via useMCPStream hook)           │  - Arguments (display)   │ │
│            │                                   │  - Result/Error (expand) │ │
│            │                                   │  - Status indicator      │ │
│            └──────────────────────────────────────────────────────────┘  │
│                                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                        ▲
                                        │
                                  SSE Stream
                                  (JSON events)
                                        │
┌─────────────────────────────────────────────────────────────────────────────┐
│                     NETWORK & PARSING LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ReadableStream<Uint8Array>                                                │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────┐                                  │
│  │  parseSSEStream()                    │                                  │
│  │  - Decodes Uint8Array → string       │                                  │
│  │  - Splits on double newlines         │                                  │
│  │  - Parses event: and data: lines     │                                  │
│  │  - Returns async iterable            │                                  │
│  └─────────────┬────────────────────────┘                                  │
│               │                                                            │
│               ▼                                                            │
│  ┌──────────────────────────────────────┐                                  │
│  │  useMCPStream Hook                   │                                  │
│  │  - Iterates over events              │                                  │
│  │  - Routes to callbacks:              │                                  │
│  │    • onUserMessage                   │                                  │
│  │    • onToken                         │                                  │
│  │    • onMCPRequest     ◄──────┐       │                                  │
│  │    • onMCPResponse    ◄──────┼─┐     │                                  │
│  │    • onAssistantMessage       │ │     │                                  │
│  │    • onError                 │  │     │                                  │
│  │    • onDone                  │  │     │                                  │
│  └──────────────────────────────┼──┼─────┘                                  │
│                                 │  │                                       │
└─────────────────────────────────┼──┼───────────────────────────────────────┘
                                  │  │
                           updates UI │
                                  │  │
                           React State│
                                  │  │
                           setMcpRequests()
                                  │
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND API LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  POST /chats/{chat_id}/messages                                            │
│  {                                                                          │
│    "uid": "user-id",                                                       │
│    "content": "Search my notes",                                           │
│    "stream": true                    ◄─── Enables SSE streaming            │
│  }                                                                          │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────┐                              │
│  │  Chat Route Handler (Flask)              │                              │
│  │                                          │                              │
│  │  1. Parse request                        │                              │
│  │  2. Store user message                   │                              │
│  │  3. Check if streaming requested         │                              │
│  │  4. Call stream_reply() to AI            │                              │
│  │  5. For each event:                      │                              │
│  │     - Parse response                     │                              │
│  │     - Emit SSE events (yield)            │                              │
│  └──────────────────────────────────────────┘                              │
│         │                                                                   │
│         ▼                                                                   │
│  Event Stream Generator                                                    │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │ yield _sse_message({"type": "user_message", ...})            │          │
│  │                                                              │          │
│  │ for event in stream_reply():                                │          │
│  │   if function_call detected:                                │          │
│  │     ┌───────────────────────────────────────────────┐       │          │
│  │     │ yield _sse_message({                          │       │          │
│  │     │   "type": "mcp_request",        ◄─────────────┼────┐  │          │
│  │     │   "toolName": "search_notes",   │             │    │  │          │
│  │     │   "toolArgs": {...}             │             │    │  │          │
│  │     │ })                              │             │    │  │          │
│  │     │                                 │             │    │  │          │
│  │     │ result = execute_tool_call(...)  │             │    │  │          │
│  │     │                                 │             │    │  │          │
│  │     │ yield _sse_message({            │             │    │  │          │
│  │     │   "type": "mcp_response",        ◄─────────────┼──┐ │  │          │
│  │     │   "toolName": "search_notes",   │     │       │  │ │  │          │
│  │     │   "success": true,              │     │       │  │ │  │          │
│  │     │   "result": {...}               │     │       │  │ │  │          │
│  │     │ })                              │     │       │  │ │  │          │
│  │     └───────────────────────────────────────┼───────┘  │ │  │          │
│  │   else:                                     │        │ │  │          │
│  │     yield token event                       │        │ │  │          │
│  │                                             │        │ │  │          │
│  │ yield _sse_message({"type": "done"})        │        │ │  │          │
│  └─────────────────────────────────────────────┼────────┼─┼──┘          │
│                                                │        │ │              │
│                                          SSE Events    │ │              │
│                                                │        ▼ ▼              │
│                                                └──────────────────────► │
│                                           Over HTTP (text/event-stream) │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘


DATA FLOW EXAMPLE
=================

User: "Remember my favorite color is blue"
│
├─────────────────────────────────────────────────────────────►
│                         API Request
│  {
│    "uid": "user-123",
│    "content": "Remember my favorite color is blue",
│    "stream": true
│  }
│

Backend Processing:
│
├─► AI receives: "Remember my favorite color is blue"
│
├─► AI determines: "I need to use create_note tool"
│
├─► Starts streaming:
│   • yield {"type": "user_message", "message": {...}}
│   • starts reading from AI stream...
│   • detects function_call: create_note
│   
│   ├─► yield {
│   │     "type": "mcp_request",
│   │     "toolName": "create_note",
│   │     "toolArgs": {
│   │       "title": "Favorite color",
│   │       "content": "Blue",
│   │       "keywords": ["preferences"]
│   │     }
│   │   }
│   │
│   ├─► execute create_note in database
│   │
│   └─► yield {
│         "type": "mcp_response",
│         "toolName": "create_note",
│         "success": true,
│         "result": {"id": "note-123", "title": "Favorite color"}
│       }
│
│   • continues reading from AI for assistant response...
│   • yield token events for "I've saved..."
│   
│   ├─► yield {
│   │     "type": "assistant_message",
│   │     "message": {"content": "I've saved this preference..."}
│   │   }
│   │
│   └─► yield {"type": "done"}
│

Frontend Reception:
│
├─► StreamParser→ mcp_request event
│   └─► useMCPStream callback → onMCPRequest
│       └─► setMcpRequests([{request: {...}, loading}])
│           └─► MCPRequestContainer renders loading state
│
├─► StreamParser → token events  
│   └─► onToken callback
│       └─► Update assistant message text
│
├─► StreamParser → mcp_response event
│   └─► useMCPStream callback → onMCPResponse
│       └─► setMcpRequests([{request: {...}, response: {...}}])
│           └─► MCPRequestContainer shows success ✓
│
├─► StreamParser → assistant_message event
│   └─► onAssistantMessage callback
│       └─► Add to messages state
│
└─► StreamParser → done event
    └─► onDone callback
        └─► Mark streaming as complete


TYPE DEFINITIONS FLOW
=====================

ChatStreamEvent (union type)
├─ UserMessageEvent
├─ TokenEvent
├─ MCPRequestEvent ────────────► MCPRequest Component displays
├─ MCPResponseEvent ──────────► MCPRequest Component displays
├─ AssistantMessageEvent
├─ ChatTitleEvent
├─ ErrorEvent
└─ DoneEvent

MCPQueuedRequest (internal state)
└─ {
    id: string
    request: MCPRequestEvent
    response?: MCPResponseEvent
    timestamp: number
  }


COMPONENT HIERARCHY
===================

ChatComponent
├─ MessageList
│  ├─ Message (user)
│  ├─ Message (assistant with streaming)
│  └─ MCPRequestContainer  ◄─── Manages all MCP requests
│     ├─ MCPRequest  ◄─ Loading (spinning)
│     ├─ MCPRequest  ◄─ Success (expanded)
│     └─ MCPRequest  ◄─ Pending (collapsed)
├─ MessageInput
└─ useMCPStream (hook)
   └─ Handles SSE parsing and callbacks


STATE MANAGEMENT
================

React Component State:
├─ messages: Message[]
│  └─ User and assistant messages
├─ mcpRequests: MCPQueuedRequest[]
│  └─ Tracking tool calls
├─ isStreaming: boolean
│  └─ Indicates if SSE active
└─ error: string | null
   └─ Stream errors

Refs (persistent across re-renders):
└─ mcpRequestMapRef: Map<string, MCPRequestEvent>
   └─ Temporary map for request tracking


EVENT LIFECYCLE
===============

1. User clicks "Send"
   └─ setMcpRequests([])  // Clear previous
   └─ Call streamMessages(stream)

2. Backend sends first event: user_message
   └─ onUserMessage callback
   └─ Add to messages

3. Backend sends token events repeatedly
   └─ onToken callback (multiple times)
   └─ Update last message text

4. Backend detects tool need
   └─ Send mcp_request event
   └─ onMCPRequest callback
   └─ setMcpRequests([...prev, {request, loading}])
   └─ Component mounts with spinner

5. Tool executes (async)
   └─ (No events sent during execution)

6. Backend sends mcp_response
   └─ onMCPResponse callback
   └─ setMcpRequests update with response
   └─ Spinner stops, status shows result

7. Backend may send more tokens/mcp calls...

8. Backend sends assistant_message event (final)
   └─ onAssistantMessage callback
   └─ Confirm message is complete

9. Backend sends done event
   └─ onDone callback
   └─ Mark streaming as complete
   └─ Set isStreaming = false

Repeat for next user message...
```
