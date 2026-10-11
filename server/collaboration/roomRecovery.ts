import type { AuthorizeDiagram } from './authorization.js';
import { isRecord } from './boundary.js';
import type { RecoverableCheckpointPersistence } from './persistence.js';
import type { BootstrapIdentity } from './roomBootstrap.js';
import { compareCloudCheckpointRevisions, encodeRoomCheckpoint, type RoomCheckpoint } from './roomCheckpoint.js';
import { RecoveryRecordChangedError } from './roomRecoveryStore.js';

export interface RecoveryConfirmation { sha256: string; revision: string }
export class RecoveryRejectedError extends Error {
  constructor(readonly status: 400 | 403 | 409) { super('Recovery rejected'); }
}
export const parseRecoveryConfirmation = (input: unknown): RecoveryConfirmation => {
  if (!isRecord(input) || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'sha256') || !Object.hasOwn(input, 'revision') || typeof input.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(input.sha256) || typeof input.revision !== 'string') throw new RecoveryRejectedError(400);
  try { compareCloudCheckpointRevisions(input.revision, input.revision); }
  catch { throw new RecoveryRejectedError(400); }
  return { sha256: input.sha256, revision: input.revision };
};

/** Only server-read cloud data can become the replacement. Callers hold an idle-room reservation. */
export const createRoomRecovery = (options: {
  authorizeOwner: AuthorizeDiagram;
  persistence: RecoverableCheckpointPersistence;
  readCloud: (identity: BootstrapIdentity) => Promise<RoomCheckpoint>;
  readRevision: (identity: BootstrapIdentity) => Promise<string>;
}) => {
  const owner = async (identity: BootstrapIdentity) => {
    const permission = await options.authorizeOwner(identity.token, identity.diagramId);
    if (!permission || permission.role !== 'editor' || permission.userId !== identity.userId) throw new RecoveryRejectedError(403);
  };
  const cloud = async (identity: BootstrapIdentity) => {
    const checkpoint = await options.readCloud(identity);
    encodeRoomCheckpoint(checkpoint);
    if (!Buffer.from(checkpoint.base).equals(Buffer.from(checkpoint.state))) throw new Error('Invalid recovery source');
    return checkpoint;
  };
  return {
    async inspect(identity: BootstrapIdentity, signal?: AbortSignal) {
      signal?.throwIfAborted();
      await owner(identity);
      signal?.throwIfAborted();
      const record = await options.persistence.inspectRecovery(identity.diagramId);
      if (!record) throw new RecoveryRejectedError(409);
      const checkpoint = await cloud(identity);
      await owner(identity);
      signal?.throwIfAborted();
      return { ...record, revision: checkpoint.revision };
    },
    async recover(identity: BootstrapIdentity, input: unknown, signal?: AbortSignal) {
      signal?.throwIfAborted();
      const confirmation = parseRecoveryConfirmation(input);
      await owner(identity);
      signal?.throwIfAborted();
      const checkpoint = await cloud(identity);
      if (compareCloudCheckpointRevisions(checkpoint.revision, confirmation.revision) !== 0) throw new RecoveryRejectedError(409);
      const revision = await options.readRevision(identity);
      if (compareCloudCheckpointRevisions(revision, confirmation.revision) !== 0) throw new RecoveryRejectedError(409);
      await owner(identity);
      signal?.throwIfAborted();
      try { return await options.persistence.recoverCheckpoint(identity.diagramId, confirmation.sha256, checkpoint); }
      catch (error: unknown) {
        if (error instanceof RecoveryRecordChangedError) throw new RecoveryRejectedError(409);
        throw error;
      }
    },
  };
};
