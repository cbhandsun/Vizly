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

export type StandardPresetCategory = 'general' | 'architecture' | 'logistics' | 'warehouse';

export interface StandardPresetCatalogItem {
  key: StandardPresetKey;
  id: string;
  titleKey: string;
  fallbackTitle: string;
  category: StandardPresetCategory;
}

export const STANDARD_PRESET_CATALOG = [
  {
    key: 'ArchitectureStandardData',
    id: 'enterprise-architecture-v2',
    titleKey: 'diagram.title.enterpriseArchitecture',
    fallbackTitle: 'Enterprise Architecture',
    category: 'architecture',
  },
  {
    key: 'BlankCanvasStandardData',
    id: 'blank-canvas-template',
    titleKey: 'diagram.title.blankCanvas',
    fallbackTitle: 'Blank Canvas',
    category: 'general',
  },
  {
    key: 'DeamndAllocation',
    id: 'wms-demand-allocation-strategy-v2',
    titleKey: 'diagram.title.demandAllocation',
    fallbackTitle: 'WMS Demand Allocation Strategy',
    category: 'warehouse',
  },
  {
    key: 'LogisticsPlanningStandardData',
    id: 'logistics-planning-v1',
    titleKey: 'diagram.title.logisticsPlanning',
    fallbackTitle: 'Logistics Transportation Planning',
    category: 'logistics',
  },
  {
    key: 'LogisticsStandardData',
    id: 'logistics-architecture-v1',
    titleKey: 'diagram.title.logisticsArchitecture',
    fallbackTitle: 'Logistics Architecture',
    category: 'logistics',
  },
  {
    key: 'SystemsInteractionStandardData',
    id: 'systems-interaction-v1',
    titleKey: 'diagram.title.systemsInteraction',
    fallbackTitle: 'Systems Interaction Architecture',
    category: 'architecture',
  },
  {
    key: 'TmsStandardData',
    id: 'tms-architecture-v1',
    titleKey: 'diagram.title.tmsArchitecture',
    fallbackTitle: 'TMS Transportation Management Architecture',
    category: 'logistics',
  },
  {
    key: 'TransportDrivenStandardData',
    id: 'transport-driven-v1',
    titleKey: 'diagram.title.transportDriven',
    fallbackTitle: 'Transport-Driven Architecture',
    category: 'logistics',
  },
  {
    key: 'WmsOrderToTaskFlowData',
    id: 'wms-order-to-task-flow',
    titleKey: 'diagram.title.wmsOrderToTask',
    fallbackTitle: 'WMS Order-to-Task Flow',
    category: 'warehouse',
  },
  {
    key: 'WmsProcessFlowStandardData',
    id: 'wms-process-flow-v1',
    titleKey: 'diagram.title.wmsProcess',
    fallbackTitle: 'WMS Order and Operations Flow',
    category: 'warehouse',
  },
  {
    key: 'WmsStandardData',
    id: 'wms-e2e-solution',
    titleKey: 'diagram.title.wmsEndToEnd',
    fallbackTitle: 'WMS End-to-End Solution',
    category: 'warehouse',
  },
] as const satisfies readonly StandardPresetCatalogItem[];

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
  'enterprise-architecture-v2': 'ArchitectureStandardData',
  'blank-canvas-template': 'BlankCanvasStandardData',
  'logistics-planning': 'LogisticsPlanningStandardData',
  'logistics-planning-v1': 'LogisticsPlanningStandardData',
  'supply-chain-arch': 'LogisticsStandardData',
  'logistics-architecture-v1': 'LogisticsStandardData',
  'systems-interaction-v1': 'SystemsInteractionStandardData',
  'tms-architecture-v1': 'TmsStandardData',
  'transport-driven-v1': 'TransportDrivenStandardData',
  'wms-e2e-solution': 'WmsStandardData',
  'wms-architecture': 'WmsStandardData',
  'wms-demand-allocation-strategy-v2': 'DeamndAllocation',
  'wms-order-to-task-flow': 'WmsOrderToTaskFlowData',
  'wms-process-flow-v1': 'WmsProcessFlowStandardData',
};

const STANDARD_PRESET_KEY_SET = new Set<string>(STANDARD_PRESET_KEYS);
const STANDARD_PRESET_CATALOG_BY_KEY = new Map<StandardPresetKey, StandardPresetCatalogItem>(
  STANDARD_PRESET_CATALOG.map(item => [item.key, item]),
);

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

export const getStandardPresetCatalogItemById = (
  id?: string,
): StandardPresetCatalogItem | undefined => {
  const key = resolvePresetKey(id);
  return key ? STANDARD_PRESET_CATALOG_BY_KEY.get(key) : undefined;
};
