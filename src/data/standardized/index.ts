import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { readStandardizedCustomPresetMap } from './customStandardPresets';

const PRESET_MODULES = import.meta.glob<{ default: StandardDiagramData }>('./*.json', { eager: true });

const PRESET_MAP: Record<string, StandardDiagramData> = {};
const PRESET_OPTIONS: { title: string; category?: string; tags?: string[]; key: string; value: string; label: string }[] = [];
const ALL_TAGS = new Set<string>();

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const presetMetadata = (data: StandardDiagramData): Record<string, unknown> =>
  asRecord(data.metadata);

const stringTags = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === 'string')
    : [];

Object.entries(PRESET_MODULES).forEach(([path, mod]) => {
  const data = mod.default ?? mod;
  const file = path.split('/').pop() || path;
  const key = file.replace(/\.json$/i, '');
  const metadata = presetMetadata(data);
  const title = String(metadata.title || data.name || key);
  
  const tags = stringTags(metadata.tags);
  tags.forEach(t => ALL_TAGS.add(t));
  
  PRESET_MAP[key] = data;
  if (data.id && data.id !== key) {
    PRESET_MAP[data.id] = data;
  }
  
  PRESET_OPTIONS.push({ 
    title, 
    key, 
    value: key, 
    label: title, 
    category: typeof metadata.category === 'string' ? metadata.category : 'other',
    tags
  });
});

PRESET_OPTIONS.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-CN'));

const customMap = typeof localStorage !== 'undefined'
  ? readStandardizedCustomPresetMap(localStorage)
  : {};

Object.entries(customMap).forEach(([name, data]) => {
  const key = `custom:${name}`;
  const metadata = presetMetadata(data);
  const title = String(metadata.title || data.name || name);
  const tags = stringTags(metadata.tags);

  PRESET_MAP[key] = data;
  tags.forEach(t => ALL_TAGS.add(t));

  PRESET_OPTIONS.push({
    title,
    key,
    value: key,
    label: title,
    category: typeof metadata.category === 'string' ? metadata.category : 'other',
    tags
  });
});

export const defaultStandardData = PRESET_MAP['SupplyChainReceivingFlow'] || Object.values(PRESET_MAP)[0];

const LEGACY_ID_MAP: Record<string, string> = {
  'supply-chain-arch': 'LogisticsStandardData', // 旧图表 ID 映射到新的物理图表 ID
  'logistics-planning': 'LogisticsPlanningStandardData',
  'wms-architecture': 'WmsStandardData',
  'enterprise-architecture': 'ArchitectureStandardData',
};

// 为旧ID添加映射引用，保证向前兼容
Object.entries(LEGACY_ID_MAP).forEach(([oldId, newId]) => {
  if (PRESET_MAP[newId] && !PRESET_MAP[oldId]) {
    PRESET_MAP[oldId] = PRESET_MAP[newId];
  }
});

export { PRESET_MAP, PRESET_OPTIONS, ALL_TAGS };
