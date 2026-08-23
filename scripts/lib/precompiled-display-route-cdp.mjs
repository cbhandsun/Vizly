import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

const findBrowserExecutable = () => {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    process.env.BROWSER_PATH,
    join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find(candidate => existsSync(candidate)) || null;
};

const findAvailablePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close();
    resolve(port);
  });
});

const waitForJson = async (url, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Browser startup is intentionally polled.
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const RETRYABLE_PROFILE_CLEANUP_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);

export const retryPrecompiledRouteBrowserProfileCleanup = async (
  remove,
  wait = delay,
  maxAttempts = 8,
) => {
  const attemptLimit = Number.isSafeInteger(maxAttempts)
    ? Math.max(1, Math.min(20, maxAttempts))
    : 8;
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    try {
      await remove();
      return;
    } catch (error) {
      const code = error && typeof error === 'object' && !Array.isArray(error)
        ? error.code
        : undefined;
      if (!RETRYABLE_PROFILE_CLEANUP_CODES.has(code) || attempt + 1 >= attemptLimit) {
        throw error;
      }
      await wait(Math.min(2_000, 150 * (attempt + 1)));
    }
  }
};

const waitForBrowserExit = async (browser, timeoutMs = 5_000) => {
  if (browser.exitCode != null || browser.signalCode != null) return;
  await Promise.race([
    new Promise(resolve => browser.once('exit', resolve)),
    delay(timeoutMs),
  ]);
};

class CdpPageSession {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.sequence = 0;
    this.pending = new Map();
    this.socket = null;
  }

  async open() {
    this.socket = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', raw => {
      const message = JSON.parse(String(raw));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    const rejectPending = (reason) => {
      const error = reason instanceof Error
        ? reason
        : new Error('CDP session closed before receiving a response');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
    this.socket.on('error', rejectPending);
    this.socket.on('close', (code, reason) => rejectPending(new Error(
      `CDP session closed before receiving a response (code ${code}${reason?.length ? `: ${String(reason)}` : ''})`,
    )));
  }

  send(method, params = {}) {
    if (!this.socket) return Promise.reject(new Error('CDP session is not open'));
    return new Promise((resolve, reject) => {
      const id = this.sequence += 1;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || 'Browser evaluation failed');
    }
    return response.result?.value;
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}

export const withPrecompiledRouteBrowser = async (run) => {
  const browserPath = findBrowserExecutable();
  if (!browserPath) throw new Error('Chrome or Edge was not found');
  const port = await findAvailablePort();
  const profile = await mkdtemp(join(tmpdir(), 'vizly-precompiled-routes-'));
  const browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: 'PUT',
    });
    if (!targetResponse.ok) throw new Error('Failed to create a browser target');
    const target = await targetResponse.json();
    const session = new CdpPageSession(target.webSocketDebuggerUrl);
    await session.open();
    try {
      await session.send('Page.enable');
      await session.send('Runtime.enable');
      return await run(session);
    } finally {
      session.close();
    }
  } finally {
    if (browser.exitCode == null) browser.kill();
    await waitForBrowserExit(browser);
    await retryPrecompiledRouteBrowserProfileCleanup(() => (
      rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    ));
  }
};
