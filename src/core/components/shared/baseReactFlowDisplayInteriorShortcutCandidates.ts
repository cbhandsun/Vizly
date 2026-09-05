import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import type { DisplayPoint } from './baseReactFlowDisplayGeometry';

/**
 * Remove aligned interior excursions while retaining both endpoint stubs.
 * Callers remain responsible for exact obstacle and whole-graph validation.
 */
export const buildTerminalPreservingInteriorShortcutCandidates = (
  path: DisplayPoint[],
  maxCandidates = 32,
  includeCorners = true,
): DisplayPoint[][] => {
  if (path.length < 6 || maxCandidates <= 0) return [];
  const candidates: Array<Readonly<{
    path: DisplayPoint[];
    removedPointCount: number;
    startIndex: number;
  }>> = [];
  const seen = new Set<string>();

  for (let startIndex = 1; startIndex <= path.length - 5; startIndex += 1) {
    for (let endIndex = startIndex + 3; endIndex <= path.length - 2; endIndex += 1) {
      const start = path[startIndex];
      const end = path[endIndex];
      const interval = path.slice(startIndex, endIndex + 1);
      const aligned = start.x === end.x || start.y === end.y;
      if (!aligned && !includeCorners) continue;
      const prefix = path.slice(0, startIndex + 1);
      const suffix = path.slice(endIndex);
      const seeds = aligned ? (() => {
        const axis = start.y === end.y ? 'h' : 'v';
        const alternateLanes = interval.slice(1).flatMap((point, index) => {
          const previous = interval[index];
          const isParallel = axis === 'h'
            ? point.y === previous.y && point.y !== start.y
            : point.x === previous.x && point.x !== start.x;
          return isParallel ? [axis === 'h' ? point.y : point.x] : [];
        });
        return [
          ...[...new Set(alternateLanes)].map(lane => [
            ...prefix,
            axis === 'h' ? { x: start.x, y: lane } : { x: lane, y: start.y },
            axis === 'h' ? { x: end.x, y: lane } : { x: lane, y: end.y },
            ...suffix,
          ]),
          [...prefix, ...suffix],
        ];
      })() : [[
        ...prefix,
        path[startIndex - 1].y === start.y
          ? { x: end.x, y: start.y }
          : { x: start.x, y: end.y },
        ...suffix,
      ]];
      for (const seed of seeds) {
        const candidate = compactOrthogonalPath(seed);
        if (candidate.length >= path.length) continue;
        const signature = candidate.map(point => `${point.x}:${point.y}`).join('|');
        if (seen.has(signature)) continue;
        seen.add(signature);
        candidates.push({
          path: candidate,
          removedPointCount: path.length - candidate.length,
          startIndex,
        });
      }
    }
  }

  return candidates
    .sort((first, second) => (
      second.removedPointCount - first.removedPointCount
      || first.startIndex - second.startIndex
    ))
    .slice(0, maxCandidates)
    .map(candidate => candidate.path);
};
