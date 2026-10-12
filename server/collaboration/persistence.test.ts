// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createFilePersistence } from './persistence.js';
import { MAX_DOCUMENT_BYTES } from './boundary.js';
const folders: string[] = [];
const failures = vi.hoisted(() => ({ rename: false }));
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, rename: async (...args: Parameters<typeof original.rename>) => {
    if (failures.rename) throw new Error('Synthetic atomic replacement failure');
    return original.rename(...args);
  } };
});
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
afterEach(async () => { failures.rename = false; for (const directory of folders.splice(0)) await rm(directory, { recursive: true, force: true }); });
const directory = async () => { const dir = await mkdtemp(join(tmpdir(), 'vizly-collaboration-test-')); folders.push(dir); return dir; };
describe('atomic collaboration room persistence', () => {
  it('returns empty for a new room, restores Yjs state through a new store, and replaces the file atomically', async () => {
    const dir = await directory();
    const store = createFilePersistence(dir);
    expect(await store.load(id)).toBeNull();
    const doc = new Y.Doc();
    doc.getMap('flowchart-nodes').set('a', { id: 'a', position: { x: 0, y: 0 }, data: {} });
    await store.save(id, Y.encodeStateAsUpdate(doc));
    const restored = new Y.Doc();
    Y.applyUpdate(restored, (await createFilePersistence(dir).load(id))!);
    expect(restored.getMap('flowchart-nodes').has('a')).toBe(true);
    doc.getMap('flowchart-nodes').clear();
    await store.save(id, Y.encodeStateAsUpdate(doc));
    expect(await readdir(dir)).toEqual([`${id}.yjs`]);
    doc.destroy(); restored.destroy();
  });
  it('rejects path traversal and excessive state before writing files', async () => {
    const dir = await directory();
    const store = createFilePersistence(dir);
    await expect(store.load('../outside')).rejects.toThrow();
    await expect(store.save('../outside', new Uint8Array())).rejects.toThrow();
    await expect(store.save(id, new Uint8Array(MAX_DOCUMENT_BYTES + 1))).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });
  it('reports read and write failures instead of returning an empty document or claiming durability', async () => {
    const dir = await directory();
    const file = join(dir, 'not-a-directory');
    await writeFile(file, 'file');
    await expect(createFilePersistence(file).save(id, new Uint8Array([0, 0]))).rejects.toThrow();
    await writeFile(join(dir, `${id}.yjs`), new Uint8Array(MAX_DOCUMENT_BYTES + 1));
    await expect(createFilePersistence(dir).load(id)).rejects.toThrow('Room state unavailable');
  });
  it('atomically preserves cloud revision and baseline across normal saves and restart', async () => {
    const dir = await directory();
    const store = createFilePersistence(dir);
    const base = new Uint8Array([0, 0]);
    const revision = '2026-10-08T20:00:00.123456Z';
    await store.saveCheckpoint(id, { revision, base, state: base });
    const doc = new Y.Doc();
    try {
      doc.getMap('flowchart-nodes').set('a', { id: 'a', position: { x: 0, y: 0 }, data: {} });
      const live = Y.encodeStateAsUpdate(doc);
      await store.save(id, live);
      expect(await createFilePersistence(dir).loadRecord(id)).toEqual({ state: live, checkpoint: { revision, base } });
      expect(await createFilePersistence(dir).load(id)).toEqual(live);
      expect(await readdir(dir)).toEqual([`${id}.yjs`]);
    } finally { doc.destroy(); }
  });
  it('migrates an explicitly supplied legacy baseline without changing accepted state', async () => {
    const dir = await directory();
    const store = createFilePersistence(dir);
    const state = new Uint8Array([0, 0]);
    await store.save(id, state);
    expect((await store.loadRecord(id))?.checkpoint).toBeNull();
    await store.saveCheckpoint(id, { revision: '2026-10-08T20:00:00Z', base: state, state });
    expect((await store.loadRecord(id))?.checkpoint?.revision).toBe('2026-10-08T20:00:00Z');
    expect(await store.load(id)).toEqual(state);
  });
  it('rejects invalid replacement before touching the accepted checkpoint', async () => {
    const dir = await directory();
    const store = createFilePersistence(dir);
    const empty = new Uint8Array([0, 0]);
    await store.saveCheckpoint(id, { revision: '2026-10-08T20:00:00Z', base: empty, state: empty });
    const before = await readFile(join(dir, `${id}.yjs`));
    await expect(store.save(id, new Uint8Array([255]))).rejects.toThrow();
    await expect(store.saveCheckpoint(id, { revision: 'bad', base: empty, state: empty })).rejects.toThrow();
    expect(await readFile(join(dir, `${id}.yjs`))).toEqual(before);
    expect(await readdir(dir)).toEqual([`${id}.yjs`]);
  });
  it('fails closed on a corrupted checkpoint instead of silently resetting its baseline', async () => {
    const dir = await directory();
    const store = createFilePersistence(dir);
    const empty = new Uint8Array([0, 0]);
    await store.saveCheckpoint(id, { revision: '2026-10-08T20:00:00Z', base: empty, state: empty });
    const bytes = await readFile(join(dir, `${id}.yjs`)); bytes[bytes.length - 1] ^= 1;
    await writeFile(join(dir, `${id}.yjs`), bytes);
    await expect(store.load(id)).rejects.toThrow('Room state unavailable');
    await expect(store.save(id, empty)).rejects.toThrow('Room state unavailable');
    expect(await readFile(join(dir, `${id}.yjs`))).toEqual(bytes);
  });
  it('preserves the complete prior checkpoint and cleans temporary files if atomic replacement fails', async () => {
    const dir = await directory();
    const store = createFilePersistence(dir);
    const state = new Uint8Array([0, 0]);
    const previous = { revision: '2026-10-08T20:00:00.123456Z', base: state, state };
    await store.saveCheckpoint(id, previous);
    const bytes = await readFile(join(dir, `${id}.yjs`));
    failures.rename = true;
    await expect(store.saveCheckpoint(id, { ...previous, revision: '2026-10-08T21:00:00Z' })).rejects.toThrow('Room persistence failed');
    expect(await readFile(join(dir, `${id}.yjs`))).toEqual(bytes);
    expect(await readdir(dir)).toEqual([`${id}.yjs`]);
    expect(await store.loadRecord(id)).toEqual({ state, checkpoint: { revision: previous.revision, base: state } });
  });
  it('normalizes valid storage identities and rejects malformed UUID-shaped inputs', async () => {
    const dir = await directory();
    const store = createFilePersistence(dir);
    const state = new Uint8Array([0, 0]);
    await store.save(id.toUpperCase(), state);
    expect(await store.load(id)).toEqual(state);
    expect(await readdir(dir)).toEqual([`${id}.yjs`]);
    for (const invalid of ['-'.repeat(36), 'a'.repeat(36), '../outside', '', id.replace('-4aaa-', '-0aaa-')]) {
      await expect(store.load(invalid)).rejects.toThrow('identity');
      await expect(store.saveCheckpoint(invalid, { revision: '2026-10-08T20:00:00Z', base: state, state })).rejects.toThrow('identity');
    }
  });
});
