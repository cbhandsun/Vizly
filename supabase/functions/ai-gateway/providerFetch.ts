/** Explicitly release a provider body when the SDK's fetch signal aborts. */
export const gatewayProviderFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (!response.body) return response;
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const reader = response.body.getReader();
  let closed = false;
  let abort: () => void;
  const cleanup = () => signal?.removeEventListener('abort', abort);
  const cancelReader = () => {
    try { void reader.cancel().catch(() => undefined); } catch { /* Cleanup cannot disclose provider errors. */ }
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        if (closed) return;
        closed = true;
        cleanup();
        controller.error(new DOMException('Provider request aborted', 'AbortError'));
        cancelReader();
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    },
    async pull(controller) {
      if (closed) return;
      try {
        const next = await reader.read();
        if (closed) return;
        if (next.done) {
          closed = true;
          cleanup();
          controller.close();
        } else controller.enqueue(next.value);
      } catch {
        if (closed) return;
        closed = true;
        cleanup();
        controller.error(new Error('Provider response unavailable'));
        cancelReader();
      }
    },
    cancel() {
      if (closed) return;
      closed = true;
      cleanup();
      cancelReader();
    },
  }, { highWaterMark: 1 });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
};
