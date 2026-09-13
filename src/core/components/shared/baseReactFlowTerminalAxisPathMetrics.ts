import {
  TERMINAL_EPSILON as EPS,
  terminalAxisOf as axisOf,
  type TerminalAxis as Axis,
  type TerminalPoint as Point,
} from './baseReactFlowTerminalGeometry';

export const compactTerminalAxisPath = (path: Point[]): Point[] => {
  const deduped: Point[] = [];
  for (const point of path) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > EPS || Math.abs(previous.y - point.y) > EPS) {
      deduped.push({ x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 });
    }
  }
  if (deduped.length < 3) return deduped;
  const result: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    if (axisOf(previous, current) && axisOf(current, next) === axisOf(previous, current)) continue;
    result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
};

export const terminalAxisSegments = (path: Point[]): Array<{
  a: Point;
  b: Point;
  axis: Axis;
  index: number;
}> => path.slice(0, -1)
  .map((a, index) => ({ a, b: path[index + 1], axis: axisOf(a, path[index + 1]), index }))
  .filter((segment): segment is { a: Point; b: Point; axis: Axis; index: number } => Boolean(segment.axis));

export const terminalAxisPathLength = (path: Point[]): number => path.slice(0, -1).reduce((total, point, index) => (
  total + Math.abs(point.x - path[index + 1].x) + Math.abs(point.y - path[index + 1].y)
), 0);

export const hasTerminalAxisHairpin = (path: Point[]): boolean => {
  const pathSegments = terminalAxisSegments(path).map(segment => ({
    ...segment,
    direction: segment.axis === 'v'
      ? Math.sign(segment.b.y - segment.a.y)
      : Math.sign(segment.b.x - segment.a.x),
    length: Math.abs(segment.b.x - segment.a.x) + Math.abs(segment.b.y - segment.a.y),
  }));
  for (let index = 0; index < pathSegments.length - 2; index += 1) {
    const first = pathSegments[index];
    const middle = pathSegments[index + 1];
    const last = pathSegments[index + 2];
    if (
      first.axis === last.axis
      && first.direction === -last.direction
      && middle.length < 140
    ) return true;
  }
  return false;
};

export const hasTinyTerminalInteriorDogleg = (
  path: Point[],
  minimumInteriorLength: number,
): boolean => {
  for (let index = 1; index < path.length - 2; index += 1) {
    const length = Math.abs(path[index].x - path[index + 1].x)
      + Math.abs(path[index].y - path[index + 1].y);
    if (length < minimumInteriorLength) return true;
  }
  return false;
};
