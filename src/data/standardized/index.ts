import type { StandardDiagramData } from '@/core';

const PRESET_MODULES = import.meta.glob<{ default: StandardDiagramData }>('./*.json', { eager: true });

const PRESET_MAP: Record<string, StandardDiagramData> = {};
const PRESET_OPTIONS: { title: string; category?: string; tags?: string[]; key: string; value: string; label: string }[] = [];
const ALL_TAGS = new Set<string>();

Object.entries(PRESET_MODULES).forEach(([path, mod]) => {
  const data = mod.default ?? mod;
  const file = path.split('/').pop() || path;
  const key = file.replace(/\.json$/i, '');
  const title = String((data as any)?.metadata?.title || (data as any)?.name || key);
  
  PRESET_MAP[key] = data;

  const metadata = (data as any)?.metadata || {};
  const tags: string[] = Array.isArray(metadata.tags) ? metadata.tags : [];
  tags.forEach(t => ALL_TAGS.add(t));
  
  PRESET_OPTIONS.push({ 
    title, 
    key, 
    value: key, 
    label: title, 
    category: metadata.category || 'other',
    tags
  });
});

PRESET_OPTIONS.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-CN'));

export const CUSTOM_PRESETS_STORAGE_KEY = 'GenericStandardDiagram.customPresets';

try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY) : null;
  if (raw) {
    const customMap = JSON.parse(raw || '{}') as Record<string, StandardDiagramData>;
    Object.entries(customMap).forEach(([name, data]) => {
      const key = `custom:${name}`;
      const title = String((data as any)?.metadata?.title || (data as any)?.name || name);
      const tags: string[] = Array.isArray((data as any)?.metadata?.tags) ? (data as any).metadata.tags : [];
      
      PRESET_MAP[key] = data;
      tags.forEach(t => ALL_TAGS.add(t));
      
      PRESET_OPTIONS.push({ 
        title, 
        key, 
        value: key, 
        label: title, 
        category: (data as any)?.metadata?.category || 'other',
        tags
      });
    });
  }
} catch { void 0; }

export const defaultStandardData = PRESET_MAP['SupplyChainReceivingFlow'] || Object.values(PRESET_MAP)[0];

export { PRESET_MAP, PRESET_OPTIONS, ALL_TAGS };
