import type { Edge } from '@xyflow/react';
import { getDisplayComputedPath, segmentDisplayLength } from './baseReactFlowDisplayGeometry';

export const MIN_RENDER_SAFE_ENDPOINT_STUB = 56;

export const countRenderUnsafeEndpointStubs = (edges: Edge[]): number => edges.reduce((total, edge) => {
  const path = getDisplayComputedPath(edge);
  if (path.length < 3) return total;
  return total
    + (segmentDisplayLength(path[0], path[1]) < MIN_RENDER_SAFE_ENDPOINT_STUB ? 1 : 0)
    + (segmentDisplayLength(path[path.length - 2], path[path.length - 1]) < MIN_RENDER_SAFE_ENDPOINT_STUB ? 1 : 0);
}, 0);
