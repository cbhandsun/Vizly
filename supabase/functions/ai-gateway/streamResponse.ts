import type { TextStreamPart, ToolSet } from 'ai';

const encoder = new TextEncoder();
const MAX_TOOL_CALLS = 10;

const encodeSse = (value: unknown): Uint8Array => (
  encoder.encode(`data: ${JSON.stringify(value)}\n\n`)
);

export const createGatewayStreamResponse = <TOOLS extends ToolSet>(
  stream: AsyncIterable<TextStreamPart<TOOLS>>,
  headers: Headers,
): Response => {
  let toolCallCount = 0;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const part of stream) {
          if (part.type === 'text-delta' && part.text) {
            controller.enqueue(encodeSse({ choices: [{ delta: { content: part.text } }] }));
          } else if (part.type === 'reasoning-delta' && part.text) {
            controller.enqueue(encodeSse({ choices: [{ delta: { reasoning_content: part.text } }] }));
          } else if (part.type === 'tool-call' && toolCallCount < MAX_TOOL_CALLS) {
            toolCallCount += 1;
            controller.enqueue(encodeSse({
              vizly: {
                type: 'tool-call',
                toolName: part.toolName,
                input: part.input,
              },
            }));
          } else if (part.type === 'error') {
            controller.enqueue(encodeSse({ vizly: { type: 'error' } }));
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch {
        controller.enqueue(encodeSse({ vizly: { type: 'error' } }));
      } finally {
        controller.close();
      }
    },
  });

  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'text/event-stream; charset=utf-8');
  responseHeaders.set('Cache-Control', 'no-cache, no-transform');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('X-Vizly-AI-Gateway', 'vizly-ai-gateway-v1');
  return new Response(body, { status: 200, headers: responseHeaders });
};
