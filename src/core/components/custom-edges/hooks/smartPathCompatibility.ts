export type SmartPathPoint = { x: number; y: number };

export interface SmartPathHandleCoordinates {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export const pointsToOrthogonalPath = (points: SmartPathPoint[]): string => {
  if (!Array.isArray(points) || points.length === 0) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
};

export const getComputedPoints = (value: unknown): SmartPathPoint[] | null => {
  if (!Array.isArray(value) || value.length <= 1) return null;
  if (!value.every(point => (
    point !== null
    && typeof point === 'object'
    && typeof Reflect.get(point, 'x') === 'number'
    && Number.isFinite(Reflect.get(point, 'x'))
    && typeof Reflect.get(point, 'y') === 'number'
    && Number.isFinite(Reflect.get(point, 'y'))
  ))) return null;
  return value as SmartPathPoint[];
};

const isPointNear = (a: SmartPathPoint, b: SmartPathPoint, tolerance = 40): boolean => (
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance
);

export const isComputedPathCompatibleWithHandles = (
  points: SmartPathPoint[] | null,
  centeredCoords: SmartPathHandleCoordinates,
  respectSourceHandle: boolean,
  respectTargetHandle: boolean,
): boolean => {
  if (!points || points.length < 2) return false;
  const first = points[0];
  const last = points[points.length - 1];
  if (respectSourceHandle && !isPointNear(first, { x: centeredCoords.sourceX, y: centeredCoords.sourceY })) return false;
  if (respectTargetHandle && !isPointNear(last, { x: centeredCoords.targetX, y: centeredCoords.targetY })) return false;
  return true;
};

export const isRoutingResultCompatibleWithHandles = (
  result: { points?: SmartPathPoint[]; path?: string } | null | undefined,
  centeredCoords: SmartPathHandleCoordinates,
  respectSourceHandle: boolean,
  respectTargetHandle: boolean,
): boolean => {
  if (!respectSourceHandle && !respectTargetHandle) return true;
  return isComputedPathCompatibleWithHandles(
    result?.points ?? null,
    centeredCoords,
    respectSourceHandle,
    respectTargetHandle,
  );
};
