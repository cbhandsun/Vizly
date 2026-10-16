import type { StandardDiagramData } from '@vizly/core/types';

import { loadStandardPresetById } from './presetLoader';
import { readStandardizedCustomPresetMap } from './customStandardPresets';

type StandardPresetLoader = (id?: string) => Promise<StandardDiagramData | null>;
type FallbackPresetMapLoader = () => Promise<Record<string, unknown>>;

export type LayoutPresetMapLoaderDependencies = Readonly<{
  loadStandardPreset: StandardPresetLoader;
  loadFallbackPresetMap: FallbackPresetMapLoader;
}>;

const defaultDependencies: LayoutPresetMapLoaderDependencies = {
  loadStandardPreset: loadStandardPresetById,
  loadFallbackPresetMap: async () => typeof localStorage === 'undefined'
    ? {} : readStandardizedCustomPresetMap(localStorage),
};

/**
 * Standard diagrams already have an ID-addressable lazy loader. Loading the
 * eager catalog here would download every bundled preset. Custom diagrams read
 * only locally stored presets; an unknown identifier never downloads the catalog.
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
