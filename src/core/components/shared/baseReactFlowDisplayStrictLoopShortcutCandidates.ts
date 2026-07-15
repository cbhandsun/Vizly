import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import type { DisplayPoint } from './baseReactFlowDisplayGeometry';

const pointKey = (point: DisplayPoint): string => `${point.x},${point.y}`;

const samePoint = (first: DisplayPoint, second: DisplayPoint): boolean => (
  Math.abs(first.x - second.x) <= 0.01 && Math.abs(first.y - second.y) <= 0.01
);

const orthogonalLength = (path: readonly DisplayPoint[]): number => {
  let length = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    length += Math.abs(path[index + 1].x - path[index].x)
      + Math.abs(path[index + 1].y - path[index].y);
  }
  return length;
};

interface RankedShortcut {
  path: DisplayPoint[];
  savedLength: number;
  removedPoints: number;
}

/**
 * Removes a clearable interior loop without changing either terminal stub.
 * Obstacle and whole-graph quality checks intentionally stay with the caller.
 */
export const buildStrictLoopShortcutCandidates = (
  inputPath: readonly DisplayPoint[],
  maxCandidates = 48,
): DisplayPoint[][] => {
  if (inputPath.length < 5 || maxCandidates <= 0) return [];
  const path = compactOrthogonalPath(inputPath.map(point => ({ ...point })));
  if (path.length < 5) return [];
  const ranked: RankedShortcut[] = [];
  const seen = new Set<string>();
  const baselineSignature = path.map(pointKey).join(';');

  // Index 0→1 and n-2→n-1 are endpoint stubs and must remain untouched.
  for (let startIndex = 1; startIndex <= path.length - 4; startIndex += 1) {
    for (let endIndex = startIndex + 2; endIndex <= path.length - 2; endIndex += 1) {
      const start = path[startIndex];
      const end = path[endIndex];
      const removedLength = orthogonalLength(path.slice(startIndex, endIndex + 1));
      const directLength = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
      const savedLength = removedLength - directLength;
      if (savedLength <= 1) continue;

      const bends: DisplayPoint[] = start.x === end.x || start.y === end.y
        ? []
        : [
          { x: end.x, y: start.y },
          { x: start.x, y: end.y },
        ];
      for (const bend of bends.length > 0 ? bends : [end]) {
        const candidate = compactOrthogonalPath([
          ...path.slice(0, startIndex + 1),
          ...(bend === end ? [] : [bend]),
          ...path.slice(endIndex),
        ]);
        if (
          candidate.length < 4
          || !samePoint(candidate[0], path[0])
          || !samePoint(candidate[1], path[1])
          || !samePoint(candidate[candidate.length - 2], path[path.length - 2])
          || !samePoint(candidate[candidate.length - 1], path[path.length - 1])
        ) continue;
        const signature = candidate.map(pointKey).join(';');
        if (seen.has(signature) || signature === baselineSignature) continue;
        seen.add(signature);
        ranked.push({
          path: candidate,
          savedLength,
          removedPoints: endIndex - startIndex - 1,
        });
      }
    }
  }

  return ranked
    .sort((first, second) => (
      second.savedLength - first.savedLength
      || second.removedPoints - first.removedPoints
      || orthogonalLength(first.path) - orthogonalLength(second.path)
    ))
    .slice(0, maxCandidates)
    .map(candidate => candidate.path);
};
