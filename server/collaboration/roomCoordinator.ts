import type { CheckpointPersistence } from './persistence.js';
import type { BootstrapIdentity } from './roomBootstrap.js';
import { compareCloudCheckpointRevisions, type RoomCheckpoint } from './roomCheckpoint.js';
import { CloudRoomConflictError } from './cloudRoomReconciliation.js';
import { reconcileRoomCheckpoint } from './roomCheckpointCoordination.js';
import { acceptPersistedRoomState } from './acceptedRoomState.js';

/** Cold-room admission only; active-room revision monitoring is separate. */
export const createRoomCoordinator = (
  persistence: CheckpointPersistence,
  readCloud: (identity: BootstrapIdentity) => Promise<RoomCheckpoint>,
) => async (identity: BootstrapIdentity, liveState?: Uint8Array): Promise<Uint8Array> => {
  if (persistence.coordinateCheckpoint) {
    return persistence.coordinateCheckpoint(identity.diagramId, await readCloud(identity), liveState);
  }
  const stored = await persistence.loadRecord(identity.diagramId);
  const cloud = await readCloud(identity);
  const checkpoint = reconcileRoomCheckpoint(stored, cloud, liveState);
  const receipt = await persistence.saveCheckpoint(identity.diagramId, checkpoint);
  return acceptPersistedRoomState(checkpoint.state, receipt);
};

export const createActiveRoomCoordinator = (
  persistence: CheckpointPersistence,
  readRevision: (identity: BootstrapIdentity) => Promise<string>,
  coordinate: ReturnType<typeof createRoomCoordinator>,
) => async (identity: BootstrapIdentity, liveState: Uint8Array): Promise<Uint8Array | null> => {
  const stored = await persistence.loadRecord(identity.diagramId);
  if (!stored?.checkpoint) throw new CloudRoomConflictError();
  const revision = await readRevision(identity);
  const comparison = compareCloudCheckpointRevisions(revision, stored.checkpoint.revision);
  if (comparison < 0) throw new CloudRoomConflictError();
  if (comparison === 0) return null;
  return coordinate(identity, liveState);
};
