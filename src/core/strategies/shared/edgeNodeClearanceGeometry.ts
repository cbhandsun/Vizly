import { lineIntersectsRect } from '../../algorithms/geometryUtils';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Segment = { a: Point; b: Point };

const EPS = 0.5;

const axisOf = (start: Point, end: Point): 'h' | 'v' | null => {
  if (Math.abs(start.y - end.y) < EPS && Math.abs(start.x - end.x) > EPS) return 'h';
  if (Math.abs(start.x - end.x) < EPS && Math.abs(start.y - end.y) > EPS) return 'v';
  return null;
};

export const segmentIntersectsClearanceRect = (
  segment: Segment,
  rect: Rect,
  padding = 10,
): boolean => {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (Math.abs(segment.a.y - segment.b.y) < EPS) {
    const y = segment.a.y;
    if (y <= y1 || y >= y2) return false;
    return Math.max(Math.min(segment.a.x, segment.b.x), x1)
      < Math.min(Math.max(segment.a.x, segment.b.x), x2);
  }
  if (Math.abs(segment.a.x - segment.b.x) < EPS) {
    const x = segment.a.x;
    if (x <= x1 || x >= x2) return false;
    return Math.max(Math.min(segment.a.y, segment.b.y), y1)
      < Math.min(Math.max(segment.a.y, segment.b.y), y2);
  }
  // Fractional terminal coordinates can produce near-axis segments exactly at
  // the orthogonal tolerance. They still have physical geometry to audit.
  return lineIntersectsRect({ start: segment.a, end: segment.b }, {
    x: x1, y: y1, width: x2 - x1, height: y2 - y1,
  });
};

const distancePointToSegment = (point: Point, segment: Segment): number => {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const lengthSquared = dx * dx + dy * dy;
  const factor = lengthSquared === 0
    ? 0
    : Math.max(
      0,
      Math.min(
        1,
        ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / lengthSquared,
      ),
    );
  return Math.hypot(
    point.x - (segment.a.x + dx * factor),
    point.y - (segment.a.y + dy * factor),
  );
};

export const segmentToClearanceRectDistance = (segment: Segment, rect: Rect): number => {
  const axis = axisOf(segment.a, segment.b);
  if (axis) {
    const segmentMinX = Math.min(segment.a.x, segment.b.x);
    const segmentMaxX = Math.max(segment.a.x, segment.b.x);
    const segmentMinY = Math.min(segment.a.y, segment.b.y);
    const segmentMaxY = Math.max(segment.a.y, segment.b.y);
    const deltaX = Math.max(
      rect.x - segmentMaxX,
      segmentMinX - (rect.x + rect.width),
      0,
    );
    const deltaY = Math.max(
      rect.y - segmentMaxY,
      segmentMinY - (rect.y + rect.height),
      0,
    );
    if (deltaX === 0) return deltaY;
    if (deltaY === 0) return deltaX;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }
  if (segmentIntersectsClearanceRect(segment, rect, 0)) return 0;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return Math.min(...corners.map(corner => distancePointToSegment(corner, segment)));
};
