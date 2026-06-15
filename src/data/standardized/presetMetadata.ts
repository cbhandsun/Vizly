export const STANDARD_PRESET_KEYS = [
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
] as const;

export type StandardPresetKey = typeof STANDARD_PRESET_KEYS[number];

export const PRESET_DOC_TYPES: Record<StandardPresetKey, string> = {
  ArchitectureStandardData: 'architecture',
  BlankCanvasStandardData: 'flowchart',
  DeamndAllocation: 'architecture',
  LogisticsPlanningStandardData: 'logistics-planning',
  LogisticsStandardData: 'logistics',
  SystemsInteractionStandardData: 'systems-interaction',
  TmsStandardData: 'tms',
  TransportDrivenStandardData: 'transport-driven',
  WmsOrderToTaskFlowData: 'wms-process',
  WmsProcessFlowStandardData: 'wms-process',
  WmsStandardData: 'wms',
};

export const PRESET_ID_ALIASES: Record<string, StandardPresetKey> = {
  'enterprise-architecture': 'ArchitectureStandardData',
  'logistics-planning': 'LogisticsPlanningStandardData',
  'supply-chain-arch': 'LogisticsStandardData',
  'wms-e2e-solution': 'WmsStandardData',
  'wms-architecture': 'WmsStandardData',
  'wms-demand-allocation-strategy-v2': 'DeamndAllocation',
  'wms-order-to-task-flow': 'WmsOrderToTaskFlowData',
  'wms-process-flow-v1': 'WmsProcessFlowStandardData',
};

const STANDARD_PRESET_KEY_SET = new Set<string>(STANDARD_PRESET_KEYS);

export const resolvePresetKey = (id?: string): StandardPresetKey | undefined => {
  if (!id) return undefined;
  return STANDARD_PRESET_KEY_SET.has(id) ? id as StandardPresetKey : PRESET_ID_ALIASES[id];
};

export const isStandardPresetId = (id?: string): boolean => {
  return Boolean(resolvePresetKey(id));
};

export const getStandardPresetDocTypeById = (id?: string): string | undefined => {
  const key = resolvePresetKey(id);
  return key ? PRESET_DOC_TYPES[key] : undefined;
};
