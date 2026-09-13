import type { LayoutSelection } from './layoutSelectionPersistence';
import {
  DEFAULT_LAYOUT_SELECTION,
  parsePersistedLayoutSelection,
} from './layoutSelectionPersistence';

const NODE_LAYOUTS = new Set(['dagre', 'flow', 'grid', 'horizontal', 'vertical']);
const DIRECTIONS = new Set(['TB', 'BT', 'LR', 'RL'] as const);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const normalizeLayoutType = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '')
    : ''
);

const coerceDirection = (value: unknown): LayoutSelection['direction'] => (
  typeof value === 'string' && DIRECTIONS.has(value as LayoutSelection['direction'])
    ? value as LayoutSelection['direction']
    : DEFAULT_LAYOUT_SELECTION.direction
);

const coerceNodeLayout = (
  value: unknown,
  fallback: LayoutSelection['nodeLayout'],
): LayoutSelection['nodeLayout'] => (
  typeof value === 'string' && NODE_LAYOUTS.has(value)
    ? value
    : fallback
);

const resolveStrategy = (layoutType: string): LayoutSelection['strategy'] => {
  if (layoutType === 'domainvertical' || layoutType === 'domainverticallayout') {
    return 'domain-vertical';
  }
  if (layoutType === 'domainhorizontal' || layoutType === 'domainhorizontallayout') {
    return 'domain-horizontal';
  }
  if (layoutType === 'domaincompoundelk' || layoutType === 'domaincompoundelklayout') {
    return 'domain-compound-elk';
  }
  if (layoutType === 'domainelk' || layoutType === 'domainelklayout' || layoutType === 'elklayered') {
    return 'domain-elk';
  }
  if (layoutType === 'domainlanes' || layoutType === 'domainlaneslayout' || layoutType === 'swimlane') {
    return 'domain-lanes';
  }
  return 'domain-dagre';
};

export const resolveInitialLayoutSelectionFromStandardLayout = (
  layout: unknown,
): LayoutSelection => {
  const record = isRecord(layout) ? layout : {};
  const strategy = resolveStrategy(normalizeLayoutType(record.type));
  const defaultNodeLayout = strategy === 'domain-vertical' || strategy === 'domain-horizontal'
    ? 'vertical'
    : 'dagre';
  return {
    version: 2,
    strategy,
    direction: coerceDirection(record.direction),
    nodeLayout: coerceNodeLayout(record.nodeLayout, defaultNodeLayout),
    laneRankPreference: 'auto',
  };
};

export const createStandardPresetInitialMetadata = (
  preset: { layout?: unknown; metadata?: unknown },
): Record<string, unknown> => {
  const metadata = isRecord(preset.metadata) ? preset.metadata : {};
  const existing = parsePersistedLayoutSelection(metadata);
  return {
    ...metadata,
    layoutSelection: existing ?? resolveInitialLayoutSelectionFromStandardLayout(preset.layout),
  };
};
