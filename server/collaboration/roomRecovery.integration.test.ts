// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFilePersistence } from './persistence.js';
import { createRoomRecovery } from './roomRecovery.js';
import { createCollaborationServer } from './server.js';
import type { AuthorizeDiagram } from './authorization.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin = 'http://localhost:5419';
const checkpoint = { revision: '2026-10-09T02:04:07.212Z', base: new Uint8Array([0, 0]), state: new Uint8Array([0, 0]) };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const stop of cleanup.splice(0).reverse()) await stop(); });
const deferred = () => {
  let resolve: () => void = () => { throw new Error('Not initialized'); };
  const promise = new Promise<void>(accept => { resolve = accept; });
  return { promise, resolve };
};
const fixture = async (authorize?: AuthorizeDiagram, pause?: Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), 'vizly-recovery-integrated-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, `${id}.yjs`), checkpoint.state);
  const persistence = createFilePersistence(directory);
  const authorizeOwner: AuthorizeDiagram = async token => token === 'synthetic-owner' ? { userId, role: 'editor' } : null;
  const readCloud = vi.fn(async () => { await pause; return checkpoint; });
  const server = createCollaborationServer({ origins: new Set([origin]), persistence,
    authorize: authorize ?? authorizeOwner,
    recovery: { authorizeOwner, operations: createRoomRecovery({ authorizeOwner, persistence, readCloud, readRevision: async () => checkpoint.revision }) },
  });
  const address = await server.listen(); cleanup.push(() => server.stop());
  const request = (body?: string) => fetch(`${address.url.replace('ws:', 'http:')}/recovery/vizly-room-${id}`, {
    method: body ? 'POST' : 'GET', body,
    headers: { Origin: origin, Authorization: 'Bearer synthetic-owner', ...(body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const socket = () => {
    const ws = new WebSocket(`${address.url}/vizly-room-${id}?token=synthetic-owner`, { origin });
    cleanup.push(async () => { if (ws.readyState !== WebSocket.CLOSED) ws.terminate(); });
    ws.on('error', () => undefined);
    return ws;
  };
  return { directory, persistence, server, request, socket, readCloud };
};
describe('exclusive recovery and WebSocket admission', () => {
  it('refuses recovery while a peer is active, then allows inspection after room disposal', async () => {
    const f = await fixture(); const ws = f.socket();
    await new Promise<void>(resolve => ws.once('open', resolve));
    expect((await f.request()).status).toBe(409); expect(f.readCloud).not.toHaveBeenCalled();
    await new Promise<void>(resolve => { ws.once('close', () => resolve()); ws.close(); });
    await vi.waitFor(async () => expect((await f.request()).status).toBe(200));
  });
  it('reserves a room before slow WebSocket authorization so recovery cannot overtake admission', async () => {
    const gate = deferred();
    const authorize = vi.fn(async () => { await gate.promise; return { userId, role: 'editor' as const }; });
    const f = await fixture(authorize); const ws = f.socket();
    await vi.waitFor(() => expect(authorize).toHaveBeenCalled());
    try { expect((await f.request()).status).toBe(409); expect(f.readCloud).not.toHaveBeenCalled(); }
    finally { gate.resolve(); }
    await new Promise<void>(resolve => ws.readyState === WebSocket.OPEN ? resolve() : ws.once('open', resolve));
  });
  it('blocks admission throughout asynchronous recovery preparation and releases it afterwards', async () => {
    const gate = deferred(); const f = await fixture(undefined, gate.promise); const inspecting = f.request();
    await vi.waitFor(() => expect(f.readCloud).toHaveBeenCalled());
    const ws = f.socket();
    const status = await new Promise<number>(resolve => ws.once('unexpected-response', (_request, response) => { response.resume(); resolve(response.statusCode ?? 0); }));
    expect(status).toBe(403);
    gate.resolve(); expect((await inspecting).status).toBe(200);
    const next = f.socket(); await new Promise<void>(resolve => next.once('open', resolve));
  });
  it('cancels a prepared recovery at shutdown without replacing the prior file', async () => {
    const gate = deferred(); const f = await fixture(undefined, gate.promise);
    const original = await readFile(join(f.directory, `${id}.yjs`));
    const plan = await f.persistence.inspectRecovery(id);
    const applying = f.request(JSON.stringify({ sha256: plan?.sha256, revision: checkpoint.revision })).catch(() => null);
    await vi.waitFor(() => expect(f.readCloud).toHaveBeenCalled());
    const stopping = f.server.stop(); gate.resolve(); await stopping; await applying;
    expect(await readFile(join(f.directory, `${id}.yjs`))).toEqual(original);
    expect((await f.persistence.loadRecord(id))?.checkpoint).toBeNull();
  });
});
