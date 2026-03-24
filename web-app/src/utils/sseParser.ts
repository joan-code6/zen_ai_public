import { ChatStreamEvent } from '@/types/mcp';

/**
 * Parses Server-Sent Events (SSE) stream into individual events
 */
export class SSEParser {
  private buffer: string = '';

  /**
   * Process a chunk of data from the SSE stream
   */
  processChunk(chunk: string): ChatStreamEvent[] {
    this.buffer += chunk;
    const events: ChatStreamEvent[] = [];
    
    // Split by double newline which marks end of SSE message
    const parts = this.buffer.split('\n\n');
    
    // Keep the last part in the buffer if it doesn't end with double newline
    this.buffer = this.buffer.endsWith('\n\n') ? '' : parts[parts.length - 1];
    
    // Process complete messages
    for (let i = 0; i < parts.length - 1; i++) {
      const message = parts[i].trim();
      if (message) {
        try {
          const event = this.parseSSEMessage(message);
          if (event) {
            events.push(event);
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', message, error);
        }
      }
    }
    
    return events;
  }

  /**
   * Flush any remaining data in the buffer
   */
  flush(): ChatStreamEvent[] {
    const events: ChatStreamEvent[] = [];
    if (this.buffer.trim()) {
      try {
        const event = this.parseSSEMessage(this.buffer);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        console.error('Failed to parse final SSE message:', this.buffer, error);
      }
    }
    this.buffer = '';
    return events;
  }

  /**
   * Parse a single SSE message into a ChatStreamEvent
   */
  private parseSSEMessage(message: string): ChatStreamEvent | null {
    let eventType: string | null = null;
    let data: string = '';

    // Parse lines of the SSE message
    const lines = message.split('\n');
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        // Multiple data lines are concatenated
        data += (data ? '\n' : '') + line.slice(6);
      }
    }

    if (!data) {
      return null;
    }

    // Parse JSON payload
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      console.warn('Failed to parse SSE data as JSON:', data);
      return null;
    }

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    // Extract the type from event field or eventType header
    const eventObj = payload as Record<string, unknown>;
    const type = eventObj.type as string || eventType;

    if (!type) {
      return null;
    }

    return {
      type: type as ChatStreamEvent['type'],
      ...eventObj,
    } as ChatStreamEvent;
  }
}

/**
 * Convert SSE stream to an async iterable of ChatStreamEvents
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser();
  let eventCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log(`SSE stream ended after ${eventCount} events`);
        // Flush any remaining data
        const finalEvents = parser.flush();
        for (const event of finalEvents) {
          eventCount++;
          console.log(`SSE event ${eventCount}:`, event.type);
          yield event;
        }
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const events = parser.processChunk(chunk);
      for (const event of events) {
        eventCount++;
        console.log(`SSE event ${eventCount}:`, event.type);
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
