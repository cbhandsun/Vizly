import type { StandardDiagramData } from '@/core/models/DiagramModels';

type PresetModule = { default: StandardDiagramData };
type PresetLoader = () => Promise<PresetModule>;

const PRESET_LOADERS: Record<string, PresetLoader> = {
  ArchitectureStandardData: () => import('./ArchitectureStandardData.json'),
  BlankCanvasStandardData: () => import('./BlankCanvasStandardData.json'),
  DeamndAllocation: () => import('./DeamndAllocation.json'),
  LogisticsPlanningStandardData: () => import('./LogisticsPlanningStandardData.json'),
  LogisticsStandardData: () => import('./LogisticsStandardData.json'),
  SystemsInteractionStandardData: () => import('./SystemsInteractionStandardData.json'),
  TmsStandardData: () => import('./TmsStandardData.json'),
  TransportDrivenStandardData: () => import('./TransportDrivenStandardData.json'),
  WmsOrderToTaskFlowData: () => import('./WmsOrderToTaskFlowData.json'),
  WmsProcessFlowStandardData: () => import('./WmsProcessFlowStandardData.json'),
  WmsStandardData: () => import('./WmsStandardData.json'),
};

const PRESET_ID_ALIASES: Record<string, string> = {
  'enterprise-architecture': 'ArchitectureStandardData',
  'logistics-planning': 'LogisticsPlanningStandardData',
  'supply-chain-arch': 'LogisticsStandardData',
  'wms-architecture': 'WmsStandardData',
  'wms-demand-allocation-strategy-v2': 'DeamndAllocation',
};

export const loadStandardPresetById = async (id?: string): Promise<StandardDiagramData | null> => {
  if (!id) return null;

  const loader = PRESET_LOADERS[id] || PRESET_LOADERS[PRESET_ID_ALIASES[id]];
  if (!loader) return null;

  const mod = await loader();
  return mod.default ?? (mod as unknown as StandardDiagramData);
};
