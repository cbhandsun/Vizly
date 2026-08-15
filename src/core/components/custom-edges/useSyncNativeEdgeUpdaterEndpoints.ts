import { useLayoutEffect, type RefObject } from 'react';

type Point = Readonly<{ x: number; y: number }>;

const isFinitePoint = (point: Point | null | undefined): point is Point => (
  !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
);

const setCirclePosition = (circle: SVGCircleElement | null, point: Point): void => {
  if (!circle) return;
  circle.setAttribute('cx', String(point.x));
  circle.setAttribute('cy', String(point.y));
};

/**
 * React Flow owns the transparent reconnect handles, while Vizly owns the final routed path.
 * Keep those native hit targets attached to the visible path so interaction geometry has one
 * source of truth even when the Worker route intentionally differs from React Flow's live props.
 */
export const syncNativeEdgeUpdaterEndpoints = (
  sentinel: Element | null,
  source: Point | null | undefined,
  target: Point | null | undefined,
): void => {
  if (!sentinel || !isFinitePoint(source) || !isFinitePoint(target)) return;
  const edgeRoot = sentinel.closest('.react-flow__edge');
  if (!edgeRoot) return;

  setCirclePosition(
    edgeRoot.querySelector<SVGCircleElement>('.react-flow__edgeupdater-source'),
    source,
  );
  setCirclePosition(
    edgeRoot.querySelector<SVGCircleElement>('.react-flow__edgeupdater-target'),
    target,
  );
};

export const useSyncNativeEdgeUpdaterEndpoints = (
  sentinelRef: RefObject<SVGGElement | null>,
  source: Point | null | undefined,
  target: Point | null | undefined,
): void => {
  useLayoutEffect(() => {
    syncNativeEdgeUpdaterEndpoints(sentinelRef.current, source, target);
  }, [sentinelRef, source, target]);
};
