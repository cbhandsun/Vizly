import { describe, expect, it, vi } from 'vitest';
import { streamText } from 'ai';
import { handleAIGatewayRequest } from '../functions/ai-gateway/handler';
import { AI_GATEWAY_MAX_EVENT_BYTES, AI_GATEWAY_MAX_STREAM_BYTES } from '../functions/ai-gateway/streamResponse';
import type { GatewayUsageRecord } from '../functions/ai-gateway/usageRecord';

vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), streamText: vi.fn() }));
vi.mock('../functions/ai-gateway/modelProvider', () => ({ createGatewayLanguageModel: () => ({}) }));

const request = (signal?: AbortSignal) => new Request('https://synthetic.invalid/ai-gateway', {
  method: 'POST', signal,
  headers: { Authorization: 'Bearer synthetic-session-token', Origin: 'http://127.0.0.1:4173', 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: { id: 'custom', baseUrl: 'https://provider.invalid/v1', apiKey: 'synthetic-key' },
    model: 'synthetic-model', messages: [{ role: 'user', content: 'synthetic input' }], toolMode: 'diagram' }),
});
const environment = { allowedProviderOrigins: 'https://provider.invalid', authenticateUser: async () => ({ ok: true as const, userId: 'verified-test-user' }),
  resourceStore: { acquire: async () => ({ admitted: true as const, release: async () => {} }) } };

describe('gateway cancellation reaches the generation signal', () => {
  it.each(['event', 'stream'] as const)('aborts generation and releases admission on %s byte overflow', async budget => {
    let signal: AbortSignal | undefined;
    let returned = false;
    let read = 0;
    const records: Readonly<GatewayUsageRecord>[] = [];
    const release = vi.fn(async () => {});
    const tasks: Promise<void>[] = [];
    vi.mocked(streamText).mockImplementation(options => {
      signal = options.abortSignal;
      return { stream: (async function* () {
        try {
          for (let i = 0; i < 100; i++) {
            read++;
            yield { type: 'text-delta', id: 'text', text: 'x'.repeat(
              budget === 'event' ? AI_GATEWAY_MAX_EVENT_BYTES : 128 * 1024,
            ) };
          }
        } finally { returned = true; }
      })() } as unknown as ReturnType<typeof streamText>;
    });
    const response = await handleAIGatewayRequest(request(), { ...environment,
      resourceStore: { acquire: async () => ({ admitted: true, release }) },
      waitUntil: task => { tasks.push(task); },
      recordUsage: record => { records.push(record); },
    });
    const body = await response.text();
    await Promise.all(tasks);
    expect(body.endsWith('data: {"vizly":{"type":"error"}}\n\n')).toBe(true);
    expect(body).not.toContain('[DONE]');
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(AI_GATEWAY_MAX_STREAM_BYTES);
    expect(signal?.aborted).toBe(true);
    expect(returned).toBe(true);
    expect(read).toBeLessThan(100);
    expect(release).toHaveBeenCalledOnce();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: 'failed', inputTokens: null, outputTokens: null,
      outputBytes: new TextEncoder().encode(body).byteLength });
  });
  it('admits using the verified identity and releases exactly once after normal completion', async () => {
    const release = vi.fn(async () => {});
    const acquire = vi.fn(async () => ({ admitted: true as const, release }));
    const tasks: Promise<void>[] = [];
    vi.mocked(streamText).mockImplementation(() => ({ stream: (async function* () {
      yield { type: 'text-delta', id: 'text', text: 'done' };
    })() } as unknown as ReturnType<typeof streamText>));
    const response = await handleAIGatewayRequest(request(), { ...environment, resourceStore: { acquire }, waitUntil: task => { tasks.push(task); } });
    expect(acquire.mock.calls[0]).toEqual(['verified-test-user', expect.any(AbortSignal)]);
    await response.text(); await Promise.all(tasks);
    expect(release).toHaveBeenCalledOnce();
  });
  it('returns readable retry metadata and does not invoke the provider on quota denial', async () => {
    vi.mocked(streamText).mockClear();
    const records: Readonly<GatewayUsageRecord>[] = [];
    const tasks: Promise<void>[] = [];
    const response = await handleAIGatewayRequest(request(), { ...environment,
      recordUsage: record => { records.push(record); }, waitUntil: task => { tasks.push(task); },
      resourceStore: { acquire: async () => ({ admitted: false, retryAfterSeconds: 42 }) } });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After');
    expect(streamText).not.toHaveBeenCalled();
    await Promise.all(tasks);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: 'limited', outputBytes: 0, inputTokens: null });
  });
  it.each(['missing', 'failed'] as const)('fails closed when the shared store is %s', async kind => {
    vi.mocked(streamText).mockClear();
    const response = await handleAIGatewayRequest(request(), { ...environment, resourceStore: kind === 'missing' ? undefined
      : { acquire: async () => { throw new Error('private store failure'); } } });
    expect(response.status).toBe(503); expect(streamText).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('private store failure');
  });
  it('releases admission when provider setup throws and redacts the failure', async () => {
    const release = vi.fn(async () => {});
    vi.mocked(streamText).mockImplementation(() => { throw new Error('private model credential'); });
    const response = await handleAIGatewayRequest(request(), { ...environment,
      resourceStore: { acquire: async () => ({ admitted: true, release }) } });
    expect(response.status).toBe(502); expect(await response.text()).not.toContain('private model credential');
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  });
  it('releases a late admission after request cancellation without starting generation', async () => {
    const controller = new AbortController(), release = vi.fn(async () => {});
    vi.mocked(streamText).mockClear();
    const response = await handleAIGatewayRequest(request(controller.signal), { ...environment,
      resourceStore: { acquire: async () => { controller.abort(); return { admitted: true, release }; } } });
    expect(response.status).toBe(408); expect(streamText).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  });
  it('releases and aborts at the deadline even when nobody consumes the response', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const records: Readonly<GatewayUsageRecord>[] = [];
      const tasks: Promise<void>[] = [];
      const release = vi.fn(async () => {});
      vi.mocked(streamText).mockImplementation(options => {
        signal = options.abortSignal;
        return { stream: { [Symbol.asyncIterator]: () => ({
          next: () => new Promise(() => {}), return: async () => ({ done: true, value: undefined }),
        }) } } as unknown as ReturnType<typeof streamText>;
      });
      const response = await handleAIGatewayRequest(request(), { ...environment,
        recordUsage: record => { records.push(record); }, waitUntil: task => { tasks.push(task); },
        resourceStore: { acquire: async () => ({ admitted: true, release }) } });
      expect(release).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(signal?.aborted).toBe(true);
      expect(release).toHaveBeenCalledOnce();
      await response.body!.cancel();
      expect(release).toHaveBeenCalledOnce();
      await Promise.all(tasks);
      expect(records).toHaveLength(1);
      // Backpressure allows one idle comment to queue without a consumer.
      expect(records[0]).toMatchObject({ outcome: 'timeout', outputBytes: 13 });
    } finally { vi.useRealTimers(); }
  });
  it('observes failed cleanup without exposing it or breaking completed output', async () => {
    const tasks: Promise<void>[] = [];
    const release = vi.fn(async () => { throw new Error('private database failure'); });
    vi.mocked(streamText).mockImplementation(() => ({ stream: (async function* () {
      yield { type: 'text-delta', id: 'text', text: 'valid output' };
    })() } as unknown as ReturnType<typeof streamText>));
    const response = await handleAIGatewayRequest(request(), { ...environment, waitUntil: task => { tasks.push(task); },
      resourceStore: { acquire: async () => ({ admitted: true, release }) } });
    const body = await response.text(); await Promise.all(tasks);
    expect(body).toContain('valid output'); expect(body).not.toContain('private database failure');
    expect(release).toHaveBeenCalledOnce();
  });
  it.each([undefined, '1024', '65536'])('passes only server-owned output limits to generation: %s', async limit => {
    vi.mocked(streamText).mockClear();
    vi.mocked(streamText).mockImplementation(() => ({ stream: (async function* () {
      yield { type: 'text-delta', id: 'text', text: 'synthetic response' };
    })() } as unknown as ReturnType<typeof streamText>));
    const response = await handleAIGatewayRequest(request(), { ...environment, maxOutputTokens: limit });
    expect(response.status).toBe(200);
    expect(vi.mocked(streamText).mock.calls[0][0].maxOutputTokens).toBe(limit === undefined ? 16384 : Number(limit));
    expect(vi.mocked(streamText).mock.calls[0][0].onError).toBeTypeOf('function');
    await response.text();
  });
  it.each(['', '0', '-1', '1.5', 'NaN', '65537', ' 1024', '1e3'])('rejects invalid server limits before generation: %s', async limit => {
    vi.mocked(streamText).mockClear();
    const response = await handleAIGatewayRequest(request(), { ...environment, maxOutputTokens: limit });
    expect(response.status).toBe(503);
    expect(streamText).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('synthetic-key');
  });
  it.each(['reader', 'request'] as const)('aborts upstream when the %s is cancelled', async source => {
    let observedSignal: AbortSignal | undefined;
    const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
    vi.mocked(streamText).mockImplementation(options => {
      observedSignal = options.abortSignal;
      return { stream: { [Symbol.asyncIterator]: () => ({
        next: () => new Promise((_, reject) => {
          if (options.abortSignal?.aborted) reject(new DOMException('Aborted', 'AbortError'));
          else options.abortSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }), return: returned,
      }) } } as unknown as ReturnType<typeof streamText>;
    });
    const controller = new AbortController();
    const release = vi.fn(async () => {});
    const response = await handleAIGatewayRequest(request(controller.signal), { ...environment,
      resourceStore: { acquire: async () => ({ admitted: true, release }) } });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const pending = reader.read();
    expect(observedSignal?.aborted).toBe(false);
    if (source === 'reader') await reader.cancel();
    else controller.abort();
    expect(observedSignal?.aborted).toBe(true);
    await pending;
    await reader.cancel();
    expect(returned).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  });
});
