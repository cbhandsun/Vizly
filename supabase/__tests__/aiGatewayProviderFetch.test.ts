import { afterEach, describe, expect, it, vi } from 'vitest';
import { gatewayProviderFetch } from '../functions/ai-gateway/providerFetch';

afterEach(() => vi.unstubAllGlobals());

describe('gateway provider response cleanup', () => {
  it('closes a silent upstream body on abort even if native fetch ignores the signal', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }))));
    const controller = new AbortController();
    const response = await gatewayProviderFetch('https://provider.invalid', { signal: controller.signal });
    const read = response.body!.getReader().read();
    const rejected = expect(read).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('propagates downstream cancellation to the upstream reader once', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }))));
    const controller = new AbortController();
    const response = await gatewayProviderFetch('https://provider.invalid', { signal: controller.signal });
    await response.body!.cancel();
    controller.abort();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('preserves normal response content and metadata without cancelling completed work', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(stream) { stream.enqueue(new TextEncoder().encode('payload')); stream.close(); }, cancel,
    }), { status: 201, headers: { 'Content-Type': 'text/event-stream' } })));
    const response = await gatewayProviderFetch('https://provider.invalid', { signal: controller.signal });
    expect(response.status).toBe(201);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(await response.text()).toBe('payload');
    controller.abort();
    expect(cancel).not.toHaveBeenCalled();
  });
});
