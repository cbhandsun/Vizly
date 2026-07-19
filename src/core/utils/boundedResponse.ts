const MAX_TIMEOUT_MS = 5 * 60_000;
const MAX_RESPONSE_CHARS = 10 * 1024 * 1024;

export class ResponseTooLargeError extends Error {
  constructor(public readonly maxChars: number) {
    super(`Response exceeded ${maxChars} characters`);
    this.name = 'ResponseTooLargeError';
  }
}

export class RequestTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'RequestTimeoutError';
  }
}

const requireBoundedInteger = (value: number, max: number, label: string): number => {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${label} must be an integer between 1 and ${max}.`);
  }
  return value;
};

export const readResponseTextWithLimit = async (
  response: Response,
  maxChars: number,
): Promise<string> => {
  const limit = requireBoundedInteger(maxChars, MAX_RESPONSE_CHARS, 'maxChars');
  const contentLength = Number(response.headers.get('Content-Length') || '0');
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new ResponseTooLargeError(limit);
  }

  if (!response.body) {
    const text = await response.text();
    if (text.length > limit) throw new ResponseTooLargeError(limit);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > limit) throw new ResponseTooLargeError(limit);
    }
    text += decoder.decode();
    if (text.length > limit) throw new ResponseTooLargeError(limit);
    return text;
  } finally {
    reader.releaseLock();
  }
};

export const readResponseJsonWithLimit = async (
  response: Response,
  maxChars: number,
): Promise<unknown> => {
  const text = await readResponseTextWithLimit(response, maxChars);
  try {
    return JSON.parse(text.trim() || 'null');
  } catch {
    throw new Error('Response body is not valid JSON.');
  }
};

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
}

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  { timeoutMs, fetchImplementation = fetch, signal, ...init }: FetchWithTimeoutOptions,
): Promise<Response> => {
  const boundedTimeout = requireBoundedInteger(timeoutMs, MAX_TIMEOUT_MS, 'timeoutMs');
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, boundedTimeout);

  try {
    return await fetchImplementation(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(boundedTimeout);
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
};
