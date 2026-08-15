export type DomainElkEdgeRouting = 'ORTHOGONAL' | 'POLYLINE' | 'SPLINES';

export const DOMAIN_ELK_LAYERED_QUALITY_OPTIONS = Object.freeze({
  'elk.layered.considerModelOrder.strategy': 'NONE',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.thoroughness': '20',
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
