import { axisOf, type Point, type Segment } from './edgeDetachedOverlapGeometry';

export type MazeDirection = 0 | 1 | 2 | 3 | 4;

type MazeTerminalCaps = {
  incoming: Segment;
  outgoing: Segment;
  incomingDirection: MazeDirection;
  outgoingDirection: MazeDirection;
};

const finitePoint = (value: unknown): value is Point => (
  value !== null && typeof value === 'object'
  && 'x' in value && typeof value.x === 'number' && Number.isFinite(value.x)
  && 'y' in value && typeof value.y === 'number' && Number.isFinite(value.y)
);

const directionOf = (segment: Segment): MazeDirection => segment.axis === 'h'
  ? segment.b.x > segment.a.x ? 2 : 1
  : segment.b.y > segment.a.y ? 4 : 3;

export const mazeDirectionsReverse = (first: MazeDirection, second: MazeDirection): boolean => (
  (first === 1 && second === 2) || (first === 2 && second === 1)
  || (first === 3 && second === 4) || (first === 4 && second === 3)
);

/** Undefined means unconstrained; null means malformed cap geometry. */
export const resolveMazeTerminalCaps = (
  value: unknown,
  start: Point,
  end: Point,
): MazeTerminalCaps | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object'
    || !('startPredecessor' in value) || !finitePoint(value.startPredecessor)
    || !('endSuccessor' in value) || !finitePoint(value.endSuccessor)) return null;
  const incomingAxis = axisOf(value.startPredecessor, start);
  const outgoingAxis = axisOf(end, value.endSuccessor);
  if (!incomingAxis || !outgoingAxis) return null;
  const incoming = { a: value.startPredecessor, b: start, axis: incomingAxis };
  const outgoing = { a: end, b: value.endSuccessor, axis: outgoingAxis };
  return { incoming, outgoing, incomingDirection: directionOf(incoming), outgoingDirection: directionOf(outgoing) };
};
