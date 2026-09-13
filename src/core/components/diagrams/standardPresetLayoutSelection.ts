import type { LayoutSelection } from './layoutSelectionPersistence';
import {
  DEFAULT_LAYOUT_SELECTION,
  parsePersistedLayoutSelection,
} from './layoutSelectionPersistence';

const NODE_LAYOUTS = new Set(['dagre', 'flow', 'grid', 'horizontal', 'vertical']);
const DIRECTIONS = new Set(['TB', 'BT', 'LR', 'RL'] as const);
const CUSTOM_DOMAIN_STRATEGIES = new Set(['domain-vertical', 'domain-horizontal']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const normalizeLayoutType = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '')
    : ''
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

const resolveDefaultDirection = (
  strategy: LayoutSelection['strategy'],
  value: unknown,
): LayoutSelection['direction'] => {
  if (typeof value === 'string' && DIRECTIONS.has(value as LayoutSelection['direction'])) {
    return value as LayoutSelection['direction'];
  }
  return strategy === 'domain-horizontal' ? 'LR' : DEFAULT_LAYOUT_SELECTION.direction;
};

const coerceNodeId = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const hasStringArray = (value: unknown): boolean => (
  Array.isArray(value) && value.some(item => typeof item === 'string' && item.trim().length > 0)
);

const hasSubDomainOrder = (value: unknown): boolean => {
  if (hasStringArray(value)) return true;
  if (!isRecord(value)) return false;
  return Object.values(value).some(hasStringArray);
};

const hasOrderedLaneIntent = (layout: unknown): boolean => {
  if (!isRecord(layout)) return false;
  const hasExplicitDomainOrder = hasStringArray(layout.domainOrder) || hasStringArray(layout.laneOrder);
  const hasExplicitSubDomainOrder = hasSubDomainOrder(layout.subDomainOrder);
  return (layout.autoDirection === true || layout.fitDomainContent === true)
    && (hasExplicitDomainOrder || hasExplicitSubDomainOrder);
};

const isDirectedForestPresetGraph = (preset: { nodes?: unknown; edges?: unknown }): boolean => {
  const rawNodes = Array.isArray(preset.nodes) ? preset.nodes : [];
  const rawEdges = Array.isArray(preset.edges) ? preset.edges : [];
  const nodeIds = rawNodes
    .map(node => (isRecord(node) ? coerceNodeId(node.id) : null))
    .filter((id): id is string => Boolean(id));
  if (nodeIds.length === 0) return true;

  const nodeIdSet = new Set(nodeIds);
  const indegree = new Map(nodeIds.map(id => [id, 0]));
  const children = new Map<string, string[]>();
  for (const rawEdge of rawEdges) {
    if (!isRecord(rawEdge)) continue;
    const source = coerceNodeId(rawEdge.source);
    const target = coerceNodeId(rawEdge.target);
    if (!source || !target || !nodeIdSet.has(source) || !nodeIdSet.has(target)) continue;
    if (source === target) return false;
    const nextIndegree = (indegree.get(target) ?? 0) + 1;
    if (nextIndegree > 1) return false;
    indegree.set(target, nextIndegree);
    children.set(source, [...(children.get(source) ?? []), target]);
  }

  const queue = nodeIds.filter(id => (indegree.get(id) ?? 0) === 0);
  let visited = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    visited += 1;
    for (const childId of children.get(nodeId) ?? []) {
      const nextIndegree = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, nextIndegree);
      if (nextIndegree === 0) queue.push(childId);
    }
  }
  return visited === nodeIds.length;
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
    direction: resolveDefaultDirection(strategy, record.direction),
    nodeLayout: coerceNodeLayout(record.nodeLayout, defaultNodeLayout),
    laneRankPreference: 'auto',
  };
};

export const resolveInitialLayoutSelectionFromStandardPreset = (
  preset: { layout?: unknown; nodes?: unknown; edges?: unknown },
): LayoutSelection => {
  const selection = resolveInitialLayoutSelectionFromStandardLayout(preset.layout);
  if (
    CUSTOM_DOMAIN_STRATEGIES.has(selection.strategy)
    && !isDirectedForestPresetGraph(preset)
  ) {
    return {
      version: 2,
      strategy: hasOrderedLaneIntent(preset.layout) ? 'domain-lanes' : 'domain-dagre',
      direction: selection.direction,
      nodeLayout: 'dagre',
      laneRankPreference: 'auto',
    };
  }
  return selection;
};

export const createStandardPresetInitialMetadata = (
  preset: { layout?: unknown; metadata?: unknown; nodes?: unknown; edges?: unknown },
): Record<string, unknown> => {
  const metadata = isRecord(preset.metadata) ? preset.metadata : {};
  const existing = parsePersistedLayoutSelection(metadata);
  return {
    ...metadata,
    layoutSelection: existing ?? resolveInitialLayoutSelectionFromStandardPreset(preset),
  };
};
