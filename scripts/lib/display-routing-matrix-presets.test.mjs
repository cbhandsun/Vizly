import { describe, expect, it } from 'vitest';

import { DISPLAY_ROUTING_MATRIX_PRESET_TARGETS } from './display-routing-matrix-presets.mjs';

describe('display routing matrix presets', () => {
  it('includes Logistics alongside both WMS fixtures and TMS', () => {
    expect(DISPLAY_ROUTING_MATRIX_PRESET_TARGETS.map(target => target.presetId)).toEqual([
      'logistics-architecture-v1',
      'wms-demand-allocation-strategy-v2',
      'wms-process-flow-v1',
      'tms-architecture-v1',
    ]);
  });

  it('keeps every source path bounded to standardized JSON fixtures', () => {
    for (const target of DISPLAY_ROUTING_MATRIX_PRESET_TARGETS) {
      expect(target.sourcePath).toMatch(/^src\/data\/standardized\/[A-Za-z]+\.json$/);
    }
  });
});
