import type { Edge, Node } from '@xyflow/react';
import { withDisplayAbsolutePositions } from './baseReactFlowAbsolutePositions';
import { getDisplayNodeRect } from './baseReactFlowDisplayGeometry';
import { DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE } from './baseReactFlowDisplayWorkerProtocol';

type Point = { x: number; y: number };
const record = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
);
const finite = (value: unknown): value is number => typeof value === 'number'
  && Number.isFinite(value) && Math.abs(value) <= DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE;
const point = (value: unknown): value is Point => {
  const candidate = record(value);
  return finite(candidate.x) && finite(candidate.y);
};
const supportedHandle = (value: unknown): value is Edge['sourceHandle'] => value == null
  || (typeof value === 'string' && ['top', 'bottom', 'left', 'right', 't', 'b', 'l', 'r'].includes(value));

/** A temporary isometric coordinate frame, never a committed layout or identity. */
export const createDisplayReverseLayoutFrame = (nodes: Node[], edges: Edge[]) => {
  const direction = edges[0]?.data?.layoutDirection;
  if ((direction !== 'BT' && direction !== 'RL') || nodes.length === 0
    || edges.some(edge => edge.data?.layoutDirection !== direction
      || !supportedHandle(edge.sourceHandle) || !supportedHandle(edge.targetHandle))) return null;
  if (nodes.some(node => !point(node.position)
    || ('positionAbsolute' in node && node.positionAbsolute !== undefined && !point(node.positionAbsolute)))) return null;
  if (new Set(nodes.map(node => node.id)).size !== nodes.length) return null;
  const absolute = withDisplayAbsolutePositions(nodes, new Map(nodes.map(node => [node.id, node])));
  const rectangles = absolute.map(getDisplayNodeRect);
  if (rectangles.some(rect => !rect || !point(rect) || !finite(rect.width) || !finite(rect.height))) return null;
  const axis = direction === 'BT' ? 'y' : 'x';
  const size = direction === 'BT' ? 'height' : 'width';
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const rect of rectangles) {
    if (!rect) return null;
    minimum = Math.min(minimum, rect[axis]);
    maximum = Math.max(maximum, rect[axis] + rect[size]);
  }
  const reflectPoint = (p: Point): Point => ({ ...p, [axis]: minimum + (maximum - p[axis]) });
  // Both reverse directions use the same downward-flow routing frame. For RL,
  // transpose after reflection; its inverse must transpose before reflection.
  const transposePoint = (p: Point): Point => ({ ...p, x: p.y, y: p.x });
  const transformPoint = (p: Point, restore: boolean): Point => direction === 'BT'
    ? reflectPoint(p)
    : restore ? reflectPoint(transposePoint(p)) : transposePoint(reflectPoint(p));
  const positions = new Map<string, Point>();
  for (const [index, node] of absolute.entries()) {
    const rect = rectangles[index];
    if (!rect) return null;
    const mirrored = reflectPoint({ x: rect.x, y: rect.y });
    mirrored[axis] -= rect[size];
    if (!point(mirrored)) return null;
    positions.set(node.id, direction === 'RL' ? transposePoint(mirrored) : mirrored);
  }
  const canonicalNodes: Node[] = [];
  for (const [index, node] of nodes.entries()) {
    const positionAbsolute = positions.get(node.id);
    if (!positionAbsolute) return null;
    // Routing operates on absolute rectangles. Do not let nested layout hints
    // reinterpret the temporary frame as another domain layout; the original
    // hierarchy remains on request.nodes and is used again for the final audit.
    const { parentId: _parent, extent: _extent, ...routingNode } = node;
    const rect = rectangles[index];
    if (!rect) return null;
    const width = direction === 'RL' ? rect.height : rect.width;
    const height = direction === 'RL' ? rect.width : rect.height;
    canonicalNodes.push({ ...routingNode, position: { ...positionAbsolute }, ...{ positionAbsolute },
      width, height, measured: { width, height }, style: { ...node.style, width, height },
    });
  }
  const reflectHandle = (handle: Edge['sourceHandle']): Edge['sourceHandle'] => {
    if (direction === 'BT') {
      if (handle === 'top' || handle === 't') return handle === 't' ? 'b' : 'bottom';
      if (handle === 'bottom' || handle === 'b') return handle === 'b' ? 't' : 'top';
    } else {
      if (handle === 'left' || handle === 'l') return handle === 'l' ? 'r' : 'right';
      if (handle === 'right' || handle === 'r') return handle === 'r' ? 'l' : 'left';
    }
    return handle;
  };
  const transposeHandle = (handle: Edge['sourceHandle']): Edge['sourceHandle'] => {
    switch (handle) {
      case 'top': return 'left'; case 'bottom': return 'right';
      case 'left': return 'top'; case 'right': return 'bottom';
      case 't': return 'l'; case 'b': return 'r';
      case 'l': return 't'; case 'r': return 'b';
      default: return handle;
    }
  };
  const transformHandle = (handle: Edge['sourceHandle'], restore: boolean): Edge['sourceHandle'] => direction === 'BT'
    ? reflectHandle(handle)
    : restore ? reflectHandle(transposeHandle(handle)) : transposeHandle(reflectHandle(handle));
  const reflectPath = (value: unknown, restore: boolean): Point[] | undefined | null => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || !value.every(point)) return null;
    const result = value.map(p => transformPoint(p, restore));
    return result.every(point) ? result : null;
  };
  const reflectEdges = (source: Edge[], restore: boolean): Edge[] | null => {
    const result: Edge[] = [];
    for (const edge of source) {
      if (!supportedHandle(edge.sourceHandle) || !supportedHandle(edge.targetHandle)) return null;
      const data = record(edge.data);
      const tree = record(data.treeRouting);
      if (!supportedHandle(tree.effectiveSourceHandle) || !supportedHandle(tree.effectiveTargetHandle)) return null;
      const computedPath = reflectPath(data.computedPath, restore);
      const elkPath = reflectPath(data.elkPath, restore);
      const waypoints = reflectPath(data.waypoints, restore);
      const treePoints = reflectPath(tree.points, restore);
      if (computedPath === null || elkPath === null || waypoints === null || treePoints === null) return null;
      result.push({ ...edge, sourceHandle: transformHandle(edge.sourceHandle, restore), targetHandle: transformHandle(edge.targetHandle, restore),
        data: { ...data, layoutDirection: restore ? direction : 'TB', computedPath, elkPath, waypoints,
          ...(data.treeRouting !== undefined ? { treeRouting: { ...tree, points: treePoints,
            ...(tree.effectiveSourceHandle !== undefined ? { effectiveSourceHandle: transformHandle(tree.effectiveSourceHandle, restore) } : {}),
            ...(tree.effectiveTargetHandle !== undefined ? { effectiveTargetHandle: transformHandle(tree.effectiveTargetHandle, restore) } : {}),
          } } : {}),
          // These are coordinate-derived renderer caches, not user intent.
          h: undefined, stablePathQuality: undefined, __baseDisplayFinalizedSignature: undefined,
        },
      });
    }
    return result;
  };
  const canonicalEdges = reflectEdges(edges, false);
  return canonicalEdges ? {
    direction, nodes: canonicalNodes, edges: canonicalEdges,
    restoreEdges: (routed: Edge[]) => reflectEdges(routed, true),
  } : null;
};
