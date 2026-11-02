// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
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
  const cursors = new Map<number, { cursor?: { x: number; y: number } } | null>();
  socket.on('message', data => {
    const decoder = decoding.createDecoder(new Uint8Array(data as Buffer));
    const kind = decoding.readVarUint(decoder); kinds.push(kind);
    if (kind === 1) {
      const body = decoding.createDecoder(decoding.readVarUint8Array(decoder));
      const count = decoding.readVarUint(body);
      for (let i = 0; i < count; i++) {
        const id = decoding.readVarUint(body); decoding.readVarUint(body);
        cursors.set(id, JSON.parse(decoding.readVarString(body)));
      }
    }
  });
  await vi.waitFor(() => expect(kinds).toContain(0));
  kinds.length = 0;
  return { socket, kinds, cursors };
}
function presence(client: number, clock = 1) {
  const body = encoding.createEncoder();
  encoding.writeVarUint(body, 1); encoding.writeVarUint(body, client);
  encoding.writeVarUint(body, clock);
  encoding.writeVarString(body, JSON.stringify({ cursor: { x: clock, y: 1 } }));
  const frame = encoding.createEncoder(); encoding.writeVarUint(frame, 1);
  encoding.writeVarUint8Array(frame, encoding.toUint8Array(body));
  return encoding.toUint8Array(frame);
}
function queryDocument() {
  const doc = new Y.Doc();
  try {
    const frame = encoding.createEncoder(); encoding.writeVarUint(frame, 0);
    sync.writeSyncStep1(frame, doc); return encoding.toUint8Array(frame);
  } finally { doc.destroy(); }
}
it('keeps another connection protocol operation moving while presence authorization stalls', async () => {
  const entered = deferred(), release = deferred();
  let blocked = false, revoked = false;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Presence wrote storage'); } },
    authorize: async token => {
      if (blocked && token === 'slow') { entered.resolve(); await release.promise; }
      return revoked && token === 'slow' ? null : { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen();
  const slow = await connect(url, 'slow'), fast = await connect(url, 'fast');
  try {
    blocked = true; slow.socket.send(presence(1)); await entered.promise;
    fast.socket.send(queryDocument());
    await vi.waitFor(() => expect(fast.kinds).toEqual([0]));
    revoked = true;
    const closed = new Promise<number>(resolve => { slow.socket.once('close', resolve); });
    release.resolve(); expect(await closed).toBe(1008);
    expect(fast.kinds).toEqual([0]);
  } finally { release.resolve(); }
});
it('accepts a browser initial clock-zero frame and continues with its next cursor', async () => {
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Presence wrote storage'); } },
    authorize: async token => ({ userId: token, role: 'viewer' }) });
  disposals.push(() => server.stop());
  const { url } = await server.listen();
  const source = await connect(url, 'source'), receiver = await connect(url, 'receiver');
  source.socket.send(presence(9, 0)); source.socket.send(queryDocument());
  await vi.waitFor(() => expect(source.kinds).toContain(0));
  source.socket.send(presence(9, 1));
  await vi.waitFor(() => expect(receiver.cursors.get(9)?.cursor?.x).toBe(1));
  expect(source.socket.readyState).toBe(WebSocket.OPEN);
  expect(receiver.socket.readyState).toBe(WebSocket.OPEN);
});
it('consumes the latest cursor after fresh authorization without checking the same queued burst twice', async () => {
  const entered = deferred(), release = deferred();
  let measuring = false, calls = 0, first = true;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Presence wrote storage'); } },
    authorize: async token => {
      if (measuring) {
        calls++;
        if (first && token === 'source') { first = false; entered.resolve(); await release.promise; }
      }
      return { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen();
  const source = await connect(url, 'source'), receiver = await connect(url, 'receiver');
  try {
    measuring = true; source.socket.send(presence(9, 1)); await entered.promise;
    for (let clock = 2; clock <= 20; clock++) source.socket.send(presence(9, clock));
    // Native ping/pong confirms that all earlier data frames were parsed while
    // application Auth remains held, without a timing-dependent sleep.
    const parsed = new Promise<void>(resolve => { source.socket.once('pong', () => resolve()); });
    source.socket.ping(); await parsed;
    release.resolve();
    await vi.waitFor(() => {
      expect(source.cursors.get(9)?.cursor?.x).toBe(20);
      expect(receiver.cursors.get(9)?.cursor?.x).toBe(20);
    });
    expect(calls).toBe(2); // Source sends synchronously after its input check; receiver checks freshly.
  } finally { measuring = false; release.resolve(); }
});
it('preserves a connection protocol operation behind its own pending presence', async () => {
  const entered = deferred(), release = deferred();
  let blocked = false, first = true;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Presence wrote storage'); } },
    authorize: async token => {
      if (blocked && first) { first = false; entered.resolve(); await release.promise; }
      return { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen(), peer = await connect(url, 'peer');
  try {
    blocked = true; peer.socket.send(presence(1)); await entered.promise;
    peer.socket.send(queryDocument());
    await new Promise(resolve => { setTimeout(resolve, 30); });
    expect(peer.kinds).toEqual([]);
    release.resolve();
    await vi.waitFor(() => {
      expect(peer.kinds).toContain(0);
      expect(peer.cursors.get(1)?.cursor?.x).toBe(1);
    });
  } finally { release.resolve(); }
});
it('bounds fresh authorization including parallel presence broadcasts', async () => {
  const release = deferred();
  let blocked = false, active = 0, maximum = 0, started = 0;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Presence wrote storage'); } },
    authorize: async token => {
      if (blocked) {
        started++; maximum = Math.max(maximum, ++active);
        try { await release.promise; } finally { active--; }
      }
      return { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen(), peers: Array<Awaited<ReturnType<typeof connect>>> = [];
  for (let i = 0; i < 10; i++) peers.push(await connect(url, 'peer-' + i));
  try {
    blocked = true;
    for (const [i, peer] of peers.entries()) peer.socket.send(presence(i + 1));
    await vi.waitFor(() => expect(started).toBe(8));
    expect(maximum).toBe(8); release.resolve();
    await vi.waitFor(() => expect(peers.every(peer => peer.cursors.size === 10
      && [...peer.cursors.values()].every(state => state?.cursor?.x === 1))).toBe(true));
    expect(maximum).toBeLessThanOrEqual(8);
    // Each of the ten input checks also covers its own synchronous reply.
    // All other delivered frames need a distinct fresh recipient check.
    await vi.waitFor(() => expect(started).toBe(peers.reduce((n, peer) => n + peer.kinds.filter(kind => kind === 1).length, 0)));
    expect(started).toBeGreaterThanOrEqual(10);
    expect(started).toBeLessThanOrEqual(110);
  } finally { release.resolve(); }
});
it('drains in-flight presence authorization before shutdown completes', async () => {
  const entered = deferred(), release = deferred();
  let blocked = false;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Presence wrote storage'); } },
    authorize: async token => {
      if (blocked) { entered.resolve(); await release.promise; }
      return { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen(), peer = await connect(url, 'peer');
  try {
    blocked = true; peer.socket.send(presence(1)); await entered.promise;
    let complete = false;
    const stopping = server.stop().then(() => { complete = true; });
    await new Promise(resolve => { setTimeout(resolve, 30); }); expect(complete).toBe(false);
    release.resolve(); await stopping; expect(complete).toBe(true); expect(peer.kinds).toEqual([]);
  } finally { release.resolve(); }
});
it('keeps shutdown bounded when an authorization adapter ignores its deadline', async () => {
  const entered = deferred();
  let blocked = false;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Presence wrote storage'); } },
    authorize: async token => {
      if (blocked) { entered.resolve(); await new Promise(() => undefined); }
      return { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen(), peer = await connect(url, 'peer');
  blocked = true; peer.socket.send(presence(1)); await entered.promise;
  await server.stop(); expect(peer.kinds).toEqual([]);
}, 10_000);
it('keeps a removal tombstone when a recipient is waiting on fresh authorization', async () => {
  const entered = deferred(), release = deferred(), sourceClosed = deferred();
  let blocked = false, connectionCount = 0;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Presence wrote storage'); } },
    authorize: async token => {
      if (blocked && token === 'receiver') { entered.resolve(); await release.promise; }
      return { userId: token, role: 'viewer' };
    } });
  server.http.on('connection', socket => {
    if (++connectionCount === 1) socket.once('close', () => { queueMicrotask(sourceClosed.resolve); });
  });
  disposals.push(() => server.stop());
  const { url } = await server.listen();
  const source = await connect(url, 'source'), receiver = await connect(url, 'receiver');
  try {
    blocked = true; source.socket.send(presence(9, 1)); await entered.promise;
    source.socket.send(presence(9, 2)); source.socket.send(presence(9, 3));
    await vi.waitFor(() => expect(source.cursors.get(9)?.cursor?.x).toBe(3));
    source.socket.close(); await sourceClosed.promise;
    expect(receiver.cursors.size).toBe(0);
    release.resolve(); await vi.waitFor(() => expect(receiver.cursors.get(9)).toBe(null));
  } finally { release.resolve(); }
});
it('drains a pending outbound presence check without sending after shutdown', async () => {
  const entered = deferred(), release = deferred();
  let blocked = false;
  const server = createCollaborationServer({ origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw Error('Presence wrote storage'); } },
    authorize: async token => {
      if (blocked && token === 'receiver') { entered.resolve(); await release.promise; }
      return { userId: token, role: 'viewer' };
    } });
  disposals.push(() => server.stop());
  const { url } = await server.listen();
  const source = await connect(url, 'source'), receiver = await connect(url, 'receiver');
  try {
    blocked = true; source.socket.send(presence(1)); await entered.promise;
    let complete = false;
    const stopping = server.stop().then(() => { complete = true; });
    await new Promise(resolve => { setTimeout(resolve, 30); }); expect(complete).toBe(false);
    release.resolve(); await stopping; expect(complete).toBe(true); expect(receiver.kinds).toEqual([]);
  } finally { release.resolve(); }
});
