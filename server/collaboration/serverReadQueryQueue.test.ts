// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { createCollaborationServer } from './server.js';

const diagram = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const origin = 'http://localhost:5417';
const disposals: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of disposals.splice(0).reverse()) await close(); });
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
async function connect(url: string, token: string) {
  const socket = new WebSocket(`${url}/vizly-room-${diagram}?token=${token}`, { origin });
  disposals.push(() => socket.terminate());
  const kinds: number[] = [];
  socket.on('message', data => { kinds.push(new Uint8Array(data as Buffer)[0]); });
  await vi.waitFor(() => expect(kinds).toContain(0));
  kinds.length = 0;
  return { socket, kinds };
}
it('isolates a stalled reader while preserving per-connection fresh revocation checks', async () => {
  const entered = deferred(), release = deferred();
  let blocked = false, revoked = false, slowChecks = 0;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Read query wrote data'); } },
    authorize: async token => {
      if (token === 'slow' && blocked) { slowChecks++; entered.resolve(); await release.promise; }
      return token === 'slow' && revoked ? null : { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen();
  const slow = await connect(url, 'slow'), fast = await connect(url, 'fast');
  try {
    blocked = true;
    slow.socket.send(Uint8Array.of(3));
    slow.socket.send(Uint8Array.of(3));
    await entered.promise;
    fast.socket.send(Uint8Array.of(3));
    await vi.waitFor(() => expect(fast.kinds).toEqual([1]));
    expect(slow.kinds).toEqual([]);
    expect(slowChecks).toBe(1);
    revoked = true;
    const closed = new Promise<number>(resolve => { slow.socket.once('close', resolve); });
    release.resolve();
    expect(await closed).toBe(1008);
    expect(slow.kinds).toEqual([]);
    fast.socket.send(Uint8Array.of(3));
    await vi.waitFor(() => expect(fast.kinds).toEqual([1, 1]));
  } finally { release.resolve(); }
});
it('keeps a later protocol operation behind its own pending query', async () => {
  const entered = deferred(), release = deferred();
  let blocked = false, first = true;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Read operation wrote data'); } },
    authorize: async token => {
      if (blocked && first) { first = false; entered.resolve(); await release.promise; }
      return { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen(), reader = await connect(url, 'reader');
  const doc = new Y.Doc();
  try {
    blocked = true;
    reader.socket.send(Uint8Array.of(3));
    await entered.promise;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); sync.writeSyncStep1(encoder, doc);
    reader.socket.send(encoding.toUint8Array(encoder));
    await new Promise(resolve => { setTimeout(resolve, 30); });
    expect(reader.kinds).toEqual([]);
    release.resolve();
    await vi.waitFor(() => expect(reader.kinds).toEqual([1, 0]));
  } finally { release.resolve(); doc.destroy(); }
});
it('waits for in-flight reader authorization during shutdown', async () => {
  const entered = deferred(), release = deferred();
  let blocked = false;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Read query wrote data'); } },
    authorize: async token => {
      if (blocked) { entered.resolve(); await release.promise; }
      return { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen(), reader = await connect(url, 'reader');
  try {
    blocked = true;
    reader.socket.send(Uint8Array.of(3));
    await entered.promise;
    let complete = false;
    const stopping = server.stop().then(() => { complete = true; });
    await new Promise(resolve => { setTimeout(resolve, 30); });
    expect(complete).toBe(false);
    release.resolve();
    await stopping;
    expect(complete).toBe(true);
    expect(reader.kinds).toEqual([]);
  } finally { release.resolve(); }
});
it('bounds concurrent read authorizations across connections', async () => {
  const release = deferred();
  let blocked = false, started = 0, active = 0, maximum = 0;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Read query wrote data'); } },
    authorize: async token => {
      if (blocked) {
        started++; maximum = Math.max(maximum, ++active);
        try { await release.promise; } finally { active--; }
      }
      return { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen();
  const peers: Array<Awaited<ReturnType<typeof connect>>> = [];
  for (let index = 0; index < 9; index++) peers.push(await connect(url, 'reader-' + index));
  try {
    blocked = true;
    for (const peer of peers) peer.socket.send(Uint8Array.of(3));
    await vi.waitFor(() => expect(started).toBe(8));
    await new Promise(resolve => { setTimeout(resolve, 30); });
    expect(started).toBe(8);
    release.resolve();
    await vi.waitFor(() => expect(peers.every(peer => peer.kinds.length === 1)).toBe(true));
    expect(started).toBe(9);
    expect(maximum).toBe(8);
  } finally { release.resolve(); }
});
