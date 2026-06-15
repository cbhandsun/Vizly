import type { ILayoutStrategy } from '@/core/strategies/LayoutStrategyManager';
import type { ToolbarEdgeMode } from './topToolbarGuards';

export type ElkAlgorithm = 'layered' | 'mrtree' | 'force';
export type ContainmentPolicy = 'elastic' | 'soft' | 'strict';
export type RankMode = 'elk';

export interface LayoutPresetValue {
  containment: ContainmentPolicy;
  rank: RankMode;
}

const ELK_ALGORITHMS = new Set<ElkAlgorithm>(['layered', 'mrtree', 'force']);
const CONTAINMENT_POLICIES = new Set<ContainmentPolicy>(['elastic', 'soft', 'strict']);

export const normalizeLayoutName = (value: unknown): string => (
  String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '')
);

export const normalizeDiagramEdgeMode = (value: unknown): ToolbarEdgeMode => (
  value === 'smart' || value === 'advanced-smart' ? 'advanced-smart' : 'native'
);

export const isDiagramEdgeMode = (value: unknown): value is ToolbarEdgeMode => (
  value === 'advanced-smart' || value === 'native'
);

export const normalizeElkAlgorithm = (value: unknown): ElkAlgorithm => {
  const normalized = String(value || '').trim().toLowerCase();
  return ELK_ALGORITHMS.has(normalized as ElkAlgorithm) ? normalized as ElkAlgorithm : 'layered';
};

export const parseLayoutPresetValue = (value: unknown): LayoutPresetValue | null => {
  const parts = String(value || '').split('+');
  if (parts.length !== 2) return null;
  const [containment, rank] = parts;
  if (!CONTAINMENT_POLICIES.has(containment as ContainmentPolicy) || rank !== 'elk') {
    return null;
  }
  return { containment: containment as ContainmentPolicy, rank };
};

export const isCytoscapeStrategy = (strategy: ILayoutStrategy): boolean => {
  const name = strategy.getName().toLowerCase();
  return name.includes('cytoscapefcose') || name.includes('cytoscapeconcentric');
};

export const isAvailableStrategyType = (
  value: unknown,
  strategies: Array<{ type: string }>
): value is string => (
  typeof value === 'string' && strategies.some(({ type }) => type === value)
);

export const getEngineNodeLayout = (nodeStrategy?: string): string | undefined => {
  const normalized = normalizeLayoutName(nodeStrategy);
  const map: Record<string, string> = {
    dagrelayout: 'dagre',
    dagre: 'dagre',
    horizontallayout: 'horizontal',
    horizontal: 'horizontal',
    verticallayout: 'vertical',
    vertical: 'vertical',
    gridlayout: 'grid',
    grid: 'grid',
    centeredlayout: 'flow',
    centered: 'flow',
  };
  return map[normalized];
};
