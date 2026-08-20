import { describe, expect, it, vi } from 'vitest';

import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { loadLayoutPresetMapForDiagram } from '../layoutPresetMapLoader';

const preset = {
  id: 'wms-demand-allocation-strategy-v2',
  name: 'Demand allocation',
  type: 'architecture',
  version: '1',
  nodes: [],
  edges: [],
  layout: {
    type: 'hierarchical',
    direction: 'TB',
    spacing: { horizontal: 80, vertical: 80 },
    padding: { horizontal: 40, vertical: 40 },
  },
  theme: { name: 'test', displayName: 'Test', domains: {} },
} satisfies StandardDiagramData;

describe('loadLayoutPresetMapForDiagram', () => {
  it('loads only the requested standard preset and skips the eager catalog', async () => {
    const loadStandardPreset = vi.fn(async () => preset);
    const loadFallbackPresetMap = vi.fn(async () => ({ fallback: preset }));

    await expect(loadLayoutPresetMapForDiagram(' DeamndAllocation ', {
      loadStandardPreset,
      loadFallbackPresetMap,
    })).resolves.toEqual({
      DeamndAllocation: preset,
      'wms-demand-allocation-strategy-v2': preset,
    });
    expect(loadStandardPreset).toHaveBeenCalledWith('DeamndAllocation');
    expect(loadFallbackPresetMap).not.toHaveBeenCalled();
  });

  it('preserves the full-map fallback for custom diagrams', async () => {
    const fallbackMap = { 'custom:demo': preset };
    const loadStandardPreset = vi.fn(async () => null);
    const loadFallbackPresetMap = vi.fn(async () => fallbackMap);

    await expect(loadLayoutPresetMapForDiagram('custom:demo', {
      loadStandardPreset,
      loadFallbackPresetMap,
    })).resolves.toBe(fallbackMap);
    expect(loadFallbackPresetMap).toHaveBeenCalledTimes(1);
  });

  it('does not pass an empty identifier to the standard preset boundary', async () => {
    const loadStandardPreset = vi.fn(async () => preset);
    const loadFallbackPresetMap = vi.fn(async () => ({}));

    await expect(loadLayoutPresetMapForDiagram('   ', {
      loadStandardPreset,
      loadFallbackPresetMap,
    })).resolves.toEqual({});
    expect(loadStandardPreset).not.toHaveBeenCalled();
  });
});
