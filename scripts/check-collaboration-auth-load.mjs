import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { cpus, platform, arch } from 'node:os';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createCollaborationServer } from '../dist-collaboration/server.js';
import { createSupabaseAuthorizer } from '../dist-collaboration/authorization.js';

const room = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const origin = 'http://localhost:5417';
const messagesPerPeer = 8, httpDelayMs = 10;
const stats = values => {
  assert(values.length > 0 && values.every(x => Number.isFinite(x) && x >= 0));
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, p50: sorted[Math.ceil(sorted.length * .5) - 1],
    p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
};
const waitFor = async (check, label) => {
  const deadline = performance.now() + 20_000;
  while (!check()) {
    if (performance.now() > deadline) throw new Error(`Timed out: ${label}`);
    await delay(5);
  }
};
const run = async peerCount => {
  let measuring = false, active = 0, maxActive = 0, revoked = false;
  const calls = { auth: 0, diagram: 0, collaborator: 0 }, authDurations = [], queues = [], peers = [];
  const transport = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://synthetic.invalid');
    const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '');
    assert.match(token ?? '', /^synthetic-[0-7]$/);
    const kind = url.pathname === '/auth/v1/user' ? 'auth'
      : url.pathname === '/rest/v1/diagrams' ? 'diagram'
        : url.pathname === '/rest/v1/diagram_collaborators' ? 'collaborator' : null;
    assert(kind, 'Unexpected upstream request');
    if (measuring) calls[kind]++;
    await delay(httpDelayMs, undefined, { signal: init?.signal });
    // Exercise the actual SDK and user-scoped authorizer with controlled HTTP,
    // never a real project or credentials. Each peer is a non-owner editor.
    const value = kind === 'auth' ? { id: token, is_anonymous: false }
      : kind === 'diagram' ? { user_id: 'synthetic-owner' }
        : revoked ? null : { role: 'editor' };
    return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  };
  const upstream = createSupabaseAuthorizer('https://synthetic.invalid', 'synthetic-publishable', transport);
  const server = createCollaborationServer({ origins: new Set([origin]),
    // Isolate per-message amplification from scheduled background checks.
    // Production rechecks and durable edits are verified by server.test.ts.
    recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw new Error('Read-only load probe wrote data'); } },
    authorize: async (...args) => {
      const counted = measuring, start = performance.now();
      if (counted) maxActive = Math.max(maxActive, ++active);
      try { return await upstream(...args); }
      finally { if (counted) { active--; authDurations.push(performance.now() - start); } }
    },
    observeMessageQueue: sample => { if (measuring) queues.push(sample); },
  });
  try {
    const { url } = await server.listen();
    for (let i = 0; i < peerCount; i++) {
      const socket = new WebSocket(`${url}/vizly-room-${room}?token=synthetic-${i}`, { origin });
      const peer = { socket, ready: false, responses: [], sentAt: [], closed: false, closeCode: null, error: false };
      peers.push(peer);
      socket.on('error', () => { peer.error = true; });
      socket.on('close', code => { peer.closed = true; peer.closeCode = code; });
      socket.on('message', data => {
        const bytes = new Uint8Array(data);
        if (bytes[0] === 0) peer.ready = true;
        if (bytes[0] === 1) peer.responses.push(performance.now());
      });
      await waitFor(() => peer.ready || peer.closed || peer.error, 'peer handshake');
      assert(peer.ready && !peer.closed && !peer.error);
    }
    measuring = true;
    const started = performance.now();
    for (const peer of peers) for (let i = 0; i < messagesPerPeer; i++) {
      peer.sentAt.push(performance.now());
      peer.socket.send(Uint8Array.of(3)); // y-websocket awareness query: not replaceable presence.
    }
    const expected = peerCount * messagesPerPeer;
    await waitFor(() => peers.some(p => p.closed || p.error)
      || peers.every(p => p.responses.length >= messagesPerPeer), 'all query responses');
    assert(peers.every(p => !p.closed && !p.error && p.responses.length === messagesPerPeer));
    await waitFor(() => queues.length === expected && active === 0, 'drained auth and queue');
    const elapsedMs = performance.now() - started;
    measuring = false;
    assert.equal(authDurations.length, expected);
    assert.deepEqual(calls, { auth: expected, diagram: expected, collaborator: expected });
    assert(queues.every(q => Number.isFinite(q.waitMs) && q.waitMs >= 0
      && Number.isInteger(q.connectionPending) && q.connectionPending >= 1 && q.connectionPending <= 16));
    const responseLatency = peers.flatMap(p => p.responses.map((at, index) => at - p.sentAt[index]));
    // Revocation must be consulted for the next queued message, not served
    // from a positive result retained during the preceding burst.
    revoked = true;
    const revokeAt = performance.now();
    for (const p of peers) p.socket.send(Uint8Array.of(3));
    await waitFor(() => peers.every(p => p.closed), 'revoked peers disconnected');
    assert(peers.every(p => p.closeCode === 1008 && p.responses.length === messagesPerPeer));
    return { status: 'passed', peerCount, messagesPerPeer, completedMessages: expected,
      httpDelayMs, elapsedMs, calls, authQps: calls.auth / (elapsedMs / 1000),
      httpRequestsPerMessage: Object.values(calls).reduce((a, b) => a + b, 0) / expected,
      maxActiveAuthorizations: maxActive, authLatencyMs: stats(authDurations),
      queueWaitMs: stats(queues.map(q => q.waitMs)), maxConnectionPending: Math.max(...queues.map(q => q.connectionPending)),
      responseLatencyMs: stats(responseLatency), revocation: { deniedPeers: peerCount, leakedResponses: 0,
        allCloseCodes: 1008, disconnectMs: performance.now() - revokeAt } };
  } finally {
    measuring = false;
    for (const peer of peers) peer.socket.terminate();
    await server.stop();
  }
};

const report = { status: 'running', results: [], startedAt: new Date().toISOString(),
  runner: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  scope: 'actual loopback WebSocket server and Supabase SDK; synthetic 10ms HTTP transport; same-room read-query bursts; not live Auth capacity',
  recheckMs: 60_000 };
try {
  const raw = process.env.COLLABORATION_AUTH_LOAD_ROUNDS ?? '5';
  if (!/^(?:[3-9]|10)$/.test(raw)) throw new Error('Load rounds must be 3–10');
  const rounds = Number(raw);
  report.rounds = rounds;
  for (let round = 1; round <= rounds; round++) for (const peers of [1, 4, 8]) {
    process.stderr.write(`Auth load ${round}/${rounds}, ${peers} peers\n`);
    report.results.push({ round, ...await run(peers) });
  }
  assert.equal(report.results.length, rounds * 3);
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
report.finishedAt = new Date().toISOString();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
