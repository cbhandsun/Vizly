import type { FlowchartLayoutDirection } from './flowchartLayoutStrategyMode';

const STRATEGIES = new Set([
  'domain-dagre',
  'domain-dagre-sub-horizontal',
  'dagre',
  'domain-lanes',
  'domain-horizontal',
  'domain-vertical',
  'domain-elk',
  'elk',
  'domain-compound-elk',
  'tree',
  'force',
]);
const NODE_LAYOUTS = new Set(['dagre', 'flow', 'grid', 'horizontal', 'vertical']);

export type LayoutSelection = Readonly<{
  version: 1;
  strategy: string;
  direction: FlowchartLayoutDirection;
  nodeLayout: string;
}>;

export const DEFAULT_LAYOUT_SELECTION: LayoutSelection = Object.freeze({
  version: 1,
  strategy: 'domain-dagre',
  direction: 'TB',
  nodeLayout: 'dagre',
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

export const parseLayoutSelection = (value: unknown): LayoutSelection | null => {
  if (
    !isRecord(value)
    || value.version !== 1
    || typeof value.strategy !== 'string'
    || !STRATEGIES.has(value.strategy)
    || typeof value.nodeLayout !== 'string'
    || !NODE_LAYOUTS.has(value.nodeLayout)
    || (
      value.direction !== 'TB'
      && value.direction !== 'BT'
      && value.direction !== 'LR'
      && value.direction !== 'RL'
    )
  ) return null;
  return {
    version: 1,
    strategy: value.strategy,
    direction: value.direction,
    nodeLayout: value.nodeLayout,
  };
};

export const parsePersistedLayoutSelection = (metadata: unknown): LayoutSelection | null => (
  isRecord(metadata) ? parseLayoutSelection(metadata.layoutSelection) : null
);
