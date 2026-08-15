import type { ElkExtendedEdge, ElkPoint } from 'elkjs';

export type DomainElkLayoutRoutePoint = Readonly<{ x: number; y: number }>;

const finitePoint = (value: ElkPoint | undefined): value is ElkPoint => (
  Boolean(value)
  && Number.isFinite(value?.x)
  && Number.isFinite(value?.y)
);

const offsetPoint = (
  point: ElkPoint,
  offset: DomainElkLayoutRoutePoint,
): DomainElkLayoutRoutePoint => ({
  x: Math.round(point.x + offset.x),
  y: Math.round(point.y + offset.y),
});

const compactRoute = (
  points: DomainElkLayoutRoutePoint[],
): DomainElkLayoutRoutePoint[] => points.filter((point, index) => {
  if (index === 0) return true;
  const previous = points[index - 1];
  return point.x !== previous.x || point.y !== previous.y;
});

const isOrthogonalRoute = (points: DomainElkLayoutRoutePoint[]): boolean => (
  points.length >= 2
  && points.slice(1).every((point, index) => (
    point.x === points[index].x || point.y === points[index].y
  ))
);

/**
 * Extracts a reusable route candidate from flat ELK layered output. Multi-
 * section hyperedges are deliberately excluded because their section order is
 * not a single React Flow path. The production Worker remains authoritative
 * and validates every returned candidate before it can become visible.
 */
export const collectDomainElkLayoutRoutes = (
  edges: readonly ElkExtendedEdge[] | undefined,
  offset: DomainElkLayoutRoutePoint,
): Map<string, DomainElkLayoutRoutePoint[]> => {
  const routes = new Map<string, DomainElkLayoutRoutePoint[]>();
  for (const edge of edges ?? []) {
    const section = edge.sections?.length === 1 ? edge.sections[0] : undefined;
    if (
      !section
      || !finitePoint(section.startPoint)
      || !finitePoint(section.endPoint)
      || !(section.bendPoints ?? []).every(finitePoint)
    ) continue;
    const route = compactRoute([
      offsetPoint(section.startPoint, offset),
      ...(section.bendPoints ?? []).map(point => offsetPoint(point, offset)),
      offsetPoint(section.endPoint, offset),
    ]);
    if (isOrthogonalRoute(route)) routes.set(edge.id, route);
  }
  return routes;
};
