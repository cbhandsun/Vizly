import { logUiStorageReadFailure, logUiStorageWriteFailure } from '../utils/uiStorageLogging';

export const logPanelZoomStorageReadFailure = (storageKey: string, error: unknown): void => {
  logUiStorageReadFailure('usePanelZoom', storageKey, error);
};

export const logPanelZoomStorageWriteFailure = (storageKey: string, error: unknown): void => {
  logUiStorageWriteFailure('usePanelZoom', storageKey, error);
};
