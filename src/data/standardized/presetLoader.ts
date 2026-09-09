import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { coerceToStandardDiagramData } from '@/core/utils/coerceDiagram';
import {
  PRESET_ID_ALIASES,
  STANDARD_PRESET_KEYS,
  resolvePresetKey,
  type StandardPresetKey,
} from './presetMetadata';

import architecturePresetUrl from './ArchitectureStandardData.json?url&no-inline';
import blankCanvasPresetUrl from './BlankCanvasStandardData.json?url&no-inline';
import demandAllocationPresetUrl from './DeamndAllocation.json?url&no-inline';
import logisticsPlanningPresetUrl from './LogisticsPlanningStandardData.json?url&no-inline';
import logisticsPresetUrl from './LogisticsStandardData.json?url&no-inline';
import systemsInteractionPresetUrl from './SystemsInteractionStandardData.json?url&no-inline';
import tmsPresetUrl from './TmsStandardData.json?url&no-inline';
import transportDrivenPresetUrl from './TransportDrivenStandardData.json?url&no-inline';
import wmsOrderToTaskPresetUrl from './WmsOrderToTaskFlowData.json?url&no-inline';
import wmsProcessPresetUrl from './WmsProcessFlowStandardData.json?url&no-inline';
import wmsPresetUrl from './WmsStandardData.json?url&no-inline';

type PresetLoader = () => Promise<unknown>;

const MAX_PRESET_JSON_LENGTH = 1024 * 1024;

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

export const parseStandardPresetText = (
  source: unknown,
  key: StandardPresetKey,
): StandardDiagramData => {
  if (typeof source !== 'string' || source.length === 0 || source.length > MAX_PRESET_JSON_LENGTH) {
    throw new Error(`Invalid standard preset asset: ${key}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`Invalid standard preset asset: ${key}`);
  }
  return parseStandardPresetModule(parsed, key);
};

export const loadStandardPresetAsset = async (
  url: string,
  key: StandardPresetKey,
): Promise<StandardDiagramData> => {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Standard preset asset unavailable: ${key}`);
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && (
    !/^\d{1,10}$/.test(declaredLength)
    || Number(declaredLength) > MAX_PRESET_JSON_LENGTH
  )) {
    throw new Error(`Invalid standard preset asset: ${key}`);
  }
  const source = await response.text();
  return parseStandardPresetText(source, key);
};

const assetLoader = (url: string, key: StandardPresetKey): PresetLoader => (
  () => loadStandardPresetAsset(url, key)
);

const PRESET_LOADERS: Record<StandardPresetKey, PresetLoader> = {
  ArchitectureStandardData: assetLoader(architecturePresetUrl, 'ArchitectureStandardData'),
  BlankCanvasStandardData: assetLoader(blankCanvasPresetUrl, 'BlankCanvasStandardData'),
  DeamndAllocation: assetLoader(demandAllocationPresetUrl, 'DeamndAllocation'),
  LogisticsPlanningStandardData: assetLoader(logisticsPlanningPresetUrl, 'LogisticsPlanningStandardData'),
  LogisticsStandardData: assetLoader(logisticsPresetUrl, 'LogisticsStandardData'),
  SystemsInteractionStandardData: assetLoader(systemsInteractionPresetUrl, 'SystemsInteractionStandardData'),
  TmsStandardData: assetLoader(tmsPresetUrl, 'TmsStandardData'),
  TransportDrivenStandardData: assetLoader(transportDrivenPresetUrl, 'TransportDrivenStandardData'),
  WmsOrderToTaskFlowData: assetLoader(wmsOrderToTaskPresetUrl, 'WmsOrderToTaskFlowData'),
  WmsProcessFlowStandardData: assetLoader(wmsProcessPresetUrl, 'WmsProcessFlowStandardData'),
  WmsStandardData: assetLoader(wmsPresetUrl, 'WmsStandardData'),
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

export const loadAllStandardPresets = async (): Promise<Record<string, StandardDiagramData>> => {
  const entries = await Promise.all(STANDARD_PRESET_KEYS.map(async key => {
    const preset = await loadStandardPresetById(key);
    if (!preset) throw new Error(`Standard preset asset unavailable: ${key}`);
    return [key, preset] as const;
  }));
  const result: Record<string, StandardDiagramData> = {};
  for (const [key, preset] of entries) {
    result[key] = preset;
    if (preset.id) result[preset.id] = preset;
  }
  for (const [alias, key] of Object.entries(PRESET_ID_ALIASES)) {
    const preset = result[key];
    if (preset) result[alias] = preset;
  }
  return result;
};
