import { describe, expect, it } from 'vitest';

import { resolvePluginId } from '../registry';

describe('resolvePluginId', () => {
  it.each([
    'logistics',
    'logistics-planning',
    'systems-interaction',
    'tms',
    'transport-driven',
    'wms',
    'wms-process',
  ])('loads only the flowchart plugin for the standard business type %s', (docType) => {
    expect(resolvePluginId(docType)).toBe('flowchart');
  });

  it('preserves specialized plugin mappings', () => {
    expect(resolvePluginId('architecture')).toBe('architecture-diagram');
    expect(resolvePluginId('mindmap')).toBe('mindmap');
    expect(resolvePluginId('unknown')).toBeUndefined();
  });
});
