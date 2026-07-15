import { describe, expect, it } from 'vitest';

import {
  getStandardPresetDocTypeById,
  isStandardPresetId,
  resolvePresetKey,
} from '../presetMetadata';

describe('presetMetadata', () => {
  it.each([
    ['enterprise-architecture-v2', 'ArchitectureStandardData', 'architecture'],
    ['blank-canvas-template', 'BlankCanvasStandardData', 'flowchart'],
    ['logistics-planning-v1', 'LogisticsPlanningStandardData', 'logistics-planning'],
    ['logistics-architecture-v1', 'LogisticsStandardData', 'logistics'],
    ['systems-interaction-v1', 'SystemsInteractionStandardData', 'systems-interaction'],
    ['tms-architecture-v1', 'TmsStandardData', 'tms'],
    ['transport-driven-v1', 'TransportDrivenStandardData', 'transport-driven'],
    ['wms-e2e-solution', 'WmsStandardData', 'wms'],
    ['wms-order-to-task-flow', 'WmsOrderToTaskFlowData', 'wms-process'],
    ['wms-process-flow-v1', 'WmsProcessFlowStandardData', 'wms-process'],
  ])('recognizes the persisted diagram id %s without using DataRegistry', (id, key, docType) => {
    expect(isStandardPresetId(id)).toBe(true);
    expect(resolvePresetKey(id)).toBe(key);
    expect(getStandardPresetDocTypeById(id)).toBe(docType);
  });

  it('rejects unknown ids instead of guessing a preset', () => {
    expect(isStandardPresetId('custom-diagram')).toBe(false);
    expect(resolvePresetKey('custom-diagram')).toBeUndefined();
    expect(getStandardPresetDocTypeById('custom-diagram')).toBeUndefined();
  });
});
