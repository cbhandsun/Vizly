// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { RecoverableCheckpointPersistence } from './persistence.js';
import { createRoomRecovery, parseRecoveryConfirmation } from './roomRecovery.js';

const identity = { diagramId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token: 'synthetic-owner', userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const sha256 = 'a'.repeat(64);
const checkpoint = { revision: '2026-10-09T02:04:07.212Z', base: new Uint8Array([0, 0]), state: new Uint8Array([0, 0]) };
const fixture = () => {
  const authorizeOwner = vi.fn(async () => ({ userId: identity.userId, role: 'editor' as const }));
  const recoverCheckpoint = vi.fn(async () => ({ backupId: 'synthetic-backup', previousSha256: sha256, revision: checkpoint.revision }));
  const persistence: RecoverableCheckpointPersistence = {
    load: vi.fn(async () => null), save: vi.fn(async () => undefined), loadRecord: vi.fn(async () => null),
    saveCheckpoint: vi.fn(async () => undefined), inspectRecovery: vi.fn(async () => ({ sha256, bytes: 2 })), recoverCheckpoint,
  };
  const readCloud = vi.fn(async () => checkpoint);
  const readRevision = vi.fn(async () => checkpoint.revision);
  return { authorizeOwner, persistence, readCloud, readRevision, recoverCheckpoint };
};
describe('owner-authorized cloud checkpoint recovery', () => {
  it('inspects without writing and recovers only server-read content after fresh owner and revision checks', async () => {
    const f = fixture(); const recovery = createRoomRecovery(f);
    expect(await recovery.inspect(identity)).toEqual({ sha256, bytes: 2, revision: checkpoint.revision });
    expect(f.recoverCheckpoint).not.toHaveBeenCalled();
    await recovery.recover(identity, { sha256, revision: checkpoint.revision });
    expect(f.recoverCheckpoint).toHaveBeenCalledWith(identity.diagramId, sha256, checkpoint);
    expect(f.authorizeOwner).toHaveBeenCalledTimes(4);
    expect(f.readRevision).toHaveBeenCalledWith(identity);
  });
  it.each([null, {}, [], '', { sha256 }, { sha256, revision: 'invalid' }, { sha256: 'A'.repeat(64), revision: checkpoint.revision },
    { sha256, revision: checkpoint.revision, state: [0, 0] }])('rejects invalid or client-supplied replacement input before reading data', async input => {
    const f = fixture();
    expect(() => parseRecoveryConfirmation(input)).toThrow();
    await expect(createRoomRecovery(f).recover(identity, input)).rejects.toMatchObject({ status: 400 });
    expect(f.authorizeOwner).not.toHaveBeenCalled(); expect(f.recoverCheckpoint).not.toHaveBeenCalled();
  });
  it('denies outsider and mismatched identities without disclosing the record', async () => {
    const f = fixture(); f.authorizeOwner.mockResolvedValue({ userId: 'different-user', role: 'editor' });
    await expect(createRoomRecovery(f).inspect(identity)).rejects.toMatchObject({ status: 403 });
    await expect(createRoomRecovery(f).recover(identity, { sha256, revision: checkpoint.revision })).rejects.toMatchObject({ status: 403 });
    expect(f.persistence.inspectRecovery).not.toHaveBeenCalled(); expect(f.readCloud).not.toHaveBeenCalled();
  });
  it('rechecks ownership after asynchronous preparation and rejects revocation', async () => {
    const f = fixture(); f.authorizeOwner.mockResolvedValueOnce({ userId: identity.userId, role: 'editor' }).mockResolvedValue({ userId: 'revoked', role: 'editor' });
    await expect(createRoomRecovery(f).recover(identity, { sha256, revision: checkpoint.revision })).rejects.toMatchObject({ status: 403 });
    expect(f.recoverCheckpoint).not.toHaveBeenCalled();
  });
  it('rejects a different cloud snapshot than the one the owner confirmed', async () => {
    const f = fixture();
    await expect(createRoomRecovery(f).recover(identity, { sha256, revision: '2026-10-09T02:00:00Z' })).rejects.toMatchObject({ status: 409 });
    expect(f.readRevision).not.toHaveBeenCalled(); expect(f.recoverCheckpoint).not.toHaveBeenCalled();
  });
  it('rejects cloud changes during preparation, including a backwards revision', async () => {
    for (const revision of ['2026-10-09T03:00:00Z', '2026-10-09T02:00:00Z']) {
      const f = fixture(); f.readRevision.mockResolvedValue(revision);
      await expect(createRoomRecovery(f).recover(identity, { sha256, revision: checkpoint.revision })).rejects.toMatchObject({ status: 409 });
      expect(f.recoverCheckpoint).not.toHaveBeenCalled();
    }
  });
  it('does not replace a record when cloud content or inspection is unavailable', async () => {
    const f = fixture(); f.readCloud.mockRejectedValue(new Error('Synthetic private provider detail'));
    await expect(createRoomRecovery(f).recover(identity, { sha256, revision: checkpoint.revision })).rejects.toThrow();
    expect(f.recoverCheckpoint).not.toHaveBeenCalled();
  });
  it('rejects invalid server checkpoint content before any backup or write', async () => {
    const f = fixture(); f.readCloud.mockResolvedValue({ ...checkpoint, state: new Uint8Array([255]) });
    await expect(createRoomRecovery(f).recover(identity, { sha256, revision: checkpoint.revision })).rejects.toThrow('checkpoint');
    expect(f.recoverCheckpoint).not.toHaveBeenCalled();
  });
  it('cancels before committing when the request is aborted during cloud preparation', async () => {
    const f = fixture(); const abort = new AbortController();
    f.readRevision.mockImplementation(async () => { abort.abort(); return checkpoint.revision; });
    await expect(createRoomRecovery(f).recover(identity, { sha256, revision: checkpoint.revision }, abort.signal)).rejects.toThrow();
    expect(f.recoverCheckpoint).not.toHaveBeenCalled();
  });
});
