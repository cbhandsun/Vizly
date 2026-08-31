import { setTimeout as delay } from 'node:timers/promises';

const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_DIAGNOSTIC_BYTES = 8 * 1024 * 1024;
const ERROR_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOMEM', 'EMFILE', 'ENFILE']);
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EADDRNOTAVAIL']);
const SIGNALS = new Set(['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGINT']);
const OUTPUT_MARKERS = [
  ['devtools-listening', /DevTools listening on/],
  ['profile-lock', /ProcessSingleton|SingletonLock|profile.*(?:in use|locked)/i],
  ['bind-failure', /bind\(\).*failed|address already in use|ERR_ADDRESS_IN_USE/i],
  ['sandbox-failure', /No usable sandbox|sandbox.*initialization failed/i],
];

const readBoundedJson = async (response) => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid-response');
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('oversized-response');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    // Cancellation also releases a response rejected at the size boundary.
    await reader.cancel();
    reader.releaseLock();
  }
};

const parseBrowserVersion = (value, port) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rawUrl = value.webSocketDebuggerUrl;
  if (typeof rawUrl !== 'string' || rawUrl.length > 512) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1'
      || Number(url.port || 80) !== port || url.username || url.password
      || url.search || url.hash
      || !/^\/devtools\/browser\/[A-Za-z0-9-]{1,128}$/.test(url.pathname)) return null;
    return { webSocketDebuggerUrl: url.href };
  } catch {
    return null;
  }
};

/** Same 15s startup budget, including hanging HTTP/body reads and child failure.
 * Diagnostics contain only counters, allowlisted codes and markers, never output,
 * request URLs, profiles, environment variables or raw child error messages.
 */
export const waitForBrowserDevTools = async (
  browser,
  port,
  { timeoutMs = 15_000, fetchEndpoint = fetch } = {},
) => {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid browser DevTools port');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) {
    throw new Error('Invalid browser startup timeout');
  }
  const controller = new AbortController();
  const { signal } = controller;
  const startedAt = Date.now();
  let attempts = 0;
  let lastProbe = 'not-started';
  let status = null;
  let probeErrorCode = null;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stderrTail = '';
  const markers = new Set();
  const onStdout = (chunk) => {
    stdoutBytes = Math.min(MAX_DIAGNOSTIC_BYTES, stdoutBytes + chunk.length);
  };
  const onStderr = (chunk) => {
    stderrBytes = Math.min(MAX_DIAGNOSTIC_BYTES, stderrBytes + chunk.length);
    const tail = Buffer.isBuffer(chunk) ? chunk.subarray(-2048).toString('utf8') : '';
    stderrTail = (stderrTail + tail).slice(-4096);
    for (const [name, pattern] of OUTPUT_MARKERS) {
      if (pattern.test(stderrTail)) markers.add(name);
    }
  };
  const failure = (reason, code = null) => new Error(
    `Browser DevTools startup failed: ${JSON.stringify({
      reason,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      attempts,
      lastProbe,
      httpStatus: status,
      probeErrorCode,
      processSpawned: Number.isSafeInteger(browser.pid) && browser.pid > 0,
      exitCode: Number.isSafeInteger(browser.exitCode) ? browser.exitCode : null,
      signal: SIGNALS.has(browser.signalCode) ? browser.signalCode : null,
      errorCode: ERROR_CODES.has(code) ? code : code === null ? null : 'OTHER',
      stdoutBytes,
      stderrBytes,
      outputMarkers: [...markers].sort(),
    })}`,
  );
  let rejectStartup;
  let timeoutId;
  const interrupted = new Promise((_, reject) => { rejectStartup = reject; });
  const interrupt = (reason, code) => {
    rejectStartup(failure(reason, code));
    controller.abort();
  };
  const onExit = () => interrupt('process-exited');
  const onError = error => interrupt('spawn-error', error?.code);
  const poll = async () => {
    while (!signal.aborted) {
      attempts += 1;
      lastProbe = 'request-pending';
      status = null;
      probeErrorCode = null;
      try {
        const response = await fetchEndpoint(`http://127.0.0.1:${port}/json/version`, {
          signal,
          redirect: 'error',
        });
        if (signal.aborted) return null;
        status = Number.isInteger(response.status) ? response.status : null;
        if (response.ok) {
          lastProbe = 'body-pending';
          const parsed = parseBrowserVersion(await readBoundedJson(response), port);
          if (signal.aborted) return null;
          if (parsed) return parsed;
          lastProbe = 'invalid-response';
        } else {
          lastProbe = 'http-error';
          await response.body?.cancel();
        }
      } catch (error) {
        if (signal.aborted) return null;
        const code = error?.cause?.code ?? error?.code;
        probeErrorCode = NETWORK_CODES.has(code) ? code : 'OTHER';
        lastProbe = lastProbe === 'body-pending' ? 'invalid-response' : 'request-failed';
      }
      try {
        await delay(150, undefined, { signal });
      } catch {
        // Only our startup deadline/child failure aborts this polling delay.
        return null;
      }
    }
    return null;
  };
  browser.on('exit', onExit);
  browser.on('error', onError);
  browser.stdout?.on('data', onStdout);
  browser.stderr?.on('data', onStderr);
  try {
    timeoutId = setTimeout(() => interrupt('deadline'), timeoutMs);
    if (browser.exitCode != null || browser.signalCode != null) onExit();
    return await Promise.race([interrupted, poll()]);
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
    browser.off('exit', onExit);
    browser.off('error', onError);
    browser.stdout?.off('data', onStdout);
    browser.stderr?.off('data', onStderr);
    stderrTail = '';
  }
};
