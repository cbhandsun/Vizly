import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  compactPath,
  getEdgePath,
  nodeRect,
  type Point,
  type Rect,
} from './edgeDetachedOverlapGeometry';
import {
  routeStrictCrossingMazeCandidate,
  type StrictCrossingMazeDiagnostics,
} from './edgeDetachedOverlapRepair';

const DEFAULT_GRID_PADDING = 320;
const MAX_GRID_PADDING = 2_000;
const MAX_LOCAL_EDGE_COUNT = 3;

export interface BoundedResidualOverlapMazeOptions {
  /**
   * Extra area whose node boundaries may seed local maze coordinates. Node
   * collision checks still use the complete node set.
   */
  gridPadding?: number;
  /** Preserve the existing first and last terminal segments. Defaults to true. */
  preserveTerminalCaps?: boolean;
  /** Optional caller-owned object populated with bounded-search diagnostics. */
  diagnostics?: StrictCrossingMazeDiagnostics;
}

function parseGridPadding(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_GRID_PADDING;
  return Math.min(MAX_GRID_PADDING, Math.max(0, value));
}

function pathBounds(paths: Point[][], padding: number): Rect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const path of paths) {
    for (const point of path) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

function rectsIntersect(first: Rect, second: Rect): boolean {
  return first.x <= second.x + second.width
    && first.x + first.width >= second.x
    && first.y <= second.y + second.height
    && first.y + first.height >= second.y;
}

function collectGridNodes(
  nodes: ReactFlowNode[],
  localPaths: Point[][],
  padding: number,
): ReactFlowNode[] {
  const bounds = pathBounds(localPaths, padding);
  if (!bounds) return [];
  return nodes.filter(node => {
    const rect = nodeRect(node);
    return rect ? rectsIntersect(bounds, rect) : false;
  });
}

/**
 * Builds one bounded maze candidate for a residual overlap transaction.
 *
 * Only the moving edge and up to two directly related companion edges seed
 * coordinates. Candidate segments are nevertheless scored against every edge,
 * and collision checks use every node. The caller remains responsible for the
 * exact whole-graph quality, obstacle, and terminal-port acceptance gates.
 */
export function buildBoundedResidualOverlapMazeCandidate(
  edges: Edge[],
  nodes: ReactFlowNode[],
  movingEdgeIndex: number,
  companionEdgeIndices: readonly number[],
  options: BoundedResidualOverlapMazeOptions = {},
): Point[] | null {
  const invalidResult = (): null => {
    if (options.diagnostics) {
      options.diagnostics.reason = 'invalid';
      options.diagnostics.xCoordinateCount = 0;
      options.diagnostics.yCoordinateCount = 0;
      options.diagnostics.gridCellCount = 0;
    }
    return null;
  };
  if (!Number.isInteger(movingEdgeIndex) || movingEdgeIndex < 0 || movingEdgeIndex >= edges.length) {
    return invalidResult();
  }

  const localIndices = [movingEdgeIndex];
  for (const value of companionEdgeIndices) {
    if (!Number.isInteger(value) || value < 0 || value >= edges.length || value === movingEdgeIndex) continue;
    if (!localIndices.includes(value)) localIndices.push(value);
    if (localIndices.length >= MAX_LOCAL_EDGE_COUNT) break;
  }
  if (localIndices.length < 2) return invalidResult();

  const fullPaths = edges.map(getEdgePath);
  const localPaths = localIndices.map(index => fullPaths[index]);
  if (localPaths.some(path => path.length < 2)) return invalidResult();
  const movingPath = localPaths[0];
  const preserveTerminalCaps = options.preserveTerminalCaps !== false && movingPath.length >= 4;
  const routedMovingPath = preserveTerminalCaps
    ? movingPath.slice(1, -1)
    : movingPath;
  if (routedMovingPath.length < 2) return invalidResult();
  localPaths[0] = routedMovingPath;
  const localEdges = localIndices.map(index => edges[index]);
  const gridNodes = collectGridNodes(nodes, localPaths, parseGridPadding(options.gridPadding));

  const candidate = routeStrictCrossingMazeCandidate(
    routedMovingPath,
    0,
    localPaths,
    localEdges,
    nodes,
    {
      penaltyPaths: fullPaths,
      penaltyEdges: edges,
      penaltyEdgeIndex: movingEdgeIndex,
      gridNodes,
      diagnostics: options.diagnostics,
    },
  );
  if (!candidate) return null;
  if (!preserveTerminalCaps) return candidate;
  return compactPath([
    movingPath[0],
    ...candidate,
    movingPath[movingPath.length - 1],
  ]);
}
