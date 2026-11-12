import type { IncomingMessage, ServerResponse } from 'node:http';
import { projectTelemetryPayload, type AcceptedTelemetry } from './telemetryPayload.js';
export interface TelemetryReceiverOptions {
  origins: ReadonlySet<string>;
  accept: (batch: AcceptedTelemetry, signal: AbortSignal) => Promise<void>;
}
/** Public diagnostics are untrusted signals, never authorization or billing evidence. */
export function createTelemetryHttp({ origins, accept }: TelemetryReceiverOptions) {
  let inflight = 0, requests = 0, windowStarted = Date.now();
  let circuitOpen = false;
  return async (request: IncomingMessage, response: ServerResponse) => {
    const reply = (status: number) => {
      if (!response.destroyed && !response.headersSent) {
        response.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Length': '0' }); response.end();
      }
    };
    if (request.method !== 'POST') { reply(405); return; }
    if (!request.headers.origin || !origins.has(request.headers.origin)) { reply(403); return; }
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') { reply(415); return; }
    if (Date.now() - windowStarted >= 60_000) { windowStarted = Date.now(); requests = 0; }
    if (circuitOpen) { reply(503); return; }
    if (inflight >= 8 || requests >= 240) { reply(429); return; }
    requests++; inflight++;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let accepting = false;
    const expired = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        if (accepting) circuitOpen = true;
        controller.abort(); reply(408); request.destroy(); reject(Error('Telemetry timeout'));
      }, 5_000);
    });
    try {
      await Promise.race([expired, (async () => {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 32_768) { reply(413); request.destroy(); return; }
          chunks.push(Buffer.from(chunk));
        }
        if (controller.signal.aborted) return;
        let batch: AcceptedTelemetry;
        try { batch = projectTelemetryPayload(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reply(400); return; }
        accepting = true;
        await accept(batch, controller.signal);
        reply(202);
      })()]);
    } catch { reply(503); }
    finally { if (timeout !== undefined) clearTimeout(timeout); controller.abort(); inflight--; }
  };
}
