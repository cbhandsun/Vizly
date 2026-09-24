import type { StandardDiagramData } from '@vizly/core/types';
import {
  coerceCustomPresetMap,
  readCustomPresetMap,
} from '@vizly/core/storage';
import { logUiStorageReadFailure } from '@vizly/core/logging';

export const LEGACY_CUSTOM_STANDARD_PRESETS_STORAGE_KEY = 'GenericStandardDiagram.customPresets';

const parseLegacyCustomPresetMap = (
  storage: Pick<Storage, 'getItem'>,
): Record<string, StandardDiagramData> => {
  const raw = storage.getItem(LEGACY_CUSTOM_STANDARD_PRESETS_STORAGE_KEY);
  if (!raw) return {};

  try {
    return coerceCustomPresetMap(JSON.parse(raw) as unknown);
  } catch (error) {
    logUiStorageReadFailure(
      'customStandardPresets',
      LEGACY_CUSTOM_STANDARD_PRESETS_STORAGE_KEY,
      error,
    );
    return {};
  }
};

export const readStandardizedCustomPresetMap = (
  storage: Pick<Storage, 'getItem'> = localStorage,
): Record<string, StandardDiagramData> => {
  const normalized = readCustomPresetMap(storage);
  const legacy = parseLegacyCustomPresetMap(storage);

  return {
    ...legacy,
    ...normalized,
  };
};
