import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAIGatewayRequest } from '../functions/ai-gateway/handler';
import type { GatewayUsageRecord } from '../functions/ai-gateway/usageRecord';
import { createGatewayResourceStore } from '../functions/ai-gateway/resourceStore';

// Real installed AI SDK and provider adapter. Only the HTTP transport and
// authenticated resource backend are controlled; no streamText/model mocks.
const request = () => new Request('https://gateway.invalid', {
  method: 'POST', headers: { Authorization: 'Bearer synthetic-session-token', 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: { id: 'custom', baseUrl: 'https://provider.invalid/v1', apiKey: 'private-key' },
    model: 'private-model', messages: [{ role: 'user', content: 'private-prompt' }] }),
});
const fixture = () => {
  const records: Readonly<GatewayUsageRecord>[] = [], tasks: Promise<void>[] = [];
  const release = vi.fn(async () => {});
  return { records, tasks, release, environment: {
    allowedProviderOrigins: 'https://provider.invalid',
    authenticateUser: async () => ({ ok: true as const, userId: 'verified-private-user' }),
    resourceStore: { acquire: async () => ({ admitted: true as const, release }) },
    recordUsage: (record: Readonly<GatewayUsageRecord>) => { records.push(record); },
    waitUntil: (task: Promise<void>) => { tasks.push(task); },
  } };
};
const frame = (delta: object, finish: string | null = null, usage?: object) => `data: ${JSON.stringify({
  id: 'synthetic', object: 'chat.completion.chunk', created: 1, model: 'private-model',
  choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}),
})}\n\n`;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('gateway installed SDK integration', () => {
  it('sends website system instructions and diagram tools through the actual SDK to the provider', async () => {
    const state = fixture();
    const transport = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.messages[0]).toMatchObject({ role: 'system', content: expect.stringContaining('website system instructions') });
      expect(payload.messages[0].content).toContain('原子化画布操作必须调用对应工具');
      expect(payload.messages[1]).toEqual({ role: 'system', content: 'additional instructions' });
      expect(payload.messages[2]).toEqual({ role: 'user', content: 'private-prompt' });
      expect(payload.tools.some((entry: { function?: { name?: string } }) => entry.function?.name === 'addNode')).toBe(true);
      return new Response(frame({ content: 'diagram tools ready' }) + frame({}, 'stop') + 'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', transport);
    const original = request();
    const body = await original.json();
    const response = await handleAIGatewayRequest(new Request(original.url, {
      method: 'POST', headers: original.headers, body: JSON.stringify({ ...body, toolMode: 'diagram',
        messages: [{ role: 'system', content: 'website system instructions' },
          { role: 'system', content: 'additional instructions' }, ...body.messages] }),
    }), state.environment);
    const output = await response.text(); await Promise.all(state.tasks);
    expect(output).toContain('diagram tools ready');
    expect(output).toContain('[DONE]');
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each(['allowed', 'denied'] as const)('connects real SDK generation to the resource HTTP adapter: %s', async admission => {
    const state = fixture();
    const userId = '11111111-1111-4111-8111-111111111111';
    const rpcCalls: { path: string; body: Record<string, unknown> }[] = [];
    const rpcTransport: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      rpcCalls.push({ path, body });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer private-backend-key');
      expect(body.p_user_id).toBe(userId);
      if (path.endsWith('vizly_release_ai_lease')) {
        expect(body).toEqual(rpcCalls[0].body);
        expect(init?.signal?.aborted).toBe(false);
        return Response.json(true);
      }
      return Response.json(admission === 'denied'
        ? { admitted: false, reason: 'concurrency', retry_after_seconds: 30 }
        : { admitted: true, lease_id: body.p_lease_id, expires_at: new Date(Date.now() + 150_000).toISOString() });
    };
    const providerTransport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://provider.invalid/v1/chat/completions');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer private-key');
      expect(JSON.parse(String(init?.body)).max_tokens).toBe(16384);
      expect(String(init?.body)).not.toContain('private-backend-key');
      return new Response(frame({ content: 'valid output' }) + frame({}, 'stop') + 'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', providerTransport);
    const response = await handleAIGatewayRequest(request(), { ...state.environment,
      authenticateUser: async () => ({ ok: true, userId }),
      resourceStore: createGatewayResourceStore('https://resource.invalid', 'private-backend-key', rpcTransport),
    });
    const body = await response.text(); await Promise.all(state.tasks);
    expect(state.records).toHaveLength(1);
    expect(JSON.stringify(state.records)).not.toMatch(/private|11111111/);
    if (admission === 'allowed') {
      expect(response.status).toBe(200); expect(body).toContain('valid output');
      expect(providerTransport).toHaveBeenCalledOnce(); expect(rpcCalls).toHaveLength(2);
      expect(state.records[0]).toMatchObject({ outcome: 'completed', inputTokens: null, outputTokens: null });
    } else {
      expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('30');
      expect(providerTransport).not.toHaveBeenCalled(); expect(rpcCalls).toHaveLength(1);
      expect(state.records[0].outcome).toBe('limited');
    }
  });
  it('translates provider SSE and records final provider usage', async () => {
    const state = fixture();
    const transport = vi.fn(async () => new Response(
      frame({ role: 'assistant', content: 'private-output 图' })
      + frame({}, 'stop', { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 }) + 'data: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    ));
    vi.stubGlobal('fetch', transport);
    const response = await handleAIGatewayRequest(request(), state.environment);
    expect(response.status).toBe(200);
    const body = await response.text(); await Promise.all(state.tasks);
    expect(body).toContain('private-output 图'); expect(body).toContain('[DONE]');
    expect(transport).toHaveBeenCalledOnce(); expect(state.release).toHaveBeenCalledOnce();
    expect(state.records).toHaveLength(1);
    expect(state.records[0]).toMatchObject({ outcome: 'completed', inputTokens: 7, outputTokens: 4,
      outputBytes: new TextEncoder().encode(body).byteLength });
    expect(JSON.stringify(state.records)).not.toContain('private');
  });
  it('does not print raw provider HTTP errors or report successful generation', async () => {
    const state = fixture();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: {
      message: 'private-key private-prompt private-provider-body', type: 'invalid_request_error',
    } }), { status: 400, headers: { 'Content-Type': 'application/json' } })));
    const response = await handleAIGatewayRequest(request(), state.environment);
    const body = await response.text(); await Promise.all(state.tasks);
    expect(body).toContain('"type":"error"'); expect(body).not.toMatch(/private|DONE/);
    expect(errors).not.toHaveBeenCalled(); expect(state.release).toHaveBeenCalledOnce();
    expect(state.records).toHaveLength(1); expect(state.records[0].outcome).toBe('failed');
    expect(JSON.stringify(state.records)).not.toContain('private');
  });
  it('aborts the SDK HTTP signal after downstream cancellation', async () => {
    const state = fixture();
    let upstreamSignal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      upstreamSignal = init?.signal;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new TextEncoder().encode(frame({ content: 'initial' })));
        upstreamSignal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    }));
    const response = await handleAIGatewayRequest(request(), state.environment);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('initial');
    await reader.cancel(); await Promise.all(state.tasks);
    expect(upstreamSignal?.aborted).toBe(true); expect(state.release).toHaveBeenCalledOnce();
    expect(state.records).toHaveLength(1);
    expect(state.records[0]).toMatchObject({ outcome: 'cancelled', inputTokens: null, outputTokens: null });
  });
});
