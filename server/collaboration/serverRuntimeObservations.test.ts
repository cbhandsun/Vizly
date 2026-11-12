// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createCollaborationServer, type CollaborationServerOptions } from './server.js';
import { createRuntimeObservations, type RuntimeObservation } from './runtimeObservations.js';
const room = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const origin = 'http://localhost';
const token = 'PRIVATE_TOKEN_SENTINEL';
const cleanup: Array<() => void | Promise<void>> = [];
const releases: Array<() => void> = [];
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
const start = async (overrides: Partial<CollaborationServerOptions> = {}) => {
  const samples: RuntimeObservation[] = [];
  const server = createCollaborationServer({
    authorize: async () => ({ userId: 'PRIVATE_USER_SENTINEL', role: 'editor' }),
    origins: new Set([origin]), recheckMs: 60_000,
    persistence: { load: async () => null, save: async () => { throw new Error('Unexpected write'); } },
    observations: createRuntimeObservations(sample => samples.push(sample)), ...overrides,
  });
  const address = await server.listen(); cleanup.push(() => server.stop());
  return { server, samples, ...address };
};
const peer = (url: string, peerOrigin = origin) => {
  const socket = new WebSocket(`${url}/vizly-room-${room}?token=${token}`, { origin: peerOrigin });
  cleanup.push(() => socket.terminate());
  const frames: number[] = []; const errors: Error[] = [];
  const headers: Record<string, string | string[] | undefined> = {};
  let denied: number | undefined, closed: number | undefined;
  socket.on('upgrade', response => Object.assign(headers, response.headers));
  socket.on('message', data => frames.push(new Uint8Array(data as Buffer)[0]));
  socket.on('error', error => errors.push(error));
  socket.on('close', code => { closed = code; });
  socket.on('unexpected-response', (_request, response) => {
    denied = response.statusCode; Object.assign(headers, response.headers); response.resume(); socket.terminate();
  });
  return { socket, frames, errors, headers, get denied() { return denied; }, get closed() { return closed; } };
};
const assertPrivate = (samples: RuntimeObservation[]) => {
  const text = JSON.stringify(samples);
  for (const value of [token, room, origin, 'PRIVATE_USER_SENTINEL', 'PRIVATE_ERROR_SENTINEL']) expect(text).not.toContain(value);
  for (const sample of samples) expect(Object.isFrozen(sample)).toBe(true);
};
describe('real HTTP and WebSocket instance/admission correlation', () => {
  it('reports one stable instance identity per runtime and distinct identities across runtimes', async () => {
    const first = await start(), second = await start();
    const read = async (f: typeof first) => {
      const response = await fetch(`http://127.0.0.1:${f.port}/health`);
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
      return await response.json();
    };
    expect(await read(first)).toEqual({ status: 'ready', instanceId: first.server.instanceId });
    expect(await read(first)).toEqual(await read(first));
    expect(await read(second)).toEqual({ status: 'ready', instanceId: second.server.instanceId });
    expect(first.server.instanceId).not.toBe(second.server.instanceId);
    await first.server.stop();
    expect(first.samples.map(sample => sample.event)).toEqual(['server-ready', 'server-stopping', 'server-stopped']);
    expect(second.samples.map(sample => sample.event)).toEqual(['server-ready']);
  });
  it('keeps phase order across asynchronous room loading and correlates exact 101 headers', async () => {
    let entered = false; let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; }); releases.push(release);
    const f = await start({ persistence: { load: async () => { entered = true; await gate; return null; }, save: async () => undefined } });
    const first = peer(f.url);
    await vi.waitFor(() => expect(entered).toBe(true));
    expect(f.samples.map(sample => sample.event)).toEqual(['server-ready', 'upgrade-started', 'permission-accepted', 'room-loading']);
    expect(first.frames).toEqual([]); release();
    await vi.waitFor(() => expect(first.frames).toEqual([4, 0]));
    expect(first.errors).toEqual([]); expect(first.headers['x-vizly-instance']).toBe(f.server.instanceId);
    const firstId = first.headers['x-vizly-admission']; expect(firstId).toEqual(expect.any(String));
    const firstSamples = f.samples.filter(sample => sample.admissionId === firstId);
    expect(firstSamples.map(sample => sample.event)).toEqual(['upgrade-started', 'permission-accepted', 'room-loading', 'room-ready', 'socket-opened']);
    expect(firstSamples.every((sample, i) => i === 0 || sample.elapsedMs >= firstSamples[i - 1].elapsedMs)).toBe(true);
    const second = peer(f.url); await vi.waitFor(() => expect(second.frames).toEqual([4, 0]));
    expect(second.headers['x-vizly-instance']).toBe(f.server.instanceId);
    expect(second.headers['x-vizly-admission']).not.toBe(firstId);
    first.socket.close(); await vi.waitFor(() => expect(first.closed).toBeDefined());
    expect(f.samples.some(sample => sample.event === 'socket-closed' && sample.admissionId === firstId)).toBe(true);
    assertPrivate(f.samples);
  });
  it.each(['origin', 'permission'])('correlates a denied %s without accepting a socket or loading a document', async rejection => {
    const load = vi.fn(async () => null);
    const f = await start({ authorize: async () => rejection === 'permission' ? null : { userId: 'PRIVATE_USER_SENTINEL', role: 'editor' },
      persistence: { load, save: async () => undefined } });
    const p = peer(f.url, rejection === 'origin' ? 'https://invalid.example' : origin);
    await vi.waitFor(() => expect(p.denied).toBe(403));
    expect(p.frames).toEqual([]); expect(load).not.toHaveBeenCalled();
    expect(p.headers['x-vizly-instance']).toBe(f.server.instanceId);
    expect(f.samples.filter(sample => sample.admissionId === p.headers['x-vizly-admission']).map(sample => sample.event))
      .toEqual(['upgrade-started', 'upgrade-denied']);
    assertPrivate(f.samples);
  });
  it('retains fresh revocation when every diagnostic callback throws', async () => {
    let revoked = false;
    const f = await start({ authorize: async () => revoked ? null : { userId: 'PRIVATE_USER_SENTINEL', role: 'editor' },
      observations: createRuntimeObservations(() => { throw new Error('PRIVATE_ERROR_SENTINEL'); }) });
    const p = peer(f.url); await vi.waitFor(() => expect(p.frames).toEqual([4, 0]));
    revoked = true; p.socket.send(Uint8Array.of(3));
    await vi.waitFor(() => expect(p.closed).toBe(1008));
    expect(p.frames).toEqual([4, 0]); expect(p.errors).toEqual([]);
  });
  it('records a failed room load and the isolated recovery socket without exposing the error', async () => {
    const f = await start({ loadInitialRoom: async () => { throw new Error('PRIVATE_ERROR_SENTINEL'); } });
    const p = peer(f.url); await vi.waitFor(() => expect(p.closed).toBe(1008));
    expect(p.frames).toEqual([5]); expect(p.errors).toEqual([]);
    expect(f.samples.filter(sample => sample.admissionId === p.headers['x-vizly-admission']).map(sample => sample.event))
      .toEqual(['upgrade-started', 'permission-accepted', 'room-loading', 'room-failed', 'socket-opened', 'socket-closed']);
    assertPrivate(f.samples);
  });
});
