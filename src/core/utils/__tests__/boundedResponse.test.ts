// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  fetchWithTimeout,
  readResponseJsonWithLimit,
  readResponseTextWithLimit,
  RequestTimeoutError,
  ResponseTooLargeError,
} from '../boundedResponse';

describe('boundedResponse', () => {
  it('reads bounded text and JSON responses', async () => {
    await expect(readResponseTextWithLimit(new Response('hello'), 10)).resolves.toBe('hello');
    await expect(readResponseJsonWithLimit(new Response('{"ok":true}'), 32)).resolves.toEqual({ ok: true });
    await expect(readResponseJsonWithLimit(new Response('{bad'), 32)).rejects.toThrow('not valid JSON');
  });

  it('rejects declared and streamed oversized responses', async () => {
    const declared = new Response('small', { headers: { 'Content-Length': '100' } });
    await expect(readResponseTextWithLimit(declared, 10)).rejects.toBeInstanceOf(ResponseTooLargeError);
    await expect(readResponseTextWithLimit(new Response('x'.repeat(20)), 10)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('enforces timeouts and forwards caller cancellation', async () => {
    const pendingFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError')));
    }));

    await expect(fetchWithTimeout('https://example.test', {
      timeoutMs: 5,
      fetchImplementation: pendingFetch as typeof fetch,
    })).rejects.toBeInstanceOf(RequestTimeoutError);

    const controller = new AbortController();
    const request = fetchWithTimeout('https://example.test', {
      timeoutMs: 1000,
      signal: controller.signal,
      fetchImplementation: pendingFetch as typeof fetch,
    });
    controller.abort(new Error('caller cancelled'));
    await expect(request).rejects.toThrow('caller cancelled');
  });
});
