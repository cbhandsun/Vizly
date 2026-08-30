export type EdgeLabelPoint = { x: number; y: number };
export type EdgeLabelRect = { x: number; y: number; width: number; height: number };

const MAX_LABEL_MEASURE_CHARS = 96;
const MAX_SAFE_COORDINATE = 1_000_000;
const MAX_SAFE_SIZE = 100_000;

const clampNumber = (value: unknown, min: number, max: number): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
};

const normalizePoint = (point: EdgeLabelPoint | undefined): EdgeLabelPoint | null => {
  const x = clampNumber(point?.x, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE);
  const y = clampNumber(point?.y, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE);
  return x === null || y === null ? null : { x, y };
};

const normalizePath = (points: EdgeLabelPoint[]): EdgeLabelPoint[] => (
  Array.isArray(points)
    ? points.map(normalizePoint).filter((point): point is EdgeLabelPoint => !!point)
    : []
);

const normalizeRect = (rect: EdgeLabelRect | undefined): EdgeLabelRect | null => {
  const x = clampNumber(rect?.x, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE);
  const y = clampNumber(rect?.y, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE);
  const width = clampNumber(rect?.width, 0, MAX_SAFE_SIZE);
  const height = clampNumber(rect?.height, 0, MAX_SAFE_SIZE);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
};

const normalizeRects = (rects: EdgeLabelRect[]): EdgeLabelRect[] => (
  Array.isArray(rects)
    ? rects.map(normalizeRect).filter((rect): rect is EdgeLabelRect => !!rect)
    : []
);

const normalizeLabelText = (labelText: string): string => (
  String(labelText)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL_MEASURE_CHARS)
);

const isOrthogonalSegment = (a: EdgeLabelPoint, b: EdgeLabelPoint): boolean => (
  Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1
);

export const estimateEdgeLabelRect = (
  center: EdgeLabelPoint,
  labelText: string,
  labelScale = 1,
): EdgeLabelRect => {
  const normalizedCenter = normalizePoint(center) ?? { x: 0, y: 0 };
  const text = normalizeLabelText(labelText);
  const scale = clampNumber(labelScale, 1, 2.4) ?? 1;
  const width = Math.max(42, Math.min(220, text.length * 8 + 22)) * scale;
  return {
    x: normalizedCenter.x - width / 2,
    y: normalizedCenter.y - 13 * scale,
    width,
    height: 26 * scale,
  };
};

const segmentDistanceToRect = (a: EdgeLabelPoint, b: EdgeLabelPoint, rect: EdgeLabelRect): number => {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  if (Math.abs(a.x - b.x) < 1) {
    const x = a.x;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const dx = x < left ? left - x : x > right ? x - right : 0;
    const dy = maxY < top ? top - maxY : minY > bottom ? minY - bottom : 0;
    return Math.hypot(dx, dy);
  }

  if (Math.abs(a.y - b.y) < 1) {
    const y = a.y;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const dx = maxX < left ? left - maxX : minX > right ? minX - right : 0;
    const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
    return Math.hypot(dx, dy);
  }

  return Number.POSITIVE_INFINITY;
};

const labelPathClearance = (
  center: EdgeLabelPoint,
  labelText: string,
  points: EdgeLabelPoint[],
  labelScale: number,
): number => {
  const rect = estimateEdgeLabelRect(center, labelText, labelScale);
  let clearance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!isOrthogonalSegment(a, b)) continue;
    clearance = Math.min(clearance, segmentDistanceToRect(a, b, rect));
  }
  return clearance;
};

const peerPathClearance = (
  center: EdgeLabelPoint,
  labelText: string,
  peerPaths: EdgeLabelPoint[][],
  labelScale: number,
): number => {
  if (!peerPaths.length) return Number.POSITIVE_INFINITY;
  return peerPaths.reduce(
    (best, points) => Math.min(best, labelPathClearance(center, labelText, points, labelScale)),
    Number.POSITIVE_INFINITY,
  );
};

const rectDistance = (first: EdgeLabelRect, second: EdgeLabelRect): number => {
  const firstRight = first.x + first.width;
  const firstBottom = first.y + first.height;
  const secondRight = second.x + second.width;
  const secondBottom = second.y + second.height;
  const dx = firstRight < second.x ? second.x - firstRight : secondRight < first.x ? first.x - secondRight : 0;
  const dy = firstBottom < second.y ? second.y - firstBottom : secondBottom < first.y ? first.y - secondBottom : 0;
  return Math.hypot(dx, dy);
};

const obstacleClearance = (
  center: EdgeLabelPoint,
  labelText: string,
  obstacles: EdgeLabelRect[],
  labelScale: number,
): number => {
  if (!obstacles.length) return Number.POSITIVE_INFINITY;
  const rect = estimateEdgeLabelRect(center, labelText, labelScale);
  return obstacles.reduce((best, obstacle) => Math.min(best, rectDistance(rect, obstacle)), Number.POSITIVE_INFINITY);
};

const nearestOwnSegment = (ownPath: EdgeLabelPoint[], labelPoint: EdgeLabelPoint): {
  a: EdgeLabelPoint;
  b: EdgeLabelPoint;
  distance: number;
} | null => {
  let nearest: { a: EdgeLabelPoint; b: EdgeLabelPoint; distance: number } | null = null;
  for (let index = 0; index < ownPath.length - 1; index += 1) {
    const a = ownPath[index];
    const b = ownPath[index + 1];
    if (!isOrthogonalSegment(a, b)) continue;
    const vertical = Math.abs(a.x - b.x) < 1;
    const min = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
    const max = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
    const value = vertical ? labelPoint.y : labelPoint.x;
    const clamped = Math.max(min, Math.min(max, value));
    const distance = vertical
      ? Math.hypot(labelPoint.x - a.x, labelPoint.y - clamped)
      : Math.hypot(labelPoint.x - clamped, labelPoint.y - a.y);
    if (!nearest || distance < nearest.distance) nearest = { a, b, distance };
  }
  return nearest;
};

export const getEdgeLabelAutoOffset = (
  ownPath: EdgeLabelPoint[],
  labelPoint: EdgeLabelPoint,
  labelText: string,
  peerPaths: EdgeLabelPoint[][] = [],
  obstacles: EdgeLabelRect[] = [],
  labelScale = 1,
): EdgeLabelPoint => {
  const safeOwnPath = normalizePath(ownPath);
  const safeLabelPoint = normalizePoint(labelPoint);
  const safeLabelText = normalizeLabelText(labelText);
  if (safeOwnPath.length < 2 || !safeLabelPoint || !safeLabelText) return { x: 0, y: 0 };
  const safePeerPaths = Array.isArray(peerPaths)
    ? peerPaths.map(normalizePath).filter(points => points.length >= 2)
    : [];
  const safeObstacles = normalizeRects(obstacles);
  const safeLabelScale = clampNumber(labelScale, 1, 2.4) ?? 1;
  const nearest = nearestOwnSegment(safeOwnPath, safeLabelPoint);
  if (!nearest) return { x: 0, y: 0 };

  const desiredOwnClearance = 8;
  const desiredPeerClearance = 8;
  const desiredObstacleClearance = 10;
  const currentOwnClearance = labelPathClearance(safeLabelPoint, safeLabelText, safeOwnPath, safeLabelScale);
  const currentPeerClearance = peerPathClearance(safeLabelPoint, safeLabelText, safePeerPaths, safeLabelScale);
  const currentObstacleClearance = obstacleClearance(safeLabelPoint, safeLabelText, safeObstacles, safeLabelScale);
  if (
    nearest.distance > 12
    && currentOwnClearance >= desiredOwnClearance
    && currentPeerClearance >= desiredPeerClearance
    && currentObstacleClearance >= desiredObstacleClearance
  ) return { x: 0, y: 0 };

  const vertical = Math.abs(nearest.a.x - nearest.b.x) < 1;
  const estimated = estimateEdgeLabelRect(safeLabelPoint, safeLabelText, safeLabelScale);
  const perpendicular = vertical
    ? Math.max(16, estimated.width / 2 + desiredOwnClearance)
    : Math.max(16, estimated.height / 2 + desiredOwnClearance);
  const along = Math.max(14, Math.min(32, safeLabelText.length * 1.5 + 8));
  const mediumAlong = Math.max(32, Math.min(48, estimated.width / 2));
  const farAlong = Math.max(
    48,
    Math.min(96, estimated.width / 2 + desiredObstacleClearance + 40),
  );
  const preferred = vertical
    ? (safeLabelPoint.x >= nearest.a.x ? 1 : -1)
    : (safeLabelPoint.y >= nearest.a.y ? 1 : -1);
  const nearCandidates = vertical
    ? [
      { x: 0, y: 0 },
      { x: preferred * perpendicular, y: 0 },
      { x: -preferred * perpendicular, y: 0 },
      { x: preferred * perpendicular, y: along },
      { x: preferred * perpendicular, y: -along },
      { x: -preferred * perpendicular, y: along },
      { x: -preferred * perpendicular, y: -along },
      { x: preferred * perpendicular, y: mediumAlong },
      { x: preferred * perpendicular, y: -mediumAlong },
      { x: -preferred * perpendicular, y: mediumAlong },
      { x: -preferred * perpendicular, y: -mediumAlong },
    ]
    : [
      { x: 0, y: 0 },
      { x: 0, y: preferred * perpendicular },
      { x: 0, y: -preferred * perpendicular },
      { x: along, y: preferred * perpendicular },
      { x: -along, y: preferred * perpendicular },
      { x: along, y: -preferred * perpendicular },
      { x: -along, y: -preferred * perpendicular },
      { x: mediumAlong, y: preferred * perpendicular },
      { x: -mediumAlong, y: preferred * perpendicular },
      { x: mediumAlong, y: -preferred * perpendicular },
      { x: -mediumAlong, y: -preferred * perpendicular },
    ];
  const farCandidates = vertical
    ? [
      { x: preferred * perpendicular, y: farAlong },
      { x: preferred * perpendicular, y: -farAlong },
      { x: -preferred * perpendicular, y: farAlong },
      { x: -preferred * perpendicular, y: -farAlong },
    ]
    : [
      { x: farAlong, y: preferred * perpendicular },
      { x: -farAlong, y: preferred * perpendicular },
      { x: farAlong, y: -preferred * perpendicular },
      { x: -farAlong, y: -preferred * perpendicular },
    ];

  let best = nearCandidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestPeerClearance = Number.NEGATIVE_INFINITY;
  let bestNodeClearance = Number.NEGATIVE_INFINITY;
  const considerCandidates = (candidates: EdgeLabelPoint[]): void => {
    for (const candidate of candidates) {
    const center = { x: safeLabelPoint.x + candidate.x, y: safeLabelPoint.y + candidate.y };
    const ownClearance = labelPathClearance(center, safeLabelText, safeOwnPath, safeLabelScale);
    const peerClearance = peerPathClearance(center, safeLabelText, safePeerPaths, safeLabelScale);
    const nodeClearance = obstacleClearance(center, safeLabelText, safeObstacles, safeLabelScale);
    const displacement = Math.hypot(candidate.x, candidate.y);
    const score = Math.min(ownClearance, desiredOwnClearance * 2)
      + Math.min(peerClearance, desiredPeerClearance * 2) * 2
      + Math.min(nodeClearance, desiredObstacleClearance * 2) * 2
      - Math.max(0, desiredPeerClearance - peerClearance) * 10
      - Math.max(0, desiredObstacleClearance - nodeClearance) * 10
      - displacement * 0.035;
    const candidateClearsNodes = nodeClearance >= desiredObstacleClearance;
    const bestClearsNodes = bestNodeClearance >= desiredObstacleClearance;
    if ((candidateClearsNodes && !bestClearsNodes) || (candidateClearsNodes === bestClearsNodes && score > bestScore)) {
      bestScore = score;
      best = candidate;
      bestPeerClearance = peerClearance;
      bestNodeClearance = nodeClearance;
    }
  }
  };
  considerCandidates(nearCandidates);
  if (bestPeerClearance < desiredPeerClearance || bestNodeClearance < desiredObstacleClearance) {
    considerCandidates(farCandidates);
  }
  return best;
};
