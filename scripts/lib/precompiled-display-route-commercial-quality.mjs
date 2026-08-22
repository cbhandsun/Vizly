const MIN_INTERIOR_SEGMENT = 24;
const MAX_BEND_COUNT = 6;
const MAX_TERMINAL_RETREAT_BEND_COUNT = 4;
const MIN_TERMINAL_RETREAT = 96;

const finitePoint = value => (
  Boolean(value)
  && typeof value === 'object'
  && Number.isFinite(value.x)
  && Number.isFinite(value.y)
);

const segmentLength = (first, second) => (
  Math.abs(second.x - first.x) + Math.abs(second.y - first.y)
);

const terminalRetreatLength = (path) => {
  const source = path[0];
  const sourceStub = path[1];
  const target = path.at(-1);
  const horizontal = Math.abs(sourceStub.y - source.y) <= 0.5;
  const terminalDelta = horizontal
    ? target.x - source.x
    : target.y - source.y;
  const stubDelta = horizontal
    ? sourceStub.x - source.x
    : sourceStub.y - source.y;
  return Math.sign(terminalDelta) !== 0
    && Math.sign(stubDelta) !== 0
    && Math.sign(terminalDelta) !== Math.sign(stubDelta)
    ? Math.abs(stubDelta)
    : 0;
};

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
    if (bendCount > MAX_BEND_COUNT && patch?.data?.sharedTrunkSynthesized !== true) {
      issues.push({ edgeId, kind: 'excessive-bends', value: bendCount, limit: MAX_BEND_COUNT });
    }
    const retreatLength = terminalRetreatLength(path);
    if (
      bendCount > MAX_TERMINAL_RETREAT_BEND_COUNT
      && retreatLength >= MIN_TERMINAL_RETREAT
      && patch?.data?.sharedTrunkSynthesized !== true
    ) {
      issues.push({
        edgeId,
        kind: 'terminal-backtrack-chain',
        value: bendCount,
        limit: MAX_TERMINAL_RETREAT_BEND_COUNT,
      });
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
