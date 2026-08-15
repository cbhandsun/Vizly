const MIN_INTERIOR_SEGMENT = 12;
const MAX_BEND_COUNT = 12;

const finitePoint = value => (
  Boolean(value)
  && typeof value === 'object'
  && Number.isFinite(value.x)
  && Number.isFinite(value.y)
);

const segmentLength = (first, second) => (
  Math.abs(second.x - first.x) + Math.abs(second.y - first.y)
);

/**
 * Build-time counterpart of baseReactFlowDisplayCommercialQuality.ts.
 * Keep this deliberately topology-independent: an outer lane may be required
 * to retain a crossing-free graph, while invalid paths, tiny interior segments,
 * and pathological bend chains are always safe to reject.
 */
export const auditPrecompiledDisplayRouteCommercialQuality = patches => {
  if (!Array.isArray(patches)) {
    return [{ edgeId: 'unknown', kind: 'invalid-path', value: 0, limit: 2 }];
  }
  const issues = [];
  for (const patch of patches) {
    const edgeId = typeof patch?.id === 'string' ? patch.id : 'unknown';
    const path = patch?.data?.computedPath;
    if (!Array.isArray(path) || path.length < 2 || !path.every(finitePoint)) {
      issues.push({
        edgeId,
        kind: 'invalid-path',
        value: Array.isArray(path) ? path.length : 0,
        limit: 2,
      });
      continue;
    }
    const bendCount = Math.max(0, path.length - 2);
    if (bendCount > MAX_BEND_COUNT) {
      issues.push({ edgeId, kind: 'excessive-bends', value: bendCount, limit: MAX_BEND_COUNT });
    }
    for (let index = 1; index < path.length - 2; index += 1) {
      const length = segmentLength(path[index], path[index + 1]);
      if (length > 0.5 && length < MIN_INTERIOR_SEGMENT) {
        issues.push({
          edgeId,
          kind: 'tiny-interior-segment',
          value: length,
          limit: MIN_INTERIOR_SEGMENT,
        });
      }
    }
  }
  return issues;
};

export const precompiledDisplayRouteCommercialQualityIsClean = patches => (
  auditPrecompiledDisplayRouteCommercialQuality(patches).length === 0
);
