// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFilePersistence } from './persistence.js';
import { MAX_CHECKPOINT_BYTES } from './roomCheckpoint.js';

const faults = vi.hoisted(() => ({ backup: false, replace: false, changeAfterBackup: false, pauseWrite: undefined as Promise<void> | undefined }));
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...original,
    writeFile: async (...args: Parameters<typeof original.writeFile>) => {
      const file = String(args[0]);
      if (file.includes('recovery-backups') && faults.backup) throw new Error('Synthetic private backup detail');
      if (file.endsWith('.tmp') && faults.pauseWrite) await faults.pauseWrite;
      await original.writeFile(...args);
      if (file.includes('recovery-backups') && faults.changeAfterBackup) {
        const path = await import('node:path');
        await original.writeFile(path.join(path.dirname(path.dirname(file)), `${id}.yjs`), new Uint8Array([1, 2, 3]));
      }
    },
    rename: async (...args: Parameters<typeof original.rename>) => {
      if (faults.replace) throw new Error('Synthetic private replacement detail');
      return original.rename(...args);
    },
  };
});
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const directories: string[] = [];
const checkpoint = { revision: '2026-10-09T02:04:07.212+00:00', base: new Uint8Array([0, 0]), state: new Uint8Array([0, 0]) };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const setup = async (previous = new Uint8Array([0, 0])) => {
  const directory = await mkdtemp(join(tmpdir(), 'vizly-recovery-'));
  directories.push(directory);
  await writeFile(join(directory, `${id}.yjs`), previous);
  return { directory, store: createFilePersistence(directory), previous };
};
afterEach(async () => {
  faults.backup = false; faults.replace = false; faults.changeAfterBackup = false;
  faults.pauseWrite = undefined;
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('backed-up explicit room checkpoint recovery', () => {
  it.each([new Uint8Array([0, 0]), new Uint8Array([255, 42]), new Uint8Array()])('backs up legacy, corrupt or empty bytes before installing a verified checkpoint', async previous => {
    const { directory, store } = await setup(previous);
    expect(await store.inspectRecovery(id)).toEqual({ sha256: hash(previous), bytes: previous.length });
    const receipt = await store.recoverCheckpoint(id, hash(previous), checkpoint);
    expect(receipt).toEqual({ backupId: `${id}.${hash(previous)}.yjs`, previousSha256: hash(previous), revision: checkpoint.revision });
    expect(await readFile(join(directory, 'recovery-backups', receipt.backupId))).toEqual(Buffer.from(previous));
    expect(await createFilePersistence(directory).loadRecord(id)).toEqual({ state: checkpoint.state, checkpoint: { revision: checkpoint.revision, base: checkpoint.base } });
  });

  it('does not create a room when the confirmed record no longer exists', async () => {
    const { directory, store, previous } = await setup();
    await rm(join(directory, `${id}.yjs`));
    expect(await store.inspectRecovery(id)).toBeNull();
    await expect(store.recoverCheckpoint(id, hash(previous), checkpoint)).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  });

  it.each(['', '../outside', id.replace('-4aaa-', '-0aaa-')])('rejects invalid storage identity %s', async invalid => {
    const { store } = await setup();
    await expect(store.inspectRecovery(invalid)).rejects.toThrow('identity');
    await expect(store.recoverCheckpoint(invalid, 'a'.repeat(64), checkpoint)).rejects.toThrow('identity');
  });

  it.each([undefined, null, {}, '', 'a'.repeat(63), 'A'.repeat(64), 'a'.repeat(65)])('rejects malformed confirmation without any backup or replacement', async confirmation => {
    const { directory, store, previous } = await setup();
    await expect(store.recoverCheckpoint(id, confirmation, checkpoint)).rejects.toThrow('Invalid recovery confirmation');
    expect(await readFile(join(directory, `${id}.yjs`))).toEqual(Buffer.from(previous));
    expect(await readdir(directory)).toEqual([`${id}.yjs`]);
  });

  it('rejects changed confirmation and invalid replacement before creating a backup', async () => {
    const { directory, store, previous } = await setup();
    await expect(store.recoverCheckpoint(id, 'a'.repeat(64), checkpoint)).rejects.toThrow('record changed');
    await expect(store.recoverCheckpoint(id, hash(previous), { ...checkpoint, revision: 'invalid' })).rejects.toThrow('checkpoint');
    await expect(store.recoverCheckpoint(id, hash(previous), { ...checkpoint, state: new Uint8Array([255]) })).rejects.toThrow('checkpoint');
    expect(await readdir(directory)).toEqual([`${id}.yjs`]);
  });

  it('rejects excessive records without resetting them', async () => {
    const previous = new Uint8Array(MAX_CHECKPOINT_BYTES + 1);
    const { directory, store } = await setup(previous);
    await expect(store.inspectRecovery(id)).rejects.toThrow('inspection unavailable');
    await expect(store.recoverCheckpoint(id, hash(previous), checkpoint)).rejects.toThrow('exceeds budget');
    expect(await readdir(directory)).toEqual([`${id}.yjs`]);
  });

  it('preserves the prior record if backup creation fails', async () => {
    const { directory, store, previous } = await setup();
    faults.backup = true;
    await expect(store.recoverCheckpoint(id, hash(previous), checkpoint)).rejects.toThrow('Recovery backup failed');
    expect(await readFile(join(directory, `${id}.yjs`))).toEqual(Buffer.from(previous));
    expect(await readdir(join(directory, 'recovery-backups'))).toEqual([]);
  });

  it('retains verified backup and original if replacement fails, and safely retries', async () => {
    const { directory, store, previous } = await setup();
    faults.replace = true;
    await expect(store.recoverCheckpoint(id, hash(previous), checkpoint)).rejects.toThrow('Room persistence failed');
    expect(await readFile(join(directory, `${id}.yjs`))).toEqual(Buffer.from(previous));
    expect(await readdir(directory)).toEqual(expect.arrayContaining([`${id}.yjs`, 'recovery-backups']));
    expect((await readdir(directory)).some(file => file.endsWith('.tmp'))).toBe(false);
    faults.replace = false;
    await store.recoverCheckpoint(id, hash(previous), checkpoint);
    expect(await readdir(join(directory, 'recovery-backups'))).toEqual([`${id}.${hash(previous)}.yjs`]);
  });

  it('rejects a conflicting backup rather than trusting its filename', async () => {
    const { directory, store, previous } = await setup();
    faults.replace = true;
    await expect(store.recoverCheckpoint(id, hash(previous), checkpoint)).rejects.toThrow();
    faults.replace = false;
    const backup = join(directory, 'recovery-backups', `${id}.${hash(previous)}.yjs`);
    await writeFile(backup, new Uint8Array([99]));
    await expect(store.recoverCheckpoint(id, hash(previous), checkpoint)).rejects.toThrow('backup verification failed');
    expect(await readFile(join(directory, `${id}.yjs`))).toEqual(Buffer.from(previous));
    expect(await readFile(backup)).toEqual(Buffer.from([99]));
  });

  it('rechecks the source after making its backup and rejects an external change', async () => {
    const { directory, store, previous } = await setup();
    faults.changeAfterBackup = true;
    await expect(store.recoverCheckpoint(id, hash(previous), checkpoint)).rejects.toThrow('record changed');
    expect(await readFile(join(directory, `${id}.yjs`))).toEqual(Buffer.from([1, 2, 3]));
    expect(await readFile(join(directory, 'recovery-backups', `${id}.${hash(previous)}.yjs`))).toEqual(Buffer.from(previous));
  });

  it('serializes competing recoveries and rejects the stale second confirmation', async () => {
    const { store, previous } = await setup();
    const results = await Promise.allSettled([
      store.recoverCheckpoint(id.toUpperCase(), hash(previous), checkpoint),
      store.recoverCheckpoint(id, hash(previous), { ...checkpoint, revision: '2026-10-09T03:00:00Z' }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect((await store.loadRecord(id))?.checkpoint?.revision).toBe(checkpoint.revision);
  });

  it('resumes queued normal writes after a failed recovery without losing the baseline', async () => {
    const { store, previous } = await setup();
    const results = await Promise.allSettled([
      store.recoverCheckpoint(id, 'a'.repeat(64), checkpoint),
      store.saveCheckpoint(id, checkpoint),
      store.save(id, previous),
    ]);
    expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect((await store.loadRecord(id))?.checkpoint?.revision).toBe(checkpoint.revision);
  });

  it('captures the approved replacement before waiting for another room write', async () => {
    const { store, previous } = await setup();
    let release: () => void = () => { throw new Error('Not initialized'); };
    faults.pauseWrite = new Promise<void>(resolve => { release = resolve; });
    const saving = store.save(id, previous);
    const mutable = { ...checkpoint, base: Uint8Array.from(checkpoint.base), state: Uint8Array.from(checkpoint.state) };
    const recovery = store.recoverCheckpoint(id, hash(previous), mutable);
    mutable.base[0] = 255; mutable.state[0] = 255;
    release();
    await saving; await recovery;
    expect(await store.loadRecord(id)).toEqual({ state: checkpoint.state, checkpoint: { revision: checkpoint.revision, base: checkpoint.base } });
  });
});
