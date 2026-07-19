import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import type { RoutingCrossingScorerOptions } from './routingCrossingScorer';
import type { WaypointRefinementOptions } from './orthogonalWaypointRefinerTypes';

const MAX_COORDINATE = 10_000_000;
const MAX_PATHS = 10_000;
const MAX_POINTS_PER_PATH = 10_000;
const MAX_AXIS_VALUES = 4_096;
const MAX_LIMIT = 100_000;

const clampCoordinate = (value: number): number =>
  Math.min(MAX_COORDINATE, Math.max(-MAX_COORDINATE, value));

const normalizeOptionalLimit = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(MAX_LIMIT, Math.max(0, Math.floor(value)));
};

const normalizeAxisValues = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((axis): axis is number => typeof axis === 'number' && Number.isFinite(axis))
    .slice(0, MAX_AXIS_VALUES)
    .map(clampCoordinate);
};

const normalizeRectangles = (value: unknown): Rectangle[] => {
  if (!Array.isArray(value)) return [];
  const rectangles: Rectangle[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const { x, y, width, height } = candidate as Partial<Rectangle>;
    if (![x, y, width, height].every(item =>
      typeof item === 'number' && Number.isFinite(item))) continue;
    if ((width as number) <= 1 || (height as number) <= 1) continue;
    rectangles.push({
      x: clampCoordinate(x as number),
      y: clampCoordinate(y as number),
      width: Math.min(MAX_COORDINATE * 2, width as number),
      height: Math.min(MAX_COORDINATE * 2, height as number),
    });
  }
  return rectangles;
};

const normalizeBuddyGroups = (value: unknown): BuddyGroup[] => {
  if (!Array.isArray(value)) return [];
  const groups: BuddyGroup[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const { type, edgeIds } = candidate as { type?: unknown; edgeIds?: unknown };
    if (type !== 'o2m' && type !== 'm2o') continue;
    const iterable = edgeIds instanceof Set || Array.isArray(edgeIds) ? edgeIds : [];
    groups.push({
      type,
      edgeIds: new Set([...iterable].filter(id => typeof id === 'string')),
    });
  }
  return groups;
};

const normalizeScoring = (value: unknown): WaypointRefinementOptions['scoring'] => {
  if (!value || typeof value !== 'object') return undefined;
  const result: Record<string, number> = {};
  for (const key of [
    'hardCrossingWeight',
    'softObstacleWeight',
    'softNearMissWeight',
    'softNearMissPadding',
    'buddyCrossingWeight',
    'parallelOverlapWeight',
    'parallelOverlapMinLength',
    'turnbackWeight',
    'bendWeight',
  ] satisfies Array<keyof RoutingCrossingScorerOptions>) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) continue;
    result[key] = Math.min(1_000_000, Math.max(0, candidate));
  }
  return result;
};

export function normalizeWaypointPaths(value: unknown): Map<string, Point[]> {
  if (!(value instanceof Map)) return new Map();
  const paths = new Map<string, Point[]>();
  let pathCount = 0;
  for (const [edgeId, rawPoints] of value) {
    if (pathCount >= MAX_PATHS) break;
    if (typeof edgeId !== 'string' || !Array.isArray(rawPoints)) continue;
    const points: Point[] = [];
    for (const candidate of rawPoints.slice(0, MAX_POINTS_PER_PATH)) {
      if (!candidate || typeof candidate !== 'object') continue;
      const { x, y } = candidate as Partial<Point>;
      if (typeof x !== 'number' || !Number.isFinite(x)
        || typeof y !== 'number' || !Number.isFinite(y)) continue;
      points.push({ x: clampCoordinate(x), y: clampCoordinate(y) });
    }
    paths.set(edgeId, points);
    pathCount++;
  }
  return paths;
}

export function normalizeWaypointRefinementOptions(
  value: unknown,
): WaypointRefinementOptions {
  const options = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const spacing = typeof options.spacing === 'number' && Number.isFinite(options.spacing)
    ? Math.min(10_000, Math.max(1, options.spacing))
    : 12;
  const fixedEdgeIds = options.fixedEdgeIds instanceof Set
    ? new Set([...options.fixedEdgeIds].filter(id => typeof id === 'string'))
    : new Set<string>();

  return {
    buddyGroups: normalizeBuddyGroups(options.buddyGroups),
    fixedEdgeIds,
    hardObstacles: normalizeRectangles(options.hardObstacles),
    softObstacles: normalizeRectangles(options.softObstacles),
    spacing,
    maxPasses: normalizeOptionalLimit(options.maxPasses),
    maxEdgesPerPass: normalizeOptionalLimit(options.maxEdgesPerPass),
    candidateAxes: {
      horizontal: normalizeAxisValues(
        (options.candidateAxes as Record<string, unknown> | undefined)?.horizontal,
      ),
      vertical: normalizeAxisValues(
        (options.candidateAxes as Record<string, unknown> | undefined)?.vertical,
      ),
    },
    enableReroute: typeof options.enableReroute === 'boolean'
      ? options.enableReroute
      : undefined,
    maxRerouteEdges: normalizeOptionalLimit(options.maxRerouteEdges),
    maxRerouteCandidates: normalizeOptionalLimit(options.maxRerouteCandidates),
    maxSegmentShiftCandidatesPerEdge: normalizeOptionalLimit(
      options.maxSegmentShiftCandidatesPerEdge,
    ),
    scoring: normalizeScoring(options.scoring),
  };
}
