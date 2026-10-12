import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encodeRoomCheckpoint, MAX_CHECKPOINT_BYTES, type RoomCheckpoint } from './roomCheckpoint.js';

export interface RecoveryInspection { sha256: string; bytes: number }
export interface RecoveryReceipt { backupId: string; previousSha256: string; revision: string }
export class RecoveryRecordChangedError extends Error { constructor() { super('Recovery record changed'); } }
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const missing = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
const alreadyExists = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';

/** The caller must own the idle room and serialize this with all room writes.
 * No authorization is inferred from a digest or from access to the filesystem.
 */
export const createRoomRecoveryStore = (
  root: string,
  roomPath: (id: string) => string,
  replace: (id: string, bytes: Uint8Array) => Promise<void>,
) => {
  const readBounded = async (file: string) => {
    if ((await stat(file)).size > MAX_CHECKPOINT_BYTES) throw new Error('Recovery record exceeds budget');
    const bytes = await readFile(file);
    if (bytes.byteLength > MAX_CHECKPOINT_BYTES) throw new Error('Recovery record exceeds budget');
    return bytes;
  };
  return {
    async inspect(id: string): Promise<RecoveryInspection | null> {
      const file = roomPath(id);
      try {
        const bytes = await readBounded(file);
        return { sha256: digest(bytes), bytes: bytes.byteLength };
      } catch (error: unknown) {
        if (missing(error)) return null;
        throw new Error('Recovery inspection unavailable', { cause: error });
      }
    },
    async recover(id: string, expectedSha256: unknown, checkpoint: RoomCheckpoint): Promise<RecoveryReceipt> {
      const file = roomPath(id);
      if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('Invalid recovery confirmation');
      // Copy and validate the replacement before awaiting external work. A
      // caller mutating its original buffers cannot change the approved write.
      const replacement = encodeRoomCheckpoint(checkpoint);
      const revision = checkpoint.revision;
      const previous = await readBounded(file);
      if (digest(previous) !== expectedSha256) throw new RecoveryRecordChangedError();
      const backupId = `${id.toLowerCase()}.${expectedSha256}.yjs`;
      const directory = resolve(root, 'recovery-backups');
      const backup = resolve(directory, backupId);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      try { await writeFile(backup, previous, { flag: 'wx', mode: 0o600, flush: true }); }
      catch (error: unknown) {
        if (!alreadyExists(error)) throw new Error('Recovery backup failed', { cause: error });
      }
      // A retry may reuse the exact verified backup, never an unrelated file.
      if (digest(await readBounded(backup)) !== expectedSha256) throw new Error('Recovery backup verification failed');
      if (digest(await readBounded(file)) !== expectedSha256) throw new RecoveryRecordChangedError();
      await replace(id, replacement);
      return { backupId, previousSha256: expectedSha256, revision };
    },
  };
};
