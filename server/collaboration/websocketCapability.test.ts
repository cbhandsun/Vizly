// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createWebsocketCapabilityServer } from './websocketCapability.js';
const origin = 'http://localhost:5419';
const servers: Array<ReturnType<typeof createWebsocketCapabilityServer>> = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.stop(); });
const fixture = async () => {
  const server = createWebsocketCapabilityServer(new Set([origin])); servers.push(server);
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); if (!address || typeof address === 'string') throw new Error('Missing probe address');
  return { server, url: `http://127.0.0.1:${address.port}` };
};
describe('isolated Vercel WebSocket capability entrypoint', () => {
  it('reports that this is a capability probe and collaboration is unavailable', async () => {
    const f = await fixture(); const response = await fetch(`${f.url}/health`);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'capability-only', collaborationReady: false });
    expect((await fetch(`${f.url}/recovery/owner`)).status).toBe(404);
    expect((await fetch(`${f.url}/health`, { method: 'POST' })).status).toBe(404);
  });
  it('upgrades a permitted connection, sends only a fixed receipt, and closes', async () => {
    const f = await fixture(); const ws = new WebSocket(f.url.replace('http:', 'ws:') + '/probe', { origin });
    const messages: string[] = [];
    ws.on('message', data => messages.push(data.toString()));
    const code = await new Promise<number>((resolve, reject) => { ws.once('close', resolve); ws.once('error', reject); });
    expect(code).toBe(1000);
    expect(messages).toEqual([JSON.stringify({ status: 'websocket-upgraded', collaborationReady: false })]);
  });
  it.each([{ origin: undefined, path: '/probe' }, { origin: 'https://attacker.invalid', path: '/probe' },
    { origin, path: '/probe?token=not-accepted' }, { origin, path: '/vizly-room-document' },
  ])('rejects unauthorized origins and every non-probe upgrade %#', async input => {
    const f = await fixture(); const ws = new WebSocket(f.url.replace('http:', 'ws:') + input.path, { origin: input.origin });
    const status = await new Promise<number>((resolve, reject) => {
      ws.once('unexpected-response', (_request, response) => { response.resume(); ws.terminate(); resolve(response.statusCode ?? 0); });
      ws.on('error', () => undefined); ws.once('open', () => reject(new Error('Unexpected admission')));
    }); expect(status).toBe(403);
  });
  it.each([new Set<string>(), new Set(['ftp://example.com']), new Set([origin + '/path'])])('rejects invalid configuration %#', origins => {
    expect(() => createWebsocketCapabilityServer(origins)).toThrow('configuration');
  });
  it('fences shutdown immediately and returns one cleanup promise', async () => {
    const f = await fixture(); const first = f.server.stop(); expect(f.server.stop()).toBe(first); await first;
    expect(f.server.http.listening).toBe(false);
  });
  it('checks a real second server upgrade without exposing incoming credentials', async () => {
    const target = await fixture();
    const server = createWebsocketCapabilityServer(new Set([origin]), target.url); servers.push(server);
    await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
    const address = server.http.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
    const response = await fetch(`http://127.0.0.1:${address.port}/self-check`, { headers: { cookie: 'synthetic-only=not-a-secret' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ websocketUpgraded: true, receiptMatched: true, closeCode: 1000, collaborationReady: false });
  });
  it('reports unavailable when no self-check target is configured', async () => {
    const f = await fixture(); expect((await fetch(`${f.url}/self-check`)).status).toBe(503);
  });
  it.each(['https://attacker.invalid', 'https://vizly-collaboration-test.vercel.app/path',
    'https://user@vizly-collaboration-test.vercel.app', 'http://10.0.0.1', 'invalid'])('rejects unsafe self-check targets %s', target => {
    expect(() => createWebsocketCapabilityServer(new Set([origin]), target)).toThrow('target');
  });
});
