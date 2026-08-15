import type {
  TerminalPoint as Point,
  TerminalRect as Rect,
} from './baseReactFlowTerminalGeometry';

export interface TerminalAxisCandidateSeed {
  path: Point[];
  minimumPointCount: number;
}

type CompactTerminalPath = (path: Point[]) => Point[];

type TerminalAxisOuterCoordinateSelection = Readonly<{
  targetLanes: number[];
  trunks: number[];
}>;

const uniqueRoundedCoordinates = (values: readonly number[]): number[] => [...new Set(values
  .filter(Number.isFinite)
  .map(value => Math.round(value * 100) / 100))];

export const createTerminalAxisCoordinatePools = (
  paths: readonly Point[][],
  obstacles: ReadonlyMap<string, Rect>,
  laneGap: number,
  terminalStub: number,
): { x: number[]; y: number[] } => {
  const x: number[] = [];
  const y: number[] = [];
  const add = (target: number[], value: number): void => {
    target.push(
      value,
      value - laneGap,
      value + laneGap,
      value - terminalStub,
      value + terminalStub,
    );
  };
  for (const path of paths) for (const point of path) {
    add(x, point.x);
    add(y, point.y);
  }
  for (const rect of obstacles.values()) {
    add(x, rect.x);
    add(x, rect.x + rect.width);
    add(y, rect.y);
    add(y, rect.y + rect.height);
  }
  return { x, y };
};

export const selectNearestTerminalAxisCoordinates = (
  values: readonly number[],
  preferred: number,
  limit: number,
): number[] => uniqueRoundedCoordinates(values)
  .sort((first, second) => Math.abs(first - preferred) - Math.abs(second - preferred))
  .slice(0, Math.max(0, limit));

const selectNearestCoordinatesWithExtremes = (
  values: readonly number[],
  preferred: number,
  nearestLimit: number,
): number[] => {
  const nearest = selectNearestTerminalAxisCoordinates(values, preferred, nearestLimit);
  const ordered = uniqueRoundedCoordinates(values).sort((first, second) => first - second);
  if (ordered.length === 0) return nearest;
  return [...new Set([...nearest, ordered[0], ordered[ordered.length - 1]])];
};

export const selectTerminalAxisOuterCoordinates = ({
  targetValues,
  trunkValues,
  targetPreferred,
  trunkPreferred,
  boundProduct,
  maximumCandidateCount,
  targetNearestLimit,
  trunkNearestLimit,
}: Readonly<{
  targetValues: readonly number[];
  trunkValues: readonly number[];
  targetPreferred: number;
  trunkPreferred: number;
  boundProduct: boolean;
  maximumCandidateCount: number;
  targetNearestLimit: number;
  trunkNearestLimit: number;
}>): TerminalAxisOuterCoordinateSelection => {
  const targetLanes = uniqueRoundedCoordinates(targetValues);
  const trunks = uniqueRoundedCoordinates(trunkValues);
  if (
    !boundProduct
    || targetLanes.length * trunks.length <= Math.max(0, maximumCandidateCount)
  ) return { targetLanes, trunks };
  return {
    targetLanes: selectNearestCoordinatesWithExtremes(
      targetLanes,
      targetPreferred,
      targetNearestLimit,
    ),
    trunks: selectNearestCoordinatesWithExtremes(
      trunks,
      trunkPreferred,
      trunkNearestLimit,
    ),
  };
};

const manhattanPathLength = (path: Point[]): number => path.slice(0, -1)
  .reduce((total, point, index) => (
    total + Math.abs(path[index + 1].x - point.x) + Math.abs(path[index + 1].y - point.y)
  ), 0);

export const selectBoundedTerminalAxisCandidates = (
  candidateSeeds: TerminalAxisCandidateSeed[],
  compactPath: CompactTerminalPath,
  maximumCandidateCount: number,
): Point[][] => {
  if (maximumCandidateCount <= 0) return [];
  const rankedSeeds = candidateSeeds
    .map((candidate, originalIndex) => ({
      ...candidate,
      length: manhattanPathLength(candidate.path),
      originalIndex,
    }))
    .sort((first, second) => first.length - second.length || first.originalIndex - second.originalIndex);
  const candidates: Point[][] = [];
  const signatures = new Set<string>();
  for (const seed of rankedSeeds) {
    const candidate = compactPath(seed.path);
    if (candidate.length < seed.minimumPointCount) continue;
    const signature = candidate.map(point => `${point.x},${point.y}`).join('|');
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    candidates.push(candidate);
    if (candidates.length >= maximumCandidateCount) break;
  }
  return candidates;
};
