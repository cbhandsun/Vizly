export const PRECOMPILED_DISPLAY_ROUTE_TARGETS = [
  {
    presetId: 'wms-process-flow-v1',
    sourcePath: 'src/data/standardized/WmsProcessFlowStandardData.json',
    variantId: 'initial',
  },
  {
    presetId: 'logistics-architecture-v1',
    sourcePath: 'src/data/standardized/LogisticsStandardData.json',
    variantId: 'initial',
  },
  {
    presetId: 'wms-demand-allocation-strategy-v2',
    sourcePath: 'src/data/standardized/DeamndAllocation.json',
    variantId: 'initial',
  },
];

export const PRECOMPILED_DISPLAY_ROUTE_LAYOUT_TARGETS = [
  {
    presetId: 'wms-process-flow-v1',
    sourcePath: 'src/data/standardized/WmsProcessFlowStandardData.json',
    variantId: 'domain-lanes-lr',
  },
];

export const PRECOMPILED_DISPLAY_ROUTE_GENERATION_TARGETS = [
  ...PRECOMPILED_DISPLAY_ROUTE_TARGETS,
  ...PRECOMPILED_DISPLAY_ROUTE_LAYOUT_TARGETS,
];
