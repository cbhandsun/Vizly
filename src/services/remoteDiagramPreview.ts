import {
  fetchRemoteDiagramPreview as fetchRemoteDiagramPreviewFromSource,
  invalidateRemoteDiagramPreview,
  type RemoteDiagramPreview,
} from '@/core/utils/remoteDiagramPreview';

let unifiedStorageModulePromise: Promise<typeof import('./UnifiedStorageService')> | null = null;

const loadRemoteDiagram = async (storageId: string): Promise<unknown> => {
  unifiedStorageModulePromise ??= import('./UnifiedStorageService');
  const { unifiedStorage } = await unifiedStorageModulePromise;
  return unifiedStorage.loadDiagram(storageId);
};

export const fetchRemoteDiagramPreview = (
  storageId: string,
): Promise<RemoteDiagramPreview | null> => (
  fetchRemoteDiagramPreviewFromSource(storageId, loadRemoteDiagram)
);

export {
  invalidateRemoteDiagramPreview,
  type RemoteDiagramPreview,
};
