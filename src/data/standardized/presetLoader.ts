import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { resolvePresetKey, type StandardPresetKey } from './presetMetadata';

type PresetModule = { default: StandardDiagramData };
type PresetLoader = () => Promise<PresetModule>;

const PRESET_LOADERS: Record<StandardPresetKey, PresetLoader> = {
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

export const loadStandardPresetById = async (id?: string): Promise<StandardDiagramData | null> => {
  const key = resolvePresetKey(id);
  if (!key) return null;

  const loader = PRESET_LOADERS[key];
  if (!loader) return null;

  const mod = await loader();
  return mod.default ?? (mod as unknown as StandardDiagramData);
};
