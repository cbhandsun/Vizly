// @vitest-environment node
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFilePersistence } from './persistence.js';
import { createRoomRecovery } from './roomRecovery.js';
import { createRoomRecoveryHttp } from './roomRecoveryHttp.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin = 'http://localhost:5419';
const checkpoint = { revision: '2026-10-09T02:04:07.212Z', base: new Uint8Array([0, 0]), state: new Uint8Array([0, 0]) };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const stop of cleanup.splice(0).reverse()) await stop(); });
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vizly-recovery-http-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const previous = Buffer.from([255, 42]);
  await writeFile(join(directory, `${id}.yjs`), previous);
  const persistence = createFilePersistence(directory);
  const authorizeOwner = vi.fn(async (token: string) => token === 'synthetic-owner' ? { userId, role: 'editor' as const } : null);
  const readCloud = vi.fn(async () => checkpoint);
  const release = vi.fn();
  const reserveIdleRoom = vi.fn<(_id: string) => (() => void) | null>(() => release);
  const handler = createRoomRecoveryHttp({ origins: new Set([origin]), authorizeOwner, reserveIdleRoom,
    operations: createRoomRecovery({ authorizeOwner, persistence, readCloud, readRevision: async () => checkpoint.revision }) });
  const http = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Address unavailable');
  cleanup.push(async () => { await handler.stop(); http.closeAllConnections(); await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())); });
  const url = `http://127.0.0.1:${address.port}/recovery/vizly-room-${id}`;
  const request = (method = 'GET', body?: string, headers: Record<string, string> = {}) => fetch(url, {
    method, body, headers: { Origin: origin, Authorization: 'Bearer synthetic-owner', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
  });
  return { directory, persistence, previous, request, url, handler, authorizeOwner, reserveIdleRoom, release, readCloud };
};
describe('bounded recovery HTTP boundary', () => {
  it('returns a content-free plan, then replaces only after explicit confirmation and preserves the backup', async () => {
    const f = await fixture();
    const response = await f.request();
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const plan: unknown = await response.json();
    expect(plan).toEqual({ ...(await f.persistence.inspectRecovery(id)), revision: checkpoint.revision });
    expect(await readFile(join(f.directory, `${id}.yjs`))).toEqual(f.previous);
    const confirmed = await f.request('POST', JSON.stringify(plan && typeof plan === 'object' && 'sha256' in plan
      ? { sha256: plan.sha256, revision: checkpoint.revision } : null));
    expect(confirmed.status).toBe(200);
    const receipt = await confirmed.json() as { backupId: string };
    expect(await readFile(join(f.directory, 'recovery-backups', receipt.backupId))).toEqual(f.previous);
    expect((await f.persistence.loadRecord(id))?.checkpoint?.revision).toBe(checkpoint.revision);
    expect(f.release).toHaveBeenCalledTimes(2);
  });
  it('allows only approved-origin preflight and advertises no cookie credentials', async () => {
    const f = await fixture(); const response = await f.request('OPTIONS');
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(f.authorizeOwner).not.toHaveBeenCalled(); expect(f.reserveIdleRoom).not.toHaveBeenCalled();
  });
  it.each([
    ['Origin', 'https://outsider.example'], ['Origin', ''], ['Authorization', ''],
    ['Authorization', 'Bearer outsider'], ['Authorization', 'Bearer a b'], ['Authorization', `Bearer ${'a'.repeat(4097)}`],
  ])('denies unsafe %s without inspecting or reserving a room', async (name, value) => {
    const f = await fixture(); const response = await f.request('GET', undefined, { [name]: value });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: 'rejected' });
    expect(f.reserveIdleRoom).not.toHaveBeenCalled(); expect(f.readCloud).not.toHaveBeenCalled();
  });
  it.each(['null', '{}', '{', JSON.stringify({ sha256: 'a'.repeat(64), revision: checkpoint.revision, state: [] }), 'x'.repeat(1025)])('rejects invalid or excessive POST input without changing the room', async body => {
    const f = await fixture(); const response = await f.request('POST', body);
    expect(response.status).toBe(400);
    expect(await readFile(join(f.directory, `${id}.yjs`))).toEqual(f.previous);
    expect(f.readCloud).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
  });
  it('rejects an unsupported content type and a busy room', async () => {
    const f = await fixture();
    expect((await f.request('POST', '{}', { 'Content-Type': 'text/plain' })).status).toBe(400);
    f.reserveIdleRoom.mockReturnValue(null);
    expect((await f.request()).status).toBe(409);
    expect(f.readCloud).not.toHaveBeenCalled();
  });
  it('returns conflict when the confirmed disk fingerprint is stale', async () => {
    const f = await fixture();
    const response = await f.request('POST', JSON.stringify({ sha256: 'a'.repeat(64), revision: checkpoint.revision }));
    expect(response.status).toBe(409);
    expect(await readFile(join(f.directory, `${id}.yjs`))).toEqual(f.previous);
  });
  it('does not expose upstream details and releases the exclusive reservation on failure', async () => {
    const f = await fixture(); f.readCloud.mockRejectedValue(new Error('Synthetic secret and private diagram detail'));
    const response = await f.request();
    expect(response.status).toBe(503); expect(await response.text()).toBe('{"status":"unavailable"}');
    expect(f.release).toHaveBeenCalledOnce();
  });
  it('rejects query credentials and malformed route identities', async () => {
    const f = await fixture();
    for (const url of [`${f.url}?token=synthetic-owner`, f.url.replace(id, '../outside')]) {
      const response = await fetch(url, { headers: { Origin: origin, Authorization: 'Bearer synthetic-owner' } });
      expect(response.status).toBe(404);
    }
    expect(f.authorizeOwner).not.toHaveBeenCalled();
  });
  it('stops accepting recovery before shutdown', async () => {
    const f = await fixture(); await f.handler.stop();
    expect((await f.request()).status).toBe(503);
    expect(f.authorizeOwner).not.toHaveBeenCalled();
  });
  it('caps pending authorization requests and resumes after they finish', async () => {
    const f = await fixture();
    let release: () => void = () => { throw new Error('Not initialized'); };
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.authorizeOwner.mockImplementation(async () => { await gate; return { userId, role: 'editor' }; });
    const requests = Array.from({ length: 16 }, () => f.request());
    try {
      await vi.waitFor(() => expect(f.authorizeOwner).toHaveBeenCalledTimes(16));
      expect((await f.request()).status).toBe(503);
      expect(f.reserveIdleRoom).not.toHaveBeenCalled();
    } finally { release(); }
    const completed = await Promise.all(requests);
    expect(completed.every(response => response.status === 200)).toBe(true);
    expect((await f.request()).status).toBe(200);
  });
});
