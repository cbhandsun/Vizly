import { describe, expect, it } from 'vitest';

import {
  getStandardPresetCatalogItemById,
  getStandardPresetDocTypeById,
  isStandardPresetId,
  resolvePresetKey,
  STANDARD_PRESET_CATALOG,
} from '../presetMetadata';

describe('presetMetadata', () => {
  it.each([
    ['enterprise-architecture-v2', 'ArchitectureStandardData', 'architecture'],
    ['blank-canvas-template', 'BlankCanvasStandardData', 'flowchart'],
    ['wms-demand-allocation-strategy-v2', 'DeamndAllocation', 'architecture'],
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
    expect(getStandardPresetCatalogItemById('custom-diagram')).toBeUndefined();
  });

  it('exposes a lightweight catalog for every standard preset and resolves aliases', () => {
    expect(STANDARD_PRESET_CATALOG).toHaveLength(11);
    expect(new Set(STANDARD_PRESET_CATALOG.map(item => item.key))).toEqual(
      new Set([
        'ArchitectureStandardData',
        'BlankCanvasStandardData',
        'DeamndAllocation',
        'LogisticsPlanningStandardData',
        'LogisticsStandardData',
        'SystemsInteractionStandardData',
        'TmsStandardData',
        'TransportDrivenStandardData',
        'WmsOrderToTaskFlowData',
        'WmsProcessFlowStandardData',
        'WmsStandardData',
      ]),
    );
    expect(getStandardPresetCatalogItemById('supply-chain-arch')).toMatchObject({
      key: 'LogisticsStandardData',
      id: 'logistics-architecture-v1',
      titleKey: 'diagram.title.logisticsArchitecture',
    });
  });
});
