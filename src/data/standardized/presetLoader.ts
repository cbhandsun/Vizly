import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { coerceToStandardDiagramData } from '@/core/utils/coerceDiagram';
import { resolvePresetKey, type StandardPresetKey } from './presetMetadata';

type PresetLoader = () => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

export const parseStandardPresetModule = (
  moduleValue: unknown,
  key: StandardPresetKey,
): StandardDiagramData => {
  const raw = isRecord(moduleValue) && 'default' in moduleValue
    ? moduleValue.default
    : moduleValue;
  if (
    !isRecord(raw)
    || typeof raw.id !== 'string'
    || raw.id.trim() === ''
    || !Array.isArray(raw.nodes)
    || !Array.isArray(raw.edges)
  ) {
    throw new Error(`Invalid standard preset module: ${key}`);
  }
  return coerceToStandardDiagramData(raw, { id: key, title: key });
};

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

const presetPromises = new Map<StandardPresetKey, Promise<StandardDiagramData>>();

export const loadStandardPresetById = (id?: string): Promise<StandardDiagramData | null> => {
  const key = resolvePresetKey(id);
  if (!key) return Promise.resolve(null);

  const loader = PRESET_LOADERS[key];
  if (!loader) return Promise.resolve(null);

  let cached = presetPromises.get(key);
  if (!cached) {
    cached = loader().then((moduleValue) => (
      parseStandardPresetModule(moduleValue, key)
    )).catch((error) => {
      presetPromises.delete(key);
      throw error;
    });
    presetPromises.set(key, cached);
  }
  return cached;
};
