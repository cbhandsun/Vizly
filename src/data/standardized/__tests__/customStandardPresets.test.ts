import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CUSTOM_PRESETS_STORAGE_KEY } from '@/core/utils/customPresetStorage';
import {
  LEGACY_CUSTOM_STANDARD_PRESETS_STORAGE_KEY,
  readStandardizedCustomPresetMap,
} from '../customStandardPresets';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

const makePreset = (id: string) => ({
  id,
  name: id,
  type: 'flowchart',
  version: '1.0.0',
  nodes: [{ id: 'n1', description: 'Node', type: 'flowchart', domain: 'default' }],
  edges: [],
});

describe('customStandardPresets', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.values(safeLogState).forEach(mock => mock.mockReset());
  });

  it('loads normalized presets from the shared custom preset storage', () => {
    localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify({
      Workspace: makePreset('workspace-id'),
    }));

    expect(readStandardizedCustomPresetMap()).toMatchObject({
      Workspace: expect.objectContaining({ id: 'workspace-id' }),
    });
  });

  it('falls back to the legacy standardized storage key', () => {
    localStorage.setItem(LEGACY_CUSTOM_STANDARD_PRESETS_STORAGE_KEY, JSON.stringify({
      Legacy: makePreset('legacy-id'),
    }));

    expect(readStandardizedCustomPresetMap()).toMatchObject({
      Legacy: expect.objectContaining({ id: 'legacy-id' }),
    });
  });

  it('prefers normalized shared storage when both keys contain the same preset name', () => {
    localStorage.setItem(LEGACY_CUSTOM_STANDARD_PRESETS_STORAGE_KEY, JSON.stringify({
      Workspace: makePreset('legacy-id'),
    }));
    localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify({
      Workspace: makePreset('normalized-id'),
    }));

    expect(readStandardizedCustomPresetMap().Workspace.id).toBe('normalized-id');
  });

  it('treats malformed legacy storage as empty and logs the read failure', () => {
    localStorage.setItem(LEGACY_CUSTOM_STANDARD_PRESETS_STORAGE_KEY, '{broken');

    expect(readStandardizedCustomPresetMap()).toEqual({});
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[customStandardPresets] Failed to read "GenericStandardDiagram.customPresets":',
      expect.anything(),
    );
  });
});
