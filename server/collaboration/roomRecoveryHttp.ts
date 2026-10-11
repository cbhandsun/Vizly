import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthorizeDiagram } from './authorization.js';
import { RecoveryRejectedError, type createRoomRecovery } from './roomRecovery.js';

const route = /^\/recovery\/vizly-room-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > 1024)) throw new RecoveryRejectedError(400);
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new RecoveryRejectedError(400);
  const parts: Buffer[] = [];
  let size = 0;
  for await (const input of request) {
    const chunk: unknown = input;
    if (!(chunk instanceof Uint8Array)) throw new RecoveryRejectedError(400);
    size += chunk.byteLength;
    if (size > 1024) throw new RecoveryRejectedError(400);
    parts.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown; }
  catch { throw new RecoveryRejectedError(400); }
};

export const createRoomRecoveryHttp = (options: {
  origins: ReadonlySet<string>;
  authorizeOwner: AuthorizeDiagram;
  operations: ReturnType<typeof createRoomRecovery>;
  reserveIdleRoom: (id: string) => (() => void) | null;
}) => {
  let pending = 0;
  let stopped = false;
  const controllers = new Set<AbortController>();
  const idleWaiters = new Set<() => void>();
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const match = route.exec(request.url ?? '');
    const origin = request.headers.origin;
    const reply = (status: number, value: unknown) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(status >= 400 ? { Connection: 'close' } : {}),
        ...(typeof origin === 'string' && options.origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) });
      response.end(JSON.stringify(value));
    };
    if (!match) { reply(404, { status: 'unavailable' }); return; }
    if (typeof origin !== 'string' || !options.origins.has(origin)) { reply(403, { status: 'rejected' }); return; }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Cache-Control': 'no-store' });
      response.end(); return;
    }
    const bearer = request.headers.authorization;
    if (!['GET', 'POST'].includes(request.method ?? '') || typeof bearer !== 'string'
      || !/^Bearer \S{1,4096}$/.test(bearer)
      || [...bearer.slice(7)].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) { reply(403, { status: 'rejected' }); return; }
    if (stopped || pending >= 16) { reply(503, { status: 'unavailable' }); return; }
    pending++;
    let release: (() => void) | null = null;
    const controller = new AbortController();
    controllers.add(controller);
    const abortRequest = () => request.destroy();
    controller.signal.addEventListener('abort', abortRequest, { once: true });
    const disconnected = () => { if (!response.writableEnded) controller.abort(); };
    response.once('close', disconnected);
    const deadline = setTimeout(() => { controller.abort(); request.destroy(); }, 20_000);
    deadline.unref();
    try {
      const diagramId = match[1].toLowerCase();
      const token = bearer.slice(7);
      const permission = await options.authorizeOwner(token, diagramId);
      controller.signal.throwIfAborted();
      if (!permission || permission.role !== 'editor') throw new RecoveryRejectedError(403);
      if (request.destroyed && !request.complete) throw new Error('Recovery request unavailable');
      release = options.reserveIdleRoom(diagramId);
      if (!release) throw new RecoveryRejectedError(409);
      const identity = { diagramId, token, userId: permission.userId };
      const result = request.method === 'GET' ? await options.operations.inspect(identity, controller.signal)
        : await options.operations.recover(identity, await readBody(request), controller.signal);
      reply(200, result);
    } catch (error: unknown) {
      reply(error instanceof RecoveryRejectedError ? error.status : 503,
        { status: error instanceof RecoveryRejectedError ? 'rejected' : 'unavailable' });
    } finally {
      clearTimeout(deadline); response.off('close', disconnected); controller.signal.removeEventListener('abort', abortRequest); controllers.delete(controller);
      release?.(); pending--;
      if (pending === 0) { for (const notify of idleWaiters) notify(); idleWaiters.clear(); }
    }
  };
  return Object.assign(handle, { async stop() {
    stopped = true;
    for (const controller of controllers) controller.abort();
    if (pending > 0) await new Promise<void>(resolve => idleWaiters.add(resolve));
  } });
};
