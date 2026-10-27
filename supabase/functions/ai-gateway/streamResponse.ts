import type { TextStreamPart, ToolSet } from 'ai';
import type { GatewayUsageRecorder } from './usageRecord.ts';

const encoder = new TextEncoder();
const MAX_TOOL_CALLS = 10;
const MAX_PROVIDER_IDLE_MS = 30_000;
export const AI_GATEWAY_MAX_EVENT_BYTES = 256 * 1024;
export const AI_GATEWAY_MAX_STREAM_BYTES = 4 * 1024 * 1024;

const encodeSse = (value: unknown): Uint8Array => (
  encoder.encode(`data: ${JSON.stringify(value)}\n\n`)
);
const errorFrame = encodeSse({ vizly: { type: 'error' } });
const doneFrame = encoder.encode('data: [DONE]\n\n');
const heartbeatFrame = encoder.encode(': keepalive\n\n');
const terminalReserve = Math.max(errorFrame.byteLength, doneFrame.byteLength);

const encodeBoundedEvent = (value: unknown): Uint8Array => {
  // Bound serializer work/allocation before UTF-8 encoding, including a tool
  // input containing many small fields. The final check counts escaped JSON,
  // multi-byte text and SSE framing, not JS string length.
  let work = 0;
  const json = JSON.stringify(value, (key, item: unknown) => {
    work += key.length + 1 + (typeof item === 'string' ? item.length : 0);
    if (work > AI_GATEWAY_MAX_EVENT_BYTES) throw new Error('Event exceeds budget');
    return item;
  });
  if (json.length > AI_GATEWAY_MAX_EVENT_BYTES) throw new Error('Event exceeds budget');
  const bytes = encoder.encode(`data: ${json}\n\n`);
  if (bytes.byteLength > AI_GATEWAY_MAX_EVENT_BYTES) throw new Error('Event exceeds budget');
  return bytes;
};

export const createGatewayStreamResponse = <TOOLS extends ToolSet>(
  stream: AsyncIterable<TextStreamPart<TOOLS>>,
  headers: Headers,
  onCancel?: () => void,
  onFinish?: () => void,
  usage?: GatewayUsageRecorder,
): Response => {
  let toolCallCount = 0;
  let closed = false;
  let emittedBytes = 0;
  let lastProviderProgressAt = Date.now();
  let failureOutcome: 'failed' | 'cancelled' | 'timeout' = 'failed';
  const iterator = stream[Symbol.asyncIterator]();
  let pendingNext: Promise<IteratorResult<TextStreamPart<TOOLS>>> | undefined;
  let wakeHeartbeat: (() => void) | undefined;
  const nextWithHeartbeat = async () => {
    // Keep one provider read in flight. Periodic SSE comments allow both HTTP
    // hops to notice a disconnected consumer while the provider is silent.
    pendingNext ??= Promise.resolve().then(() => iterator.next());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const heartbeat = new Promise<undefined>(resolve => {
      wakeHeartbeat = () => resolve(undefined);
      timer = setTimeout(wakeHeartbeat, 500);
    });
    try {
      const next = await Promise.race([pendingNext, heartbeat]);
      if (next !== undefined) pendingNext = undefined;
      return next;
    } finally {
      clearTimeout(timer);
      wakeHeartbeat = undefined;
    }
  };
  const releaseIterator = () => {
    // Do not await return(): an upstream next() may still be waiting on I/O.
    // The handler aborts that I/O separately before requesting iterator cleanup.
    try { void Promise.resolve(iterator.return?.()).catch(() => undefined); } catch { /* No provider error disclosure. */ }
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      try {
        while (!closed) {
          const next = await nextWithHeartbeat();
          if (closed) return; // Cancellation may race an outstanding next().
          // Enforce the provider deadline independently of SDK/runtime abort
          // propagation. Our own keepalive comments must never extend it.
          if (Date.now() - lastProviderProgressAt >= MAX_PROVIDER_IDLE_MS) {
            failureOutcome = 'timeout';
            throw new Error('Provider output timed out');
          }
          if (next === undefined) {
            if (emittedBytes + heartbeatFrame.byteLength > AI_GATEWAY_MAX_STREAM_BYTES - terminalReserve) {
              throw new Error('Stream exceeds budget');
            }
            emittedBytes += heartbeatFrame.byteLength;
            controller.enqueue(heartbeatFrame);
            usage?.bytes(heartbeatFrame.byteLength);
            return;
          }
          if (next.done) {
            closed = true;
            controller.enqueue(doneFrame);
            usage?.bytes(doneFrame.byteLength);
            usage?.finish('completed');
            controller.close();
            try { onFinish?.(); } catch { /* Lifecycle observers cannot alter output. */ }
            return;
          }
          const part = next.value;
          if ((part.type === 'text-delta' || part.type === 'reasoning-delta') && part.text
            || part.type === 'tool-input-delta' && part.delta
            || part.type === 'tool-call') lastProviderProgressAt = Date.now();
          if (part.type === 'finish') usage?.tokens(part.totalUsage);
          if (part.type === 'abort') {
            failureOutcome = 'cancelled';
            throw new Error('Upstream generation aborted');
          }
          let payload: unknown;
          if (part.type === 'text-delta' && part.text) {
            payload = { choices: [{ delta: { content: part.text } }] };
          } else if (part.type === 'reasoning-delta' && part.text) {
            payload = { choices: [{ delta: { reasoning_content: part.text } }] };
          } else if (part.type === 'tool-call' && toolCallCount < MAX_TOOL_CALLS) {
            toolCallCount += 1;
            payload = { vizly: { type: 'tool-call', toolName: part.toolName, input: part.input } };
          } else if (part.type === 'error') {
            throw new Error('Upstream generation failed');
          }
          if (payload !== undefined) {
            const bytes = encodeBoundedEvent(payload);
            if (emittedBytes + bytes.byteLength > AI_GATEWAY_MAX_STREAM_BYTES - terminalReserve) {
              throw new Error('Stream exceeds budget');
            }
            emittedBytes += bytes.byteLength;
            controller.enqueue(bytes);
            usage?.bytes(bytes.byteLength);
            return; // Read another part only when the consumer has capacity.
          }
        }
      } catch {
        if (closed) return;
        closed = true;
        usage?.bytes(errorFrame.byteLength);
        usage?.finish(failureOutcome);
        try { onCancel?.(); } catch { /* Do not let cleanup errors escape. */ }
        controller.enqueue(errorFrame);
        controller.close();
        releaseIterator();
        try { onFinish?.(); } catch { /* Lifecycle observers cannot alter output. */ }
      }
    },
    cancel() {
      if (closed) return;
      closed = true;
      wakeHeartbeat?.();
      usage?.finish('cancelled');
      try { onCancel?.(); } catch { /* Cleanup must still reach the iterator. */ }
      releaseIterator();
      try { onFinish?.(); } catch { /* Lifecycle observers cannot alter output. */ }
    },
  }, { highWaterMark: 1 });

  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'text/event-stream; charset=utf-8');
  responseHeaders.set('Cache-Control', 'no-cache, no-transform');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('X-Vizly-AI-Gateway', 'vizly-ai-gateway-v1');
  return new Response(body, { status: 200, headers: responseHeaders });
};
