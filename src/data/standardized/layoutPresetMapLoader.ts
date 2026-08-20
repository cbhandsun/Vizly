import type { StandardDiagramData } from '@/core/models/DiagramModels';

import { loadStandardPresetById } from './presetLoader';

type StandardPresetLoader = (id?: string) => Promise<StandardDiagramData | null>;
type FallbackPresetMapLoader = () => Promise<Record<string, unknown>>;

export type LayoutPresetMapLoaderDependencies = Readonly<{
  loadStandardPreset: StandardPresetLoader;
  loadFallbackPresetMap: FallbackPresetMapLoader;
}>;

const defaultDependencies: LayoutPresetMapLoaderDependencies = {
  loadStandardPreset: loadStandardPresetById,
  loadFallbackPresetMap: () => import('./index').then(({ PRESET_MAP }) => PRESET_MAP),
};

/**
 * Standard diagrams already have an ID-addressable lazy loader. Loading the
 * eager catalog here would download and parse every bundled preset before the
 * first layout command. Custom diagrams retain the full-map compatibility path.
 */
export const loadLayoutPresetMapForDiagram = async (
  diagramId: string,
  dependencies: LayoutPresetMapLoaderDependencies = defaultDependencies,
): Promise<Record<string, unknown>> => {
  const normalizedId = typeof diagramId === 'string' ? diagramId.trim() : '';
  if (!normalizedId) return dependencies.loadFallbackPresetMap();

  const preset = await dependencies.loadStandardPreset(normalizedId);
  if (!preset) return dependencies.loadFallbackPresetMap();

  const result: Record<string, unknown> = { [normalizedId]: preset };
  const canonicalId = typeof preset.id === 'string' ? preset.id.trim() : '';
  if (canonicalId) result[canonicalId] = preset;
  return result;
};
