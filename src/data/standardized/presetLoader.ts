import type { StandardDiagramData } from '@vizly/core/types';
import { coerceToStandardDiagramData } from '@vizly/core/diagram-data';
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
const COMPACT_EDGE_TYPES = ['main', 'dependency', 'data', 'support', 'feedback', 'system', 'exception'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const expandCompactStandardPreset = (value: unknown, key: StandardPresetKey): unknown => {
  if (!isRecord(value) || value.compactStandardPresetVersion === undefined) return value;
  if (value.compactStandardPresetVersion !== 1
    || Object.keys(value).some(field => !['compactStandardPresetVersion', 'document', 'nodes', 'edges'].includes(field))
    || !Array.isArray(value.document) || value.document.length !== 9
    || !Array.isArray(value.nodes) || value.nodes.length > 2_000
    || !Array.isArray(value.edges) || value.edges.length > 2_000) {
    throw new Error(`Invalid compact standard preset: ${key}`);
  }
  const [id, name, type, version, layout, theme, config, metadata, domains] = value.document;
  if (![id, name, type, version].every(field => typeof field === 'string')
    || ![layout, theme, config, metadata].every(isRecord)
    || !Array.isArray(domains) || domains.length > 2_000
    || domains.some(domain => typeof domain !== 'string' || domain.length === 0)
    || new Set(domains).size !== domains.length) {
    throw new Error(`Invalid compact standard preset: ${key}`);
  }
  const nodeIds = new Set<string>();
  const nodes = value.nodes.map(tuple => {
    if (!Array.isArray(tuple) || tuple.length !== 5) throw new Error(`Invalid compact standard preset: ${key}`);
    const [nodeId, compactDescription, domainIndex, domainClass, subDomain] = tuple;
    if (typeof nodeId !== 'string' || nodeIds.has(nodeId) || typeof compactDescription !== 'string'
      || !Number.isSafeInteger(domainIndex) || (domainIndex as number) < 0 || (domainIndex as number) >= domains.length
      || (domainClass !== null && typeof domainClass !== 'string')
      || (subDomain !== null && typeof subDomain !== 'string')) {
      throw new Error(`Invalid compact standard preset: ${key}`);
    }
    nodeIds.add(nodeId);
    const descriptionParts = (compactDescription as string).split('\n');
    if (descriptionParts.length !== 3 || descriptionParts.some(part => part.length === 0)) {
      throw new Error(`Invalid compact standard preset: ${key}`);
    }
    const description = `<b>${descriptionParts[0]}</b><br/>• ${descriptionParts[1]}<br/>• ${descriptionParts[2]}`;
    return { id: nodeId, description, domain: domains[domainIndex as number],
      ...(domainClass === null ? {} : { domainClass }),
      type: 'custom', zIndex: 10,
      ...(subDomain === null ? {} : { subDomain }) };
  });
  const edges = value.edges.map(tuple => {
    if (!Array.isArray(tuple) || tuple.length !== 5) throw new Error(`Invalid compact standard preset: ${key}`);
    const [edgeId, sourceIndex, targetIndex, typeIndex, label] = tuple;
    if (typeof edgeId !== 'string'
      || !Number.isSafeInteger(sourceIndex) || (sourceIndex as number) < 0 || (sourceIndex as number) >= nodes.length
      || !Number.isSafeInteger(targetIndex) || (targetIndex as number) < 0 || (targetIndex as number) >= nodes.length
      || !Number.isSafeInteger(typeIndex) || (typeIndex as number) < 0 || (typeIndex as number) >= COMPACT_EDGE_TYPES.length
      || (label !== null && typeof label !== 'string')) {
      throw new Error(`Invalid compact standard preset: ${key}`);
    }
    return { id: edgeId, source: nodes[sourceIndex as number]?.id, target: nodes[targetIndex as number]?.id,
      type: COMPACT_EDGE_TYPES[typeIndex as number], ...(label === null ? {} : { label }) };
  });
  return { id, name, type, version, layout, theme, config, metadata, nodes, edges };
};

export const parseStandardPresetModule = (
  moduleValue: unknown,
  key: StandardPresetKey,
): StandardDiagramData => {
  const raw = isRecord(moduleValue) && 'default' in moduleValue
    ? moduleValue.default
    : moduleValue;
  const expanded = expandCompactStandardPreset(raw, key);
  if (
    !isRecord(expanded)
    || typeof expanded.id !== 'string'
    || expanded.id.trim() === ''
    || !Array.isArray(expanded.nodes)
    || !Array.isArray(expanded.edges)
  ) {
    throw new Error(`Invalid standard preset module: ${key}`);
  }
  return coerceToStandardDiagramData(expanded, { id: key, title: key });
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
