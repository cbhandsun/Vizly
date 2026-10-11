import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';

/** Short-lived deployment probe; never admits a collaboration room or document. */
export const createWebsocketCapabilityServer = (origins: ReadonlySet<string>, probeOrigin?: string) => {
  if (origins.size === 0 || [...origins].some(origin => {
    try { const url = new URL(origin); return url.origin !== origin || !['http:', 'https:'].includes(url.protocol); }
    catch { return true; }
  })) throw new Error('Invalid capability probe configuration');
  if (probeOrigin !== undefined) {
    let url: URL;
    try { url = new URL(probeOrigin); } catch { throw new Error('Invalid capability probe target'); }
    if (url.origin !== probeOrigin || url.username || url.password
      || !(url.protocol === 'https:' && /^vizly-collaboration-[a-z0-9-]+\.vercel\.app$/.test(url.hostname)
        || url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new Error('Invalid capability probe target');
  }
  const allowedOrigins = new Set(origins);
  const outbound = new Set<WebSocket>();
  let stopped = false;
  let stopping: Promise<void> | undefined;
  const http = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(stopped ? 503 : 200);
      response.end(JSON.stringify({ status: stopped ? 'stopping' : 'capability-only', collaborationReady: false }));
    } else if (request.method === 'GET' && request.url === '/self-check' && !stopped) {
      if (!probeOrigin || outbound.size >= 4) { response.writeHead(503); response.end('{"websocketUpgraded":false}'); return; }
      // Forward protection credentials only to this deployment's configured origin.
      // They never appear in logs, responses, URLs or persistent artifacts.
      const headers: Record<string, string> = {};
      for (const key of ['cookie', 'x-vercel-protection-bypass', 'x-vercel-trusted-oidc-idp-token']) {
        const value = request.headers[key];
        if (typeof value === 'string' && value.length <= 8192) headers[key] = value;
      }
      const ws = new WebSocket(probeOrigin.replace(/^http/, 'ws') + '/probe', {
        headers, origin: [...allowedOrigins][0], handshakeTimeout: 8000, maxPayload: 128,
      });
      outbound.add(ws);
      let upgraded = false; let matched = false; let finished = false;
      const finish = (code: number, rejectedStatus?: number) => {
        if (finished) return; finished = true; clearTimeout(timer); outbound.delete(ws); ws.terminate();
        if (response.destroyed) return;
        response.writeHead(upgraded && matched && code === 1000 ? 200 : 502);
        response.end(JSON.stringify({ websocketUpgraded: upgraded, receiptMatched: matched, closeCode: code,
          ...(rejectedStatus === undefined ? {} : { upgradeStatus: rejectedStatus }), collaborationReady: false }));
      };
      const timer = setTimeout(() => finish(1006), 10_000); timer.unref();
      response.once('close', () => finish(1006));
      ws.once('open', () => { upgraded = true; });
      ws.on('message', data => { matched = data.toString() === JSON.stringify({ status: 'websocket-upgraded', collaborationReady: false }); });
      ws.once('unexpected-response', (_request, rejected) => { rejected.resume(); finish(1006, rejected.statusCode); });
      ws.on('error', () => finish(1006)); ws.once('close', code => finish(code));
    } else { response.writeHead(404); response.end('{}'); }
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 128, perMessageDeflate: false });
  http.on('upgrade', (request, socket, head) => {
    if (stopped || request.method !== 'GET' || request.url !== '/probe'
      || !request.headers.origin || !allowedOrigins.has(request.headers.origin) || sockets.clients.size >= 8) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    sockets.handleUpgrade(request, socket, head, ws => {
      const timer = setTimeout(() => ws.terminate(), 3000); timer.unref();
      ws.once('close', () => clearTimeout(timer));
      ws.on('error', () => ws.terminate());
      ws.on('message', () => ws.close(1008, 'Probe accepts no input'));
      ws.send(JSON.stringify({ status: 'websocket-upgraded', collaborationReady: false }), error => {
        if (error) ws.terminate(); else ws.close(1000, 'Probe complete');
      });
    });
  });
  return { http,
    stop() {
      if (stopping) return stopping;
      stopped = true;
      stopping = Promise.resolve().then(async () => {
        for (const socket of sockets.clients) socket.terminate();
        for (const socket of outbound) socket.terminate();
        await new Promise<void>((resolve, reject) => sockets.close(error => error ? reject(new Error('Probe shutdown failed')) : resolve()));
        if (http.listening) await new Promise<void>((resolve, reject) => http.close(error => error ? reject(new Error('Probe shutdown failed')) : resolve()));
      });
      return stopping;
    },
  };
};
