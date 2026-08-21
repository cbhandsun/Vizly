import { coerceDiagramId } from '../../utils/inputBoundary';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from '../../utils/uiStorageLogging';

const EMPTY_GUIDE_STORAGE_PREFIX = 'vizly_mindmap_empty_guide_dismissed_v1:';
const DISMISSED_VALUE = '1';

type EmptyGuideStorage = Pick<Storage, 'getItem' | 'setItem'>;

const getBrowserStorage = (): EmptyGuideStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (error) {
    logUiStorageReadFailure(
      'mindMapEmptyGuidePreference.getBrowserStorage',
      EMPTY_GUIDE_STORAGE_PREFIX,
      error,
    );
    return null;
  }
};

const createStorageKey = (diagramId: unknown): string | null => {
  const safeDiagramId = coerceDiagramId(diagramId);
  return safeDiagramId
    ? `${EMPTY_GUIDE_STORAGE_PREFIX}${encodeURIComponent(safeDiagramId)}`
    : null;
};

export const isMindMapEmptyGuideDismissed = (
  diagramId: unknown,
  storage: EmptyGuideStorage | null = getBrowserStorage(),
): boolean => {
  const key = createStorageKey(diagramId);
  if (!key || !storage) return false;
  try {
    return storage.getItem(key) === DISMISSED_VALUE;
  } catch (error) {
    logUiStorageReadFailure(
      'mindMapEmptyGuidePreference.read',
      EMPTY_GUIDE_STORAGE_PREFIX,
      error,
    );
    return false;
  }
};

export const dismissMindMapEmptyGuide = (
  diagramId: unknown,
  storage: EmptyGuideStorage | null = getBrowserStorage(),
): boolean => {
  const key = createStorageKey(diagramId);
  if (!key || !storage) return false;
  try {
    storage.setItem(key, DISMISSED_VALUE);
    return true;
  } catch (error) {
    logUiStorageWriteFailure(
      'mindMapEmptyGuidePreference.dismiss',
      EMPTY_GUIDE_STORAGE_PREFIX,
      error,
    );
    return false;
  }
};
