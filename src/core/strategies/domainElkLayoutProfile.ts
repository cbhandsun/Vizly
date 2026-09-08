export type DomainElkEdgeRouting = 'ORTHOGONAL' | 'POLYLINE' | 'SPLINES';

/** Explicit flow semantics only: renderer names, labels and colors are not intent.
 * Scale the preference above the ordinary edge count in this bounded graph. ELK still
 * owns cycle breaking, including unavoidable cycles among main edges. */
export const resolveDomainElkMainFlowOptions = (
  edge: { type?: unknown; className?: unknown }, edgeCount: number,
): Record<string, string> | undefined => {
  if (!Number.isInteger(edgeCount) || edgeCount < 1 || edgeCount > 10_000) return undefined;
  if (edge.className !== undefined && (typeof edge.className !== 'string' || edge.className.length > 512)) return undefined;
  const roles = typeof edge.className === 'string'
    ? [...new Set(edge.className.split(/\s+/).filter(token => token.startsWith('vizly-edge-role-')))] : [];
  const main = roles.length ? roles.length === 1 && roles[0] === 'vizly-edge-role-main'
    : typeof edge.type === 'string' && edge.type.trim().toLowerCase() === 'main';
  return main ? { 'elk.layered.priority.direction': String(edgeCount + 1) } : undefined;
};

export const DOMAIN_ELK_LAYERED_QUALITY_OPTIONS = Object.freeze({
  'elk.layered.considerModelOrder.strategy': 'NONE',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
});

const MIN_ELK_SPACING = 24;
const MAX_ELK_SPACING = 2_000;

const finitePositive = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
);

export const resolveDomainElkSpacing = (
  explicitValue: unknown,
  configuredValue: unknown,
  fallback = 120,
): number => {
  const resolved = finitePositive(explicitValue)
    ?? finitePositive(configuredValue)
    ?? finitePositive(fallback)
    ?? 120;
  return Math.min(MAX_ELK_SPACING, Math.max(MIN_ELK_SPACING, resolved));
};

export const resolveDomainElkEdgeRouting = (
  explicitValue: unknown,
  configuredValue: unknown,
): DomainElkEdgeRouting => {
  for (const value of [explicitValue, configuredValue]) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toUpperCase();
    if (
      normalized === 'ORTHOGONAL'
      || normalized === 'POLYLINE'
      || normalized === 'SPLINES'
    ) return normalized;
  }
  return 'ORTHOGONAL';
};

export const resolveDomainElkThoroughness = (nodeCount: number): string => (
  nodeCount > 250 ? '5' : nodeCount > 80 ? '8' : '12'
);
