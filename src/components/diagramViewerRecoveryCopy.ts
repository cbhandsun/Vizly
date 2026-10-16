import { getFlowDataBridge } from '@vizly/core/diagram-data';
import { parseRemoteDiagramContent } from '@/services/remoteDiagramContent';
import { localDB } from '@/services/IndexedDBStorage';
import { createDiagramViewerSaveCopy, isDiagramViewerBridgeSavable } from './diagramViewerSave';
import { assertVersionPreviewPersistenceAllowed } from './diagrams/collaboration/versionPreviewSession';
import { CollaborationRecoveryError } from './diagrams/collaboration/collaborationRecoveryClient';

/** Capture before awaiting storage, and acknowledge only after a committed copy can be read back. */
export const saveDiagramViewerRecoveryCopy = async (diagramId: string): Promise<string> => {
  try {
    assertVersionPreviewPersistenceAllowed(diagramId);
    const bridge = getFlowDataBridge(diagramId);
    if (!isDiagramViewerBridgeSavable(bridge)) throw new CollaborationRecoveryError('copyFailed');
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const title = `${typeof bridge.name === 'string' ? bridge.name.slice(0, 420) : 'Diagram'} · Recovery ${createdAt}`;
    const copy = createDiagramViewerSaveCopy({ bridge, name: title, createId: () => id });
    delete copy.metadata.cloud;
    copy.metadata.createdAt = createdAt;
    copy.metadata.updatedAt = createdAt;
    const snapshot = parseRemoteDiagramContent(copy, { id, title });
    snapshot.isReadonly = false;
    const { dataRegistry } = await import('@/data/DataRegistry');
    await dataRegistry.initialize();
    await dataRegistry.getDataService().registerDiagram(snapshot, true);
    const stored = await localDB.loadDiagram(id);
    if (JSON.stringify(stored) !== JSON.stringify(snapshot)) throw new CollaborationRecoveryError('copyFailed');
    return id;
  } catch { throw new CollaborationRecoveryError('copyFailed'); }
};
