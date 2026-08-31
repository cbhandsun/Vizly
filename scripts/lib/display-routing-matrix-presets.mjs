export const DISPLAY_ROUTING_MATRIX_PRESET_TARGETS = Object.freeze([
  Object.freeze({
    presetId: 'logistics-architecture-v1',
    sourcePath: 'src/data/standardized/LogisticsStandardData.json',
    semanticChains: Object.freeze([Object.freeze(['upstream', 'l-oms', 'visibility', 'downstream'])]),
  }),
  Object.freeze({
    presetId: 'wms-demand-allocation-strategy-v2',
    sourcePath: 'src/data/standardized/DeamndAllocation.json',
    semanticChains: Object.freeze([Object.freeze([
      'start-calc', 'init-data', 'check-inv-sufficiency', 'calc-theory-ratio', 'sort-demand',
      'check-limit', 'pool-b-entry', 'merge-res', 'alloc-mixed', 'check-source', 'task-direct-b', 'end-wms',
    ])]),
  }),
  Object.freeze({
    presetId: 'wms-process-flow-v1',
    sourcePath: 'src/data/standardized/WmsProcessFlowStandardData.json',
    semanticChains: Object.freeze([Object.freeze([
      'order-input', 'allocation', 'task-generate', 'task-group', 'operation', 'labor-kpi',
    ])]),
  }),
  Object.freeze({
    presetId: 'tms-architecture-v1',
    sourcePath: 'src/data/standardized/TmsStandardData.json',
    semanticChains: Object.freeze([Object.freeze([
      'upstream-systems', 'logistics-oms', 'wms-outbound', 'tms-planning', 'tms-execution',
      'tms-delivery', 'performance-analysis', 'bi-report',
    ])]),
  }),
]);
