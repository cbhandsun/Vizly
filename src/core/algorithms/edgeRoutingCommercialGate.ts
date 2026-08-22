export const EDGE_ROUTING_QUALITY_LAYERS = [
  'geometry',
  'perceptual',
  'interaction',
  'multiScale',
] as const;

export type EdgeRoutingQualityLayer = typeof EDGE_ROUTING_QUALITY_LAYERS[number];

export type EdgeRoutingCommercialGateResult = Readonly<{
  hardClean: boolean;
  perceptualClean: boolean;
  traceable: boolean;
  multiScaleClean: boolean;
  commercialClean: boolean;
  blockerCounts: Readonly<Record<EdgeRoutingQualityLayer, number>>;
  unclassifiedWarningCount: number;
}>;

const QUALITY_LAYER_SET = new Set<string>(EDGE_ROUTING_QUALITY_LAYERS);
const MAX_NON_BLOCKING_REASON_LENGTH = 500;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const parseBlockingLayers = (value: unknown): EdgeRoutingQualityLayer[] | null => {
  if (!Array.isArray(value) || value.length > EDGE_ROUTING_QUALITY_LAYERS.length) return null;
  const layers: EdgeRoutingQualityLayer[] = [];
  for (const layer of value) {
    if (typeof layer !== 'string' || !QUALITY_LAYER_SET.has(layer)) return null;
    const parsed = layer as EdgeRoutingQualityLayer;
    if (!layers.includes(parsed)) layers.push(parsed);
  }
  return layers;
};

const hasAuditableNonBlockingReason = (value: unknown): boolean => (
  typeof value === 'string'
  && value.trim().length > 0
  && value.length <= MAX_NON_BLOCKING_REASON_LENGTH
);

/**
 * Deterministic commercial-quality aggregation. Unknown warning shapes and
 * missing/invalid layer classifications fail closed into the perceptual layer.
 */
export const aggregateEdgeRoutingCommercialGate = ({
  hardClean,
  findings,
}: {
  hardClean: unknown;
  findings: readonly unknown[];
}): EdgeRoutingCommercialGateResult => {
  const blockerCounts: Record<EdgeRoutingQualityLayer, number> = {
    geometry: 0,
    perceptual: 0,
    interaction: 0,
    multiScale: 0,
  };
  let unclassifiedWarningCount = 0;

  for (const finding of findings.slice(0, 100_000)) {
    if (!isRecord(finding) || finding.severity !== 'warning') continue;
    const layers = parseBlockingLayers(finding.blockingFor);
    if (
      layers
      && layers.length === 0
      && hasAuditableNonBlockingReason(finding.nonBlockingReason)
    ) continue;
    if (!layers || layers.length === 0) {
      blockerCounts.perceptual += 1;
      unclassifiedWarningCount += 1;
      continue;
    }
    for (const layer of layers) blockerCounts[layer] += 1;
  }

  const resolvedHardClean = hardClean === true && blockerCounts.geometry === 0;
  const perceptualClean = blockerCounts.perceptual === 0;
  const traceable = blockerCounts.interaction === 0;
  const multiScaleClean = blockerCounts.multiScale === 0;
  return {
    hardClean: resolvedHardClean,
    perceptualClean,
    traceable,
    multiScaleClean,
    commercialClean: resolvedHardClean && perceptualClean && traceable && multiScaleClean,
    blockerCounts,
    unclassifiedWarningCount,
  };
};
