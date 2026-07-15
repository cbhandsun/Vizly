export type SharedNodePortPoint = Readonly<{
  x: number;
  y: number;
}>;

export type SharedNodePortRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type SharedNodePortSide = 'top' | 'bottom' | 'left' | 'right';
export type SharedNodePortRole = 'source' | 'target';

const EPSILON = 0.5;

const samePoint = (first: SharedNodePortPoint, second: SharedNodePortPoint): boolean => (
  Math.abs(first.x - second.x) <= EPSILON && Math.abs(first.y - second.y) <= EPSILON
);

const axisOf = (
  first: SharedNodePortPoint,
  second: SharedNodePortPoint,
): 'h' | 'v' | null => {
  if (Math.abs(first.y - second.y) <= EPSILON && Math.abs(first.x - second.x) > EPSILON) return 'h';
  if (Math.abs(first.x - second.x) <= EPSILON && Math.abs(first.y - second.y) > EPSILON) return 'v';
  return null;
};

const compactPath = (path: readonly SharedNodePortPoint[]): SharedNodePortPoint[] => {
  const deduped: SharedNodePortPoint[] = [];
  for (const point of path) {
    const previous = deduped[deduped.length - 1];
    if (!previous || !samePoint(previous, point)) deduped.push({ x: point.x, y: point.y });
  }
  if (deduped.length < 3) return deduped;

  const compacted: SharedNodePortPoint[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = compacted[compacted.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const incomingAxis = axisOf(previous, current);
    if (incomingAxis && incomingAxis === axisOf(current, next)) continue;
    compacted.push(current);
  }
  compacted.push(deduped[deduped.length - 1]);
  return compacted;
};

const endpointForSide = (
  rect: SharedNodePortRect,
  side: SharedNodePortSide,
): SharedNodePortPoint => {
  if (side === 'left') return { x: rect.x, y: rect.y + rect.height / 2 };
  if (side === 'right') return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  if (side === 'top') return { x: rect.x + rect.width / 2, y: rect.y };
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
};

const outwardPoint = (
  point: SharedNodePortPoint,
  side: SharedNodePortSide,
  distance: number,
): SharedNodePortPoint => {
  if (side === 'left') return { x: point.x - distance, y: point.y };
  if (side === 'right') return { x: point.x + distance, y: point.y };
  if (side === 'top') return { x: point.x, y: point.y - distance };
  return { x: point.x, y: point.y + distance };
};

const isOrthogonalFinitePath = (path: readonly SharedNodePortPoint[]): boolean => (
  path.length >= 2
  && path.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))
  && path.slice(0, -1).every((point, index) => axisOf(point, path[index + 1]) !== null)
);

/**
 * Builds bounded geometry-only candidates that move one terminal to another
 * side of the same node. The caller remains responsible for port-policy,
 * obstacle, and whole-graph quality gates.
 */
export const buildSharedNodeTerminalSideCandidates = (
  path: readonly SharedNodePortPoint[],
  role: SharedNodePortRole,
  rect: SharedNodePortRect,
  side: SharedNodePortSide,
  minStub = 48,
  maxCandidates = 3,
  connectorLanes: readonly number[] = [],
): SharedNodePortPoint[][] => {
  if (
    !isOrthogonalFinitePath(path)
    || !Number.isFinite(rect.x)
    || !Number.isFinite(rect.y)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
    || !Number.isFinite(minStub)
    || minStub <= 0
    || !Number.isInteger(maxCandidates)
    || maxCandidates <= 0
  ) return [];

  const oriented = role === 'target'
    ? path.map(point => ({ x: point.x, y: point.y }))
    : [...path].reverse().map(point => ({ x: point.x, y: point.y }));
  const endpoint = endpointForSide(rect, side);
  const horizontalTerminal = side === 'left' || side === 'right';
  const outerCoordinate = side === 'left'
    ? rect.x - minStub
    : side === 'right'
      ? rect.x + rect.width + minStub
      : side === 'top'
        ? rect.y - minStub
        : rect.y + rect.height + minStub;
  const firstSpliceIndex = Math.max(1, oriented.length - 5);
  const candidates: SharedNodePortPoint[][] = [];
  const seen = new Set<string>();

  for (let spliceIndex = firstSpliceIndex; spliceIndex >= 1 && candidates.length < maxCandidates; spliceIndex -= 1) {
    const splice = oriented[spliceIndex];
    const laneCoordinates = [
      ...connectorLanes.filter(Number.isFinite),
      horizontalTerminal ? splice.y : splice.x,
    ];
    for (const connectorLane of laneCoordinates) {
      if (candidates.length >= maxCandidates) break;
      const candidate = compactPath(horizontalTerminal
        ? [
          ...oriented.slice(0, spliceIndex + 1),
          { x: splice.x, y: connectorLane },
          { x: outerCoordinate, y: connectorLane },
          { x: outerCoordinate, y: endpoint.y },
          endpoint,
        ]
        : [
          ...oriented.slice(0, spliceIndex + 1),
          { x: connectorLane, y: splice.y },
          { x: connectorLane, y: outerCoordinate },
          { x: endpoint.x, y: outerCoordinate },
          endpoint,
        ]);
      const restored = role === 'target' ? candidate : [...candidate].reverse();
      if (!isOrthogonalFinitePath(restored)) continue;
      const untouchedTerminal = role === 'target' ? path[0] : path[path.length - 1];
      const actualUntouchedTerminal = role === 'target' ? restored[0] : restored[restored.length - 1];
      if (!samePoint(untouchedTerminal, actualUntouchedTerminal)) continue;
      const key = restored.map(point => `${point.x}:${point.y}`).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(restored);
    }
  }
  return candidates;
};

/**
 * Preserves the nearest stable exterior lane while replacing only the final
 * terminal neighborhood. The wider shared-node candidates above deliberately
 * splice farther back; this bounded companion covers paths whose outer detour
 * is already clean but whose last segments slide tangentially on a node.
 */
export const buildNearTerminalSideCandidates = (
  path: readonly SharedNodePortPoint[],
  role: SharedNodePortRole,
  rect: SharedNodePortRect,
  side: SharedNodePortSide,
  minStub = 48,
  maxCandidates = 2,
): SharedNodePortPoint[][] => {
  if (
    !isOrthogonalFinitePath(path)
    || !Number.isFinite(rect.x)
    || !Number.isFinite(rect.y)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
    || !Number.isFinite(minStub)
    || minStub <= 0
    || !Number.isInteger(maxCandidates)
    || maxCandidates <= 0
  ) return [];

  const oriented = role === 'target'
    ? path.map(point => ({ x: point.x, y: point.y }))
    : [...path].reverse().map(point => ({ x: point.x, y: point.y }));
  if (oriented.length < 4) return [];
  const endpoint = endpointForSide(rect, side);
  const horizontalTerminal = side === 'left' || side === 'right';
  const outerCoordinate = side === 'left'
    ? rect.x - minStub
    : side === 'right'
      ? rect.x + rect.width + minStub
      : side === 'top'
        ? rect.y - minStub
        : rect.y + rect.height + minStub;
  const firstSpliceIndex = Math.max(1, oriented.length - 5);
  const lastSpliceIndex = oriented.length - 3;
  const candidates: SharedNodePortPoint[][] = [];
  const seen = new Set<string>();

  for (
    let spliceIndex = lastSpliceIndex;
    spliceIndex >= firstSpliceIndex && candidates.length < maxCandidates;
    spliceIndex -= 1
  ) {
    const splice = oriented[spliceIndex];
    const connectorLane = horizontalTerminal ? splice.y : splice.x;
    const candidate = compactPath(horizontalTerminal
      ? [
        ...oriented.slice(0, spliceIndex + 1),
        { x: outerCoordinate, y: connectorLane },
        { x: outerCoordinate, y: endpoint.y },
        endpoint,
      ]
      : [
        ...oriented.slice(0, spliceIndex + 1),
        { x: connectorLane, y: outerCoordinate },
        { x: endpoint.x, y: outerCoordinate },
        endpoint,
      ]);
    const restored = role === 'target' ? candidate : [...candidate].reverse();
    if (!isOrthogonalFinitePath(restored)) continue;
    const untouchedTerminal = role === 'target' ? path[0] : path[path.length - 1];
    const actualUntouchedTerminal = role === 'target' ? restored[0] : restored[restored.length - 1];
    if (!samePoint(untouchedTerminal, actualUntouchedTerminal)) continue;
    const key = restored.map(point => `${point.x}:${point.y}`).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(restored);
  }
  return candidates;
};

export const buildFacingPortPathCandidates = (
  sourceRect: SharedNodePortRect,
  targetRect: SharedNodePortRect,
  sourceSide: SharedNodePortSide,
  targetSide: SharedNodePortSide,
  minStub = 48,
): SharedNodePortPoint[][] => {
  if (
    !Number.isFinite(minStub)
    || minStub <= 0
    || [sourceRect, targetRect].some(rect => (
      !Number.isFinite(rect.x)
      || !Number.isFinite(rect.y)
      || !Number.isFinite(rect.width)
      || !Number.isFinite(rect.height)
      || rect.width <= 0
      || rect.height <= 0
    ))
  ) return [];
  const source = endpointForSide(sourceRect, sourceSide);
  const target = endpointForSide(targetRect, targetSide);
  const sourceStub = outwardPoint(source, sourceSide, minStub);
  const targetStub = outwardPoint(target, targetSide, minStub);
  const sourceVertical = sourceSide === 'top' || sourceSide === 'bottom';
  const bridges = sourceVertical
    ? [
      { x: sourceStub.x, y: targetStub.y },
      { x: targetStub.x, y: sourceStub.y },
    ]
    : [
      { x: targetStub.x, y: sourceStub.y },
      { x: sourceStub.x, y: targetStub.y },
    ];
  const candidates = bridges
    .map(bridge => compactPath([source, sourceStub, bridge, targetStub, target]))
    .filter(isOrthogonalFinitePath);
  return candidates.filter((candidate, index) => (
    candidates.findIndex(other => other.length === candidate.length && other.every((point, pointIndex) => (
      samePoint(point, candidate[pointIndex])
    ))) === index
  ));
};
