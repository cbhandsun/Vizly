import type { ConfigValues } from './configurationPanelModel';

export type ConfigurationPresetId = 'elk-compact' | 'elk-consistent';

export const CONFIGURATION_PRESETS: Record<ConfigurationPresetId, ConfigValues> = {
  'elk-compact': {
    'diagram.layout.ELK_NODE_SPACING': 36,
    'diagram.layout.ELK_LAYER_SPACING': 64,
    'diagram.layout.ELK_EDGE_ROUTING': 'ORTHOGONAL',
    'diagram.layout.ELK_NODE_PLACEMENT': 'BRANDES_KOEPF',
    'diagram.layout.ELK_LAYERING': 'LONGEST_PATH',
    'diagram.layout.ELK_FIXED_ALIGNMENT': 'BALANCED',
    'diagram.layout.ELK_CONSIDER_MODEL_ORDER': true,
    'diagram.layout.ELK_MERGE_EDGES': false,
    'diagram.layout.ELK_CYCLE_BREAKING': 'GREEDY',
    'diagram.layout.ELK_PORT_BORDER_OFFSET': 4,
    'diagram.layout.ELK_LABEL_SPACING': 6,
  },
  'elk-consistent': {
    'diagram.layout.ELK_NODE_SPACING': 56,
    'diagram.layout.ELK_LAYER_SPACING': 96,
    'diagram.layout.ELK_EDGE_ROUTING': 'POLYLINE',
    'diagram.layout.ELK_NODE_PLACEMENT': 'NETWORK_SIMPLEX',
    'diagram.layout.ELK_LAYERING': 'NETWORK_SIMPLEX',
    'diagram.layout.ELK_FIXED_ALIGNMENT': 'NONE',
    'diagram.layout.ELK_CONSIDER_MODEL_ORDER': false,
    'diagram.layout.ELK_MERGE_EDGES': true,
    'diagram.layout.ELK_CYCLE_BREAKING': 'DEPTH_FIRST',
    'diagram.layout.ELK_PORT_BORDER_OFFSET': 4,
    'diagram.layout.ELK_LABEL_SPACING': 8,
  },
};

export const stageConfigurationPreset = (
  currentValues: ConfigValues,
  presetId: ConfigurationPresetId,
): { values: ConfigValues; changedKeys: string[] } => {
  const preset = CONFIGURATION_PRESETS[presetId];
  return {
    values: { ...currentValues, ...preset },
    changedKeys: Object.keys(preset),
  };
};
