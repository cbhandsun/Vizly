import type { TextStreamPart } from 'ai';
import { describe, expect, it } from 'vitest';
import { diagramTools } from '../functions/ai-gateway/diagramTools';
import { createGatewayStreamResponse } from '../functions/ai-gateway/streamResponse';

describe('AI gateway stream response', () => {
  it('maps text, reasoning, and validated tool calls to the bounded Vizly SSE protocol', async () => {
    const parts = [
      { type: 'text-delta', id: 'text-1', text: 'Hello' },
      { type: 'reasoning-delta', id: 'reasoning-1', text: 'Think' },
      {
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'layout',
        input: { strategy: 'dagre' },
      },
    ];
    async function* stream() {
      yield* parts;
    }

    const response = createGatewayStreamResponse(
      stream() as unknown as AsyncIterable<TextStreamPart<typeof diagramTools>>,
      new Headers({ 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173' }),
    );
    const body = await response.text();

    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(body).toContain('"content":"Hello"');
    expect(body).toContain('"reasoning_content":"Think"');
    expect(body).toContain('"toolName":"layout"');
    expect(body).toContain('"strategy":"dagre"');
    expect(body).toContain('data: [DONE]');
  });

  it('does not expose provider errors through the stream', async () => {
    async function* stream() {
      yield { type: 'error', error: new Error('secret provider response') };
    }
    const response = createGatewayStreamResponse(
      stream() as unknown as AsyncIterable<TextStreamPart<typeof diagramTools>>,
      new Headers(),
    );
    const body = await response.text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('secret provider response');
  });
});
