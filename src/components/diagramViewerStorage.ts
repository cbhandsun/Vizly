import { AUTOSAVE_PREFIX, type AutoSavePayload } from '@/core/utils/autoSaveStorage';
import { logUiStorageWriteFailure } from '@/core/utils/uiStorageLogging';

const CUSTOM_PRESET_PREFIX = 'GenericStandardDiagram.customPresets.';

export const getDiagramAutoSaveStorageKey = (diagramId: string): string => `${AUTOSAVE_PREFIX}${diagramId}`;

export const clearPreviousDiagramAutoSave = (
  storage: Pick<Storage, 'removeItem'>,
  currentDiagramId: string,
  nextDiagramId: string
): void => {
  const oldStorageKey = getDiagramAutoSaveStorageKey(currentDiagramId);
  if (oldStorageKey === getDiagramAutoSaveStorageKey(nextDiagramId)) return;

  try {
    storage.removeItem(oldStorageKey);
  } catch (error) {
    logUiStorageWriteFailure('DiagramViewer.clearPreviousDiagramAutoSave', oldStorageKey, error);
  }
};

export const persistDiagramFreshSeed = (
  storage: Pick<Storage, 'setItem'>,
  diagramId: string,
  payload: AutoSavePayload | null
): void => {
  if (!payload) return;

  const storageKey = getDiagramAutoSaveStorageKey(diagramId);
  try {
    storage.setItem(storageKey, JSON.stringify(payload));
  } catch (error) {
    logUiStorageWriteFailure('DiagramViewer.persistDiagramFreshSeed', storageKey, error);
  }
};

export const clearBlankTemplateLocalState = (
  storage: Pick<Storage, 'removeItem'>,
  diagramId: string
): void => {
  const keys = [
    getDiagramAutoSaveStorageKey(diagramId),
    `${CUSTOM_PRESET_PREFIX}${diagramId}`,
  ];

  keys.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch (error) {
      logUiStorageWriteFailure('DiagramViewer.clearBlankTemplateLocalState', key, error);
    }
  });
};
