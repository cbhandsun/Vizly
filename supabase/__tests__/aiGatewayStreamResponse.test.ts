import type { TextStreamPart } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { diagramTools } from '../functions/ai-gateway/diagramTools';
import { createGatewayStreamResponse, AI_GATEWAY_MAX_EVENT_BYTES, AI_GATEWAY_MAX_STREAM_BYTES } from '../functions/ai-gateway/streamResponse';

describe('AI gateway stream response', () => {
  it('extends the idle deadline only when actual provider output progresses', async () => {
    vi.useFakeTimers();
    try {
      async function* stream() {
        for (const text of ['first output', 'second output']) {
          await new Promise(resolve => setTimeout(resolve, 20_000));
          yield { type: 'text-delta', id: 'progress', text } as const;
        }
      }
      const abort = vi.fn();
      const body = createGatewayStreamResponse(stream(), new Headers(), abort).text();
      await vi.advanceTimersByTimeAsync(40_500);
      const text = await body;
      expect(text).toContain('first output');
      expect(text).toContain('second output');
      expect(text).toContain('data: [DONE]');
      expect(text).not.toContain('"type":"error"');
      expect(abort).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('does not let keepalive comments extend the provider idle deadline', async () => {
    vi.useFakeTimers();
    try {
      const next = vi.fn(() => new Promise<IteratorResult<TextStreamPart<typeof diagramTools>>>(() => {}));
      const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
      const abort = vi.fn(), finish = vi.fn();
      const usage = { bytes: vi.fn(), tokens: vi.fn(), finish: vi.fn() };
      const body = createGatewayStreamResponse({ [Symbol.asyncIterator]: () => ({ next, return: returned }) }, new Headers(), abort, finish, usage).text();
      await vi.advanceTimersByTimeAsync(30_500);
      const text = await body;
      expect(text).toContain(': keepalive');
      expect(text).toContain('"type":"error"');
      expect(text).not.toContain('[DONE]');
      expect(usage.finish).toHaveBeenCalledWith('timeout');
      expect(abort).toHaveBeenCalledOnce();
      expect(finish).toHaveBeenCalledOnce();
      expect(returned).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('resumes delayed provider output after idle comments and finishes without a timer leak', async () => {
    vi.useFakeTimers();
    try {
      async function* stream() {
        await new Promise(resolve => setTimeout(resolve, 1250));
        yield { type: 'text-delta', id: 'delayed', text: 'delayed output' } as const;
      }
      const finish = vi.fn();
      const body = createGatewayStreamResponse(stream(), new Headers(), undefined, finish).text();
      await vi.advanceTimersByTimeAsync(1500);
      const text = await body;
      expect(text.match(/: keepalive/g)).toHaveLength(2);
      expect(text).toContain('delayed output');
      expect(text).toContain('data: [DONE]');
      expect(finish).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('keeps idle connections observable without duplicate reads or unbounded buffering', async () => {
    vi.useFakeTimers();
    try {
      const next = vi.fn(() => new Promise<IteratorResult<TextStreamPart<typeof diagramTools>>>(() => {}));
      const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
      const abort = vi.fn();
      const response = createGatewayStreamResponse({ [Symbol.asyncIterator]: () => ({ next, return: returned }) }, new Headers(), abort);
      const reader = response.body!.getReader();
      const first = reader.read();
      await vi.advanceTimersByTimeAsync(500);
      expect(new TextDecoder().decode((await first).value)).toBe(': keepalive\n\n');
      await vi.advanceTimersByTimeAsync(5000);
      expect(next).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0); // One queued frame; backpressure stops timers.
      await reader.read();
      await vi.advanceTimersByTimeAsync(0);
      await reader.cancel();
      await vi.advanceTimersByTimeAsync(0);
      expect(abort).toHaveBeenCalledOnce();
      expect(returned).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it.each(['ascii', 'unicode', 'escaping', 'tool'] as const)('aborts oversized %s events without forwarding their contents', async kind => {
    const text = kind === 'unicode' ? '图'.repeat(Math.ceil(AI_GATEWAY_MAX_EVENT_BYTES / 3))
      : kind === 'escaping' ? '\n'.repeat(AI_GATEWAY_MAX_EVENT_BYTES / 2)
        : 'x'.repeat(AI_GATEWAY_MAX_EVENT_BYTES);
    let returned = false;
    async function* stream() {
      try {
        yield kind === 'tool' ? { type: 'tool-call', toolCallId: 'large', toolName: 'layout', input: { text } }
          : { type: 'text-delta', id: 'large', text };
        yield { type: 'text-delta', id: 'late', text: 'must-not-appear' };
      } finally { returned = true; }
    }
    const abort = vi.fn(), finish = vi.fn();
    const body = await createGatewayStreamResponse(stream() as unknown as AsyncIterable<TextStreamPart<typeof diagramTools>>,
      new Headers(), abort, finish).text();
    expect(body).toBe('data: {"vizly":{"type":"error"}}\n\n');
    expect(abort).toHaveBeenCalledOnce(); expect(finish).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(returned).toBe(true));
  });
  it('accepts an event at the exact encoded byte boundary and rejects one extra byte', async () => {
    const overhead = new TextEncoder().encode('data: {"choices":[{"delta":{"content":""}}]}\n\n').byteLength;
    for (const extra of [0, 1]) {
      const text = 'x'.repeat(AI_GATEWAY_MAX_EVENT_BYTES - overhead + extra);
      async function* stream() { yield { type: 'text-delta', id: 'boundary', text } as const; }
      const abort = vi.fn();
      const body = await createGatewayStreamResponse(stream(), new Headers(), abort).text();
      if (extra === 0) { expect(body).toContain(text); expect(abort).not.toHaveBeenCalled(); }
      else { expect(body).not.toContain(text); expect(abort).toHaveBeenCalledOnce(); }
    }
  });
  it('bounds cumulative output including its final error and stops reading upstream', async () => {
    let read = 0;
    async function* stream() {
      for (let index = 0; index < 100; index++) {
        read++; yield { type: 'reasoning-delta', id: 'chunk', text: 'x'.repeat(128 * 1024) } as const;
      }
    }
    const abort = vi.fn(), finish = vi.fn();
    const body = await createGatewayStreamResponse(stream(), new Headers(), abort, finish).arrayBuffer();
    expect(body.byteLength).toBeLessThanOrEqual(AI_GATEWAY_MAX_STREAM_BYTES);
    expect(new TextDecoder().decode(body)).toContain('"type":"error"');
    expect(read).toBeLessThan(100); expect(abort).toHaveBeenCalledOnce(); expect(finish).toHaveBeenCalledOnce();
  });
  it('applies backpressure and stops reading when the consumer cancels', async () => {
    let reads = 0, finalized = false;
    async function* stream() {
      try { while (true) { reads++; yield { type: 'text-delta', id: 'text', text: 'chunk' } as const; } }
      finally { finalized = true; }
    }
    const abort = vi.fn();
    const response = createGatewayStreamResponse(stream(), new Headers(), abort);
    await vi.waitFor(() => expect(reads).toBe(1));
    // There is only one queued chunk, even though the upstream is unlimited.
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(reads).toBe(1);
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    await vi.waitFor(() => expect(finalized).toBe(true));
    const stoppedAt = reads;
    await reader.cancel();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(reads).toBe(stoppedAt);
    expect(reads).toBeLessThanOrEqual(2);
  });

  it.each(['resolve', 'reject'] as const)('cancels promptly with next() pending and safely ignores late %s', async action => {
    let resolveNext!: (value: IteratorResult<TextStreamPart<typeof diagramTools>>) => void;
    let rejectNext!: (reason: Error) => void;
    const pending = new Promise<IteratorResult<TextStreamPart<typeof diagramTools>>>((resolve, reject) => {
      resolveNext = resolve; rejectNext = reject;
    });
    const next = vi.fn(() => pending), returned = vi.fn(async () => ({ done: true as const, value: undefined }));
    const stream = { [Symbol.asyncIterator]: () => ({ next, return: returned }) };
    const abort = vi.fn();
    const response = createGatewayStreamResponse(stream, new Headers(), abort);
    const reader = response.body!.getReader();
    const read = reader.read();
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    await reader.cancel();
    expect(abort).toHaveBeenCalledOnce();
    expect(returned).toHaveBeenCalledOnce();
    if (action === 'resolve') resolveNext({ done: false, value: { type: 'text-delta', id: 'late', text: 'must-not-appear' } });
    else rejectNext(new Error('private upstream failure'));
    await expect(read).resolves.toEqual({ done: true, value: undefined });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  it('sanitizes thrown upstream errors and returns the iterator', async () => {
    const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
    const stream = { [Symbol.asyncIterator]: () => ({ next: async () => { throw new Error('private credential'); }, return: returned }) };
    const abort = vi.fn();
    const body = await createGatewayStreamResponse(stream, new Headers(), abort).text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('private credential');
    expect(abort).toHaveBeenCalledOnce();
    expect(returned).toHaveBeenCalledOnce();
  });
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
