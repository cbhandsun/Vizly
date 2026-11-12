import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { cpus, platform, arch } from 'node:os';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import { createCollaborationServer } from '../dist-collaboration/server.js';
import { publishCollaborationElement } from '../dist-collaboration/documentModel.js';

const rooms = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
const origin = 'http://localhost:5417', frames = 30, peersPerRoom = 4;
const waitFor = async (check, label) => {
  const deadline = performance.now() + 20_000;
  while (!check()) { if (performance.now() > deadline) throw new Error(`Timed out: ${label}`); await delay(5); }
};
const stats = values => {
  assert(values.length && values.every(x => Number.isFinite(x) && x >= 0));
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, p50Ms: sorted[Math.ceil(sorted.length / 2) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) };
};
const frame = (kind, write) => { const e = encoding.createEncoder(); encoding.writeVarUint(e, kind); write(e); return encoding.toUint8Array(e); };
const snapshot = doc => JSON.stringify(doc.getMap('flowchart-nodes').toJSON());
const run = async () => {
  const peers = [], persisted = new Map(), queues = [], revoked = new Set();
  let measuring = false, active = 0, maxActive = 0, checks = 0, saves = 0;
  const authDurations = [];
  const server = createCollaborationServer({ origins: new Set([origin]),
    // Keep the production default periodic permission recheck enabled.
    authorize: async (token, room) => {
      const counted = measuring, start = performance.now();
      if (counted) { checks++; maxActive = Math.max(maxActive, ++active); }
      try {
        await delay(30);
        const peer = peers.find(p => p.token === token && p.room === room);
        return peer && !revoked.has(token) ? { userId: token, role: 'editor' } : null;
      } finally { if (counted) { active--; authDurations.push(performance.now() - start); } }
    },
    persistence: { load: async id => persisted.get(id) ?? null,
      save: async (id, bytes) => { await delay(5); persisted.set(id, Uint8Array.from(bytes)); saves++; } },
    observeMessageQueue: sample => { if (measuring) queues.push(sample); },
  });
  const persistedDoc = id => {
    const doc = new Y.Doc();
    assert(persisted.has(id), 'Missing persisted room');
    Y.applyUpdate(doc, persisted.get(id));
    return doc;
  };
  const edit = (peer, suffix) => {
    const id = `${peer.index}-${suffix}`;
    assert(publishCollaborationElement(peer.doc.getMap('flowchart-nodes'), id,
      { id, position: { x: peer.index * 10, y: 20 }, data: { label: id } }));
    peer.socket.send(frame(0, e => sync.writeUpdate(e, Y.encodeStateAsUpdate(peer.doc))));
  };
  try {
    const { url } = await server.listen();
    for (let index = 0; index < rooms.length * peersPerRoom; index++) {
      const room = rooms[Math.floor(index / peersPerRoom)], token = `synthetic-peer-${index}`;
      const peer = { index, room, token, doc: new Y.Doc(), cursorByClient: new Map(), ready: false, closed: false, failed: false };
      peers.push(peer);
      const socket = new WebSocket(`${url}/vizly-room-${room}?token=${token}`, { origin });
      peer.socket = socket;
      socket.on('error', () => { peer.failed = true; });
      socket.on('close', code => { peer.closed = true; peer.closeCode = code; });
      socket.on('message', bytes => {
        try {
          const d = decoding.createDecoder(new Uint8Array(bytes)), kind = decoding.readVarUint(d);
          if (kind === 0) {
            const subtype = decoding.readVarUint(d), update = decoding.readVarUint8Array(d);
            if (subtype === sync.messageYjsSyncStep1) peer.ready = true;
            else { assert([sync.messageYjsUpdate, sync.messageYjsSyncStep2].includes(subtype)); Y.applyUpdate(peer.doc, update); }
          } else if (kind === 1) {
            const a = decoding.createDecoder(decoding.readVarUint8Array(d)), count = decoding.readVarUint(a);
            for (let i = 0; i < count; i++) {
              const id = decoding.readVarUint(a); decoding.readVarUint(a);
              const state = JSON.parse(decoding.readVarString(a));
              peer.cursorByClient.set(id, state?.cursor ?? null);
            }
          }
        } catch { peer.failed = true; }
      });
      await waitFor(() => peer.ready || peer.closed || peer.failed, 'peer setup');
      assert(peer.ready && !peer.closed && !peer.failed);
    }
    measuring = true;
    const started = performance.now();
    for (let clock = 1; clock <= frames; clock++) {
      for (const peer of peers) {
        const presence = encoding.createEncoder();
        encoding.writeVarUint(presence, 1); encoding.writeVarUint(presence, peer.doc.clientID);
        encoding.writeVarUint(presence, clock);
        encoding.writeVarString(presence, JSON.stringify({ cursor: { x: clock, y: -clock } }));
        peer.socket.send(frame(1, e => encoding.writeVarUint8Array(e, encoding.toUint8Array(presence))));
        if (clock === 5 || clock === 20) edit(peer, `edit-${clock}`);
      }
      await delay(20);
    }
    const finalInputAt = performance.now();
    await waitFor(() => peers.some(p => p.closed || p.failed) || peers.every(peer =>
      peer.doc.getMap('flowchart-nodes').size === peersPerRoom * 2
      && peers.filter(p => p.room === peer.room).every(p => peer.cursorByClient.get(p.doc.clientID)?.x === frames)), 'final documents and cursors');
    assert(peers.every(p => !p.closed && !p.failed));
    const settledAt = performance.now();
    await waitFor(() => active === 0, 'authorization drained');
    measuring = false;
    assert(queues.length > 0 && queues.every(q => q.connectionPending >= 1 && q.connectionPending <= 16));
    for (const room of rooms) {
      const doc = persistedDoc(room);
      try {
        const expected = peers.filter(p => p.room === room).flatMap(p => [`${p.index}-edit-5`, `${p.index}-edit-20`]).sort();
        assert.deepEqual([...doc.getMap('flowchart-nodes').keys()].sort(), expected);
        for (const peer of peers.filter(p => p.room === room)) {
          assert.deepEqual(peer.doc.getMap('flowchart-nodes').toJSON(), doc.getMap('flowchart-nodes').toJSON());
          const foreign = peers.filter(p => p.room !== room);
          assert(foreign.every(p => !peer.cursorByClient.has(p.doc.clientID)), 'Cross-room presence leakage');
        }
      } finally { doc.destroy(); }
    }
    // A revoked writer must not change either accepted documents or persistence.
    const victim = peers[0], before = Uint8Array.from(persisted.get(victim.room));
    revoked.add(victim.token); edit(victim, 'forbidden');
    await waitFor(() => victim.closed, 'revoked writer closure');
    assert.equal(victim.closeCode, 1008);
    assert.deepEqual(persisted.get(victim.room), before);
    assert(peers.filter(p => p !== victim).every(p => !p.doc.getMap('flowchart-nodes').has('0-forbidden')));
    // The other room must still accept and persist a new edit after revocation.
    const survivor = peers[peersPerRoom]; edit(survivor, 'after-revocation');
    await waitFor(() => peers.filter(p => p.room === survivor.room).every(p => p.doc.getMap('flowchart-nodes').has('4-after-revocation')), 'unaffected room progress');
    const restored = persistedDoc(survivor.room);
    try { assert.equal(restored.getMap('flowchart-nodes').size, 9); assert.equal(snapshot(restored).includes('forbidden'), false); }
    finally { restored.destroy(); }
    return { status: 'passed', roomCount: 2, peersPerRoom, inputPresenceFrames: frames * peers.length,
      durableEdits: peers.length * 2, persistedRooms: persisted.size, saveCalls: saves,
      workloadMs: settledAt - started, finalInputToConvergenceMs: settledAt - finalInputAt,
      authorizationChecks: checks, authorizationChecksPerSecond: checks / ((settledAt - started) / 1000),
      maxActiveAuthorizations: maxActive, authorizationLatency: stats(authDurations), queueWait: stats(queues.map(q => q.waitMs)),
      maxConnectionPending: Math.max(...queues.map(q => q.connectionPending)),
      invariants: { finalCursors: true, exactPeerAndPersistedDocuments: true, roomIsolation: true,
        revokedWriteRejected: true, unaffectedRoomContinues: true } };
  } finally {
    measuring = false;
    for (const p of peers) p.socket?.terminate();
    await server.stop();
    for (const p of peers) p.doc.destroy();
  }
};
const report = { status: 'running', results: [], startedAt: new Date().toISOString(),
  runner: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  scope: 'actual loopback WebSockets/Yjs, synthetic 30ms authorization and 5ms memory persistence; default periodic rechecks; not real Auth or database capacity' };
try {
  const raw = process.env.COLLABORATION_MIXED_LOAD_ROUNDS ?? '5';
  if (!/^(?:[3-9]|10)$/.test(raw)) throw new Error('Mixed load rounds must be 3–10');
  report.rounds = Number(raw);
  for (let round = 1; round <= report.rounds; round++) {
    process.stderr.write(`Mixed collaboration load ${round}/${report.rounds}\n`);
    report.results.push({ round, ...await run() });
  }
  assert.equal(report.results.length, report.rounds); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
report.finishedAt = new Date().toISOString();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
