import type { Edge, Node } from '@xyflow/react';

import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  anchorForHandle,
  getNodeRect,
  sideForHandle,
} from './baseReactFlowDisplayEdgeGeometry';
import {
  displayPathLength,
  getDisplayComputedPath,
  segmentDisplayLength,
} from './baseReactFlowDisplayGeometry';
import { MIN_RENDER_SAFE_ENDPOINT_STUB } from './baseReactFlowDisplayEndpointStubRepair';
import { withDisplayPortBridge } from './baseReactFlowDisplayTerminalPortBridge';
import {
  displayTerminalSideCanSwitch,
  resolveDisplayTerminalHandleForSide,
  type DisplayTerminalSide,
} from './baseReactFlowDisplayTerminalPolicy';

const MAX_TERMINAL_SHORTCUT_CANDIDATES = 32;
const MAX_SOURCE_CORRIDOR_LANES_PER_ANCHOR = 8;
const CONTAINER_NODE_TYPES = new Set([
  'titleGroup',
  'subGroup',
  'group',
  'domain',
  'subDomain',
  'swimlane',
]);
const TERMINAL_SIDES: readonly DisplayTerminalSide[] = [
  'left',
  'right',
  'top',
  'bottom',
];

const terminalStub = (
  anchor: { x: number; y: number },
  side: DisplayTerminalSide,
  stub = MIN_RENDER_SAFE_ENDPOINT_STUB,
): { x: number; y: number } => {
  switch (side) {
    case 'left': return { x: anchor.x - stub, y: anchor.y };
    case 'right': return { x: anchor.x + stub, y: anchor.y };
    case 'top': return { x: anchor.x, y: anchor.y - stub };
    case 'bottom': return { x: anchor.x, y: anchor.y + stub };
  }
};

const pathSignature = (path: Array<{ x: number; y: number }>): string => (
  path.map(point => `${point.x}:${point.y}`).join('|')
);

const isStrictlyBetween = (value: number, first: number, second: number): boolean => (
  value > Math.min(first, second) && value < Math.max(first, second)
);

const sourceCorridorLaneCoordinates = (
  edge: Edge,
  nodes: Node[],
  nodeById: Map<string, Node>,
  sourceSide: DisplayTerminalSide,
  sourceStub: { x: number; y: number },
  routeAnchor: { x: number; y: number },
): number[] => {
  const horizontalLane = sourceSide === 'top' || sourceSide === 'bottom';
  const sourceCoordinate = horizontalLane ? sourceStub.y : sourceStub.x;
  const anchorCoordinate = horizontalLane ? routeAnchor.y : routeAnchor.x;
  const coordinates = new Set<number>();

  for (const node of nodes) {
    if (node.id === edge.source || node.id === edge.target) continue;
    const rect = getNodeRect(node, nodeById);
    if (!rect) continue;
    const boundaries = horizontalLane
      ? [
        rect.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        rect.y + rect.height + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ]
      : [
        rect.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        rect.x + rect.width + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ];
    for (const boundary of boundaries) {
      if (Number.isFinite(boundary)
        && isStrictlyBetween(boundary, sourceCoordinate, anchorCoordinate)) {
        coordinates.add(boundary);
      }
    }
  }

  return [...coordinates]
    .sort((first, second) => (
      Math.abs(first - sourceCoordinate) - Math.abs(second - sourceCoordinate)
      || first - second
    ))
    .slice(0, MAX_SOURCE_CORRIDOR_LANES_PER_ANCHOR);
};

/**
 * Truncates an already-safe outer corridor at an earlier waypoint and lands on
 * the nearest legal target side. Callers must still apply the graph-wide hard,
 * obstacle, terminal, and true-trunk transaction gates.
 */
export const buildCommercialTerminalShortcutCandidates = (
  edge: Edge,
  nodes: Node[],
): Edge[] => {
  const path = getDisplayComputedPath(edge);
  const sourceSide = sideForHandle(edge.sourceHandle);
  if (!sourceSide || path.length < 6) return [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!targetRect) return [];
  const baselineLength = displayPathLength(path);
  const candidates: Edge[] = [];
  const seen = new Set<string>();

  for (const targetSide of TERMINAL_SIDES) {
    if (!displayTerminalSideCanSwitch(edge, 'target', targetSide)) continue;
    const targetHandle = resolveDisplayTerminalHandleForSide(
      edge,
      'target',
      targetSide,
    );
    const targetAnchor = anchorForHandle(targetRect, targetHandle);
    const targetStub = terminalStub(targetAnchor, targetSide);
    for (let anchorIndex = 1; anchorIndex < path.length - 2; anchorIndex += 1) {
      const routeAnchor = path[anchorIndex];
      for (const bridge of [
        { x: routeAnchor.x, y: targetStub.y },
        { x: targetStub.x, y: routeAnchor.y },
      ]) {
        const candidatePath = compactOrthogonalPath([
          ...path.slice(0, anchorIndex + 1),
          bridge,
          targetStub,
          targetAnchor,
        ]);
        if (candidatePath.length < 3) continue;
        if (segmentDisplayLength(candidatePath.at(-2)!, candidatePath.at(-1)!)
          < MIN_RENDER_SAFE_ENDPOINT_STUB) continue;
        const length = displayPathLength(candidatePath);
        if (length >= baselineLength - 0.5) continue;
        const key = `${targetSide}:${pathSignature(candidatePath)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(withDisplayPortBridge(
          edge,
          candidatePath,
          sourceSide,
          targetSide,
        ));
      }
    }
  }

  return candidates
    .sort((first, second) => (
      displayPathLength(getDisplayComputedPath(first))
      - displayPathLength(getDisplayComputedPath(second))
    ))
    .slice(0, MAX_TERMINAL_SHORTCUT_CANDIDATES);
};

/**
 * Mirrors the target-side shortcut at the source while preserving the already
 * accepted target corridor. This is important for tree-bus edges: a source
 * detour may be shortened without destroying a true shared target trunk.
 */
export const buildCommercialSourceTerminalShortcutCandidates = (
  edge: Edge,
  nodes: Node[],
): Edge[] => {
  const path = getDisplayComputedPath(edge);
  const targetSide = sideForHandle(edge.targetHandle);
  if (!targetSide || path.length < 5) return [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  if (!sourceRect) return [];
  const baselineLength = displayPathLength(path);
  const candidates: Edge[] = [];
  const seen = new Set<string>();

  for (const sourceSide of TERMINAL_SIDES) {
    if (!displayTerminalSideCanSwitch(edge, 'source', sourceSide)) continue;
    const sourceHandle = resolveDisplayTerminalHandleForSide(
      edge,
      'source',
      sourceSide,
    );
    const sourceAnchor = anchorForHandle(sourceRect, sourceHandle);
    const sourceStub = terminalStub(
      sourceAnchor,
      sourceSide,
      MIN_RENDER_SAFE_ENDPOINT_STUB,
    );
    for (let anchorIndex = 2; anchorIndex < path.length - 1; anchorIndex += 1) {
      const routeAnchor = path[anchorIndex];
      const corridorPaths = sourceCorridorLaneCoordinates(
        edge,
        nodes,
        nodeById,
        sourceSide,
        sourceStub,
        routeAnchor,
      ).map(coordinate => (
        sourceSide === 'top' || sourceSide === 'bottom'
          ? [
            sourceAnchor,
            sourceStub,
            { x: sourceStub.x, y: coordinate },
            { x: routeAnchor.x, y: coordinate },
            ...path.slice(anchorIndex),
          ]
          : [
            sourceAnchor,
            sourceStub,
            { x: coordinate, y: sourceStub.y },
            { x: coordinate, y: routeAnchor.y },
            ...path.slice(anchorIndex),
          ]
      ));
      const directPaths = [
        [
          sourceAnchor,
          sourceStub,
          { x: routeAnchor.x, y: sourceStub.y },
          ...path.slice(anchorIndex),
        ],
        [
          sourceAnchor,
          sourceStub,
          { x: sourceStub.x, y: routeAnchor.y },
          ...path.slice(anchorIndex),
        ],
      ];
      for (const rawCandidatePath of [...corridorPaths, ...directPaths]) {
        const candidatePath = compactOrthogonalPath(rawCandidatePath);
        if (candidatePath.length < 3) continue;
        if (segmentDisplayLength(candidatePath[0], candidatePath[1])
          < MIN_RENDER_SAFE_ENDPOINT_STUB) continue;
        if (displayPathLength(candidatePath) >= baselineLength - 0.5) continue;
        const key = `${sourceSide}:${pathSignature(candidatePath)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(withDisplayPortBridge(
          edge,
          candidatePath,
          sourceSide,
          targetSide,
        ));
      }
    }
  }

  return candidates
    .sort((first, second) => (
      displayPathLength(getDisplayComputedPath(first))
      - displayPathLength(getDisplayComputedPath(second))
    ))
    .slice(0, MAX_TERMINAL_SHORTCUT_CANDIDATES);
};

/**
 * Pulls a four-point same-side outer rectangle toward its endpoints while
 * retaining render-safe terminal stubs. The graph-wide caller remains
 * responsible for obstacle, overlap, crossing, and true-trunk acceptance.
 */
export const buildCommercialSameSideRectangularShortcutPaths = (
  edge: Edge,
  nodes: Node[],
  allEdges: readonly Edge[] = [],
): Array<Array<{ x: number; y: number }>> => {
  const path = getDisplayComputedPath(edge);
  const sourceSide = sideForHandle(edge.sourceHandle);
  const targetSide = sideForHandle(edge.targetHandle);
  if (!sourceSide || sourceSide !== targetSide || path.length !== 4) return [];
  const source = path[0];
  const target = path[3];
  const horizontalLane = sourceSide === 'top' || sourceSide === 'bottom';
  const sourceCoordinate = horizontalLane ? source.y : source.x;
  const targetCoordinate = horizontalLane ? target.y : target.x;
  const outwardSign = sourceSide === 'bottom' || sourceSide === 'right' ? 1 : -1;
  const minimumOutwardCoordinate = outwardSign > 0
    ? Math.max(sourceCoordinate, targetCoordinate) + MIN_RENDER_SAFE_ENDPOINT_STUB
    : Math.min(sourceCoordinate, targetCoordinate) - MIN_RENDER_SAFE_ENDPOINT_STUB;
  const perpendicularMin = horizontalLane
    ? Math.min(source.x, target.x)
    : Math.min(source.y, target.y);
  const perpendicularMax = horizontalLane
    ? Math.max(source.x, target.x)
    : Math.max(source.y, target.y);
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const laneCoordinates = new Set<number>([minimumOutwardCoordinate]);
  const sharedLaneCoordinates = new Set<number>();

  for (const sibling of allEdges) {
    if (sibling.id === edge.id || sibling.source !== edge.source) continue;
    const siblingPath = getDisplayComputedPath(sibling);
    const siblingSource = siblingPath[0];
    const siblingBranch = siblingPath[1];
    if (!siblingSource || !siblingBranch) continue;
    if (Math.abs(siblingSource.x - source.x) > 4 || Math.abs(siblingSource.y - source.y) > 4) continue;
    const siblingCoordinate = horizontalLane ? siblingBranch.y : siblingBranch.x;
    if (outwardSign * siblingCoordinate >= outwardSign * minimumOutwardCoordinate) {
      laneCoordinates.add(siblingCoordinate);
      sharedLaneCoordinates.add(siblingCoordinate);
    }
  }

  for (const node of nodes) {
    if (node.id === edge.source || node.id === edge.target) continue;
    const rect = getNodeRect(node, nodeById);
    if (!rect) continue;
    const nodePerpendicularMin = horizontalLane ? rect.x : rect.y;
    const nodePerpendicularMax = horizontalLane ? rect.x + rect.width : rect.y + rect.height;
    if (nodePerpendicularMax < perpendicularMin || nodePerpendicularMin > perpendicularMax) continue;
    const boundaries = horizontalLane
      ? [
        rect.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        rect.y + rect.height + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ]
      : [
        rect.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        rect.x + rect.width + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ];
    for (const boundary of boundaries) {
      if (outwardSign * boundary >= outwardSign * minimumOutwardCoordinate) {
        laneCoordinates.add(boundary);
      }
    }
  }

  const baselineLength = displayPathLength(path);
  const seen = new Set<string>();
  return [...laneCoordinates]
    .map(lane => ({
      lane,
      path: compactOrthogonalPath(horizontalLane
        ? [source, { x: source.x, y: lane }, { x: target.x, y: lane }, target]
        : [source, { x: lane, y: source.y }, { x: lane, y: target.y }, target]),
    }))
    .filter(candidate => candidate.path.length >= 4)
    .filter(candidate => (
      segmentDisplayLength(candidate.path[0], candidate.path[1]) >= MIN_RENDER_SAFE_ENDPOINT_STUB
      && segmentDisplayLength(candidate.path.at(-2)!, candidate.path.at(-1)!) >= MIN_RENDER_SAFE_ENDPOINT_STUB
    ))
    .filter(candidate => displayPathLength(candidate.path) < baselineLength - 0.5)
    .filter((candidate) => {
      const signature = pathSignature(candidate.path);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .sort((first, second) => (
      Number(sharedLaneCoordinates.has(second.lane)) - Number(sharedLaneCoordinates.has(first.lane))
      || displayPathLength(first.path) - displayPathLength(second.path)
    ))
    .slice(0, MAX_TERMINAL_SHORTCUT_CANDIDATES)
    .map(candidate => candidate.path);
};

/**
 * Collapses a locally stepped clearance skirt onto one of its already proven
 * interior lanes while preserving both terminal stubs. Exact graph and node
 * acceptance remains the caller's responsibility.
 */
export const buildCommercialParallelTerminalCorridorShortcutPaths = (
  path: Array<{ x: number; y: number }>,
  nodes: Node[] = [],
  edge?: Edge,
): Array<Array<{ x: number; y: number }>> => {
  if (path.length < 6) return [];
  const source = path[0];
  const sourceStub = path[1];
  const targetStub = path.at(-2);
  const target = path.at(-1);
  if (!source || !sourceStub || !targetStub || !target) return [];
  const verticalTerminals = Math.abs(source.x - sourceStub.x) <= 0.5
    && Math.abs(targetStub.x - target.x) <= 0.5;
  const horizontalTerminals = Math.abs(source.y - sourceStub.y) <= 0.5
    && Math.abs(targetStub.y - target.y) <= 0.5;
  if (!verticalTerminals && !horizontalTerminals) return [];

  const laneCoordinates = new Set<number>();
  for (let index = 2; index < path.length - 3; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    if (verticalTerminals && Math.abs(start.x - end.x) <= 0.5) {
      laneCoordinates.add(start.x);
    } else if (horizontalTerminals && Math.abs(start.y - end.y) <= 0.5) {
      laneCoordinates.add(start.y);
    }
  }
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  for (const node of nodes) {
    if (
      node.id === edge?.source
      || node.id === edge?.target
      || CONTAINER_NODE_TYPES.has(String(node.type ?? ''))
    ) continue;
    const rect = getNodeRect(node, nodeById);
    if (!rect) continue;
    if (verticalTerminals) {
      if (
        rect.y + rect.height < Math.min(sourceStub.y, targetStub.y)
        || rect.y > Math.max(sourceStub.y, targetStub.y)
      ) continue;
      laneCoordinates.add(rect.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE);
      laneCoordinates.add(rect.x + rect.width + COMMERCIAL_BUSINESS_NODE_CLEARANCE);
    } else {
      if (
        rect.x + rect.width < Math.min(sourceStub.x, targetStub.x)
        || rect.x > Math.max(sourceStub.x, targetStub.x)
      ) continue;
      laneCoordinates.add(rect.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE);
      laneCoordinates.add(rect.y + rect.height + COMMERCIAL_BUSINESS_NODE_CLEARANCE);
    }
  }

  const baselineLength = displayPathLength(path);
  const seen = new Set<string>();
  return [...laneCoordinates]
    .map(lane => compactOrthogonalPath(verticalTerminals
      ? [
        source,
        sourceStub,
        { x: lane, y: sourceStub.y },
        { x: lane, y: targetStub.y },
        targetStub,
        target,
      ]
      : [
        source,
        sourceStub,
        { x: sourceStub.x, y: lane },
        { x: targetStub.x, y: lane },
        targetStub,
        target,
      ]))
    .filter(candidate => candidate.length >= 4)
    .filter((candidate) => {
      const candidateLength = displayPathLength(candidate);
      return candidateLength < baselineLength - 0.5
        || (candidateLength <= baselineLength + 0.5 && candidate.length < path.length);
    })
    .filter((candidate) => {
      const signature = pathSignature(candidate);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .sort((first, second) => (
      first.length - second.length
      || displayPathLength(first) - displayPathLength(second)
    ));
};
