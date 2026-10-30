// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { createCollaborationServer, type CollaborationServerOptions } from './server.js';
import type { DiagramPermission } from './authorization.js';
import { publishCollaborationElement } from './documentModel.js';

const diagram = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const origin = 'http://localhost';
const cleanup: Array<() => void | Promise<void>> = [];
const releaseLoads: Array<() => void> = [];
afterEach(async () => {
  for (const release of releaseLoads.splice(0)) release();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

const heldLoad = () => {
  let entered = false;
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  releaseLoads.push(release);
  return { get entered() { return entered; }, release,
    load: async () => { entered = true; await gate; return null; } };
};
const start = async (authorize: CollaborationServerOptions['authorize'], load: () => Promise<null> = async () => null) => {
  const save = vi.fn(async () => undefined);
  const server = createCollaborationServer({ authorize, origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load, save } });
  const { url } = await server.listen();
  cleanup.push(() => server.stop());
  return { url, save };
};
const connect = (url: string) => {
  const socket = new WebSocket(`${url}/vizly-room-${diagram}?token=synthetic-actor`, { origin });
  cleanup.push(() => socket.terminate());
  const frames: Array<{ kind: number; access?: string }> = [];
  const errors: Error[] = [];
  let closeCode: number | undefined;
  socket.on('message', data => {
    const decoder = decoding.createDecoder(new Uint8Array(data as Buffer));
    const kind = decoding.readVarUint(decoder);
    frames.push({ kind, ...(kind === 4 ? { access: decoding.readVarString(decoder) } : {}) });
  });
  socket.on('error', error => errors.push(error));
  socket.on('close', code => { closeCode = code; });
  return { socket, frames, errors, get closeCode() { return closeCode; } };
};

describe('fresh authorization after asynchronous collaboration room loading', () => {
  it('advertises only the downgraded role and refuses a write after loading completes', async () => {
    let permission: DiagramPermission = { userId: 'verified-actor', role: 'editor' };
    const load = heldLoad();
    const runtime = await start(vi.fn(async () => permission), load.load);
    const peer = connect(runtime.url);
    await vi.waitFor(() => expect(load.entered).toBe(true), { timeout: 5000 });
    permission = { userId: 'verified-actor', role: 'viewer' };
    load.release();
    await vi.waitFor(() => expect(peer.frames.some(frame => frame.kind === 0)).toBe(true), { timeout: 5000 });
    expect(peer.errors).toEqual([]);
    const access = peer.frames.filter(frame => frame.kind === 4).map(frame => frame.access);
    expect(access.length).toBeGreaterThan(0);
    expect(access.every(value => value === 'viewer:fields-v1')).toBe(true);
    const doc = new Y.Doc();
    try {
      publishCollaborationElement(doc.getMap('flowchart-nodes'), 'forbidden', {
        id: 'forbidden', position: { x: 0, y: 0 }, data: { label: 'Forbidden write' },
      });
      const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 0);
      sync.writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
      peer.socket.send(encoding.toUint8Array(encoder));
      await vi.waitFor(() => expect(peer.closeCode).toBe(1008), { timeout: 5000 });
      expect(runtime.save).not.toHaveBeenCalled();
    } finally { doc.destroy(); }
  });

  it.each(['revoked', 'identity-replaced'] as const)('sends no initial document when access is %s during loading', async change => {
    let permission: DiagramPermission | null = { userId: 'verified-actor', role: 'editor' };
    const load = heldLoad();
    const runtime = await start(vi.fn(async () => permission), load.load);
    const peer = connect(runtime.url);
    await vi.waitFor(() => expect(load.entered).toBe(true), { timeout: 5000 });
    permission = change === 'revoked' ? null : { userId: 'different-actor', role: 'editor' };
    load.release();
    await vi.waitFor(() => expect(peer.closeCode).toBe(1008), { timeout: 5000 });
    expect(peer.frames).toEqual([]);
    expect(peer.errors).toEqual([]);
    expect(runtime.save).not.toHaveBeenCalled();
  });

  it('shares one fresh check for the initial replies and rechecks every later client request', async () => {
    let revoked = false;
    const authorize = vi.fn(async () => revoked ? null : { userId: 'verified-actor', role: 'editor' as const });
    const runtime = await start(authorize);
    const peer = connect(runtime.url);
    await vi.waitFor(() => expect(peer.frames.map(frame => frame.kind)).toEqual([4, 0]), { timeout: 5000 });
    expect(authorize).toHaveBeenCalledTimes(2);
    peer.socket.send(Uint8Array.of(3));
    await vi.waitFor(() => expect(peer.frames.map(frame => frame.kind)).toEqual([4, 0, 1]), { timeout: 5000 });
    expect(authorize).toHaveBeenCalledTimes(3);
    revoked = true;
    peer.socket.send(Uint8Array.of(3));
    await vi.waitFor(() => expect(peer.closeCode).toBe(1008), { timeout: 5000 });
    expect(authorize).toHaveBeenCalledTimes(4);
    expect(peer.frames.map(frame => frame.kind)).toEqual([4, 0, 1]);
    expect(peer.errors).toEqual([]);
    expect(runtime.save).not.toHaveBeenCalled();
  });
});
