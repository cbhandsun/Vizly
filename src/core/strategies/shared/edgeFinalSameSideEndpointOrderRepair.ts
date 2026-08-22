import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { readEdgeTerminalPolicy } from '../../routing/utils/edgeTerminalPolicy';
import { createEdgePathQualityEvaluationContext } from './edgeStrictCrossingGuard';
import {
  EPS,
  axisOf,
  buildObstacleMap,
  compactPath,
  hardQualityDoesNotRegress,
  nodeRect,
  terminalSide,
  totalObstacleHits,
  type Point,
  type Rect,
  type Role,
  type Side,
} from './edgeSharedEndpointPortOrderGeometry';
import { countEndpointNodeTraversalHits } from './edgeWaypointCandidateRepair';

const MAX_PATH_POINTS = 4_096;
const MAX_ABS_COORDINATE = 1_000_000_000;
const MIN_TRUE_TRUNK_STEM = 48;
const MIN_DISTINCT_PORT_GAP = 12;

type EndpointEntry = {
  edgeIndex: number;
  edgeId: string;
  nodeId: string;
  role: Role;
  side: Side;
  endpointCoordinate: number;
  remoteCoordinate: number;
  terminal: Point;
  stub: Point;
  movable: boolean;
  direct: boolean;
};

type EndpointBlock = {
  entries: EndpointEntry[];
  endpointCoordinate: number;
  remoteCoordinate: number;
  remoteMinimum: number;
  remoteMaximum: number;
  movable: boolean;
  direct: boolean;
};

export type SameSideEndpointTrunkIdentity = Readonly<{
  id: string;
  nodeId: string;
  role: Role;
  side: Side;
  edgeIds: readonly string[];
  commonStemLength: number;
}>;

type EndpointGroup = {
  key: string;
  nodeId: string;
  role: Role;
  side: Side;
  entries: EndpointEntry[];
};

export type SameSideEndpointOrderGroupMetrics = Readonly<{
  key: string;
  nodeId: string;
  role: Role;
  side: Side;
  endpointCount: number;
  movableEndpointCount: number;
  fixedEndpointCount: number;
  comparablePairs: number;
  inversions: number;
  desiredOrderTies: number;
  sharedLaneTies: number;
  legalSharedTrunkTies: number;
  ambiguousLaneTies: number;
  collapsedLanePairs: number;
  legalSharedTrunks: readonly SameSideEndpointTrunkIdentity[];
}>;

export type SameSideEndpointOrderMetrics = Readonly<{
  groups: readonly SameSideEndpointOrderGroupMetrics[];
  endpointCount: number;
  invalidEndpointCount: number;
  movableEndpointCount: number;
  fixedEndpointCount: number;
  comparablePairs: number;
  inversions: number;
  desiredOrderTies: number;
  sharedLaneTies: number;
  legalSharedTrunkTies: number;
  ambiguousLaneTies: number;
  collapsedLanePairs: number;
  legalSharedTrunks: readonly SameSideEndpointTrunkIdentity[];
}>;

export type SameSideEndpointOrderCandidateValidation = Readonly<{
  baselineEdges: readonly Edge[];
  candidateEdges: readonly Edge[];
  changedEdgeIndexes: readonly number[];
  baselineOrder: SameSideEndpointOrderMetrics;
  candidateOrder: SameSideEndpointOrderMetrics;
}>;

export type SameSideEndpointOrderRepairOptions = Readonly<{
  /**
   * Optional final-layer gate. A display pipeline can use this to enforce
   * additional render-specific invariants without creating a core -> UI
   * dependency. Throwing is treated as a rejected candidate.
   */
  validateCandidate?: (context: SameSideEndpointOrderCandidateValidation) => boolean;
}>;

type EndpointQualityMetrics = {
  invalidTerminalSides: number;
  invalidTerminalStubs: number;
  inwardTerminalStubs: number;
  endpointNodeTraversalHits: number;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const isBoundedCoordinate = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && Math.abs(value) <= MAX_ABS_COORDINATE
);

function readRouterOwnedPath(edge: Edge): Point[] | null {
  const raw = asRecord(edge.data).computedPath;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_PATH_POINTS) return null;
  const result: Point[] = [];
  for (const item of raw) {
    const point = asRecord(item);
    if (!isBoundedCoordinate(point.x) || !isBoundedCoordinate(point.y)) return null;
    result.push({ x: point.x, y: point.y });
  }
  return result;
}

function endpointPoint(path: readonly Point[], role: Role): Point | undefined {
  return role === 'source' ? path[0] : path[path.length - 1];
}

function stubPoint(path: readonly Point[], role: Role): Point | undefined {
  return role === 'source' ? path[1] : path[path.length - 2];
}

function tangentialCoordinate(point: Point, side: Side): number {
  return side === 'top' || side === 'bottom' ? point.x : point.y;
}

function centerCoordinate(rect: Rect, side: Side): number {
  return side === 'top' || side === 'bottom'
    ? rect.x + rect.width / 2
    : rect.y + rect.height / 2;
}

function terminalIsMovable(edge: Edge, role: Role, path: readonly Point[]): boolean {
  if (path.length < 3) return false;
  const policy = readEdgeTerminalPolicy(edge, role);
  return !policy.forbidden && !policy.positionFixed;
}

function collectEndpointGroups(
  edges: readonly Edge[],
  nodes: readonly ReactFlowNode[],
): { groups: EndpointGroup[]; invalidEndpointCount: number } {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const groups = new Map<string, EndpointGroup>();
  let invalidEndpointCount = 0;

  edges.forEach((edge, edgeIndex) => {
    const path = readRouterOwnedPath(edge);
    for (const role of ['source', 'target'] as const) {
      if (!path) {
        invalidEndpointCount += 1;
        continue;
      }
      const nodeId = role === 'source' ? edge.source : edge.target;
      const remoteNodeId = role === 'source' ? edge.target : edge.source;
      const rect = nodeRect(nodeById.get(nodeId));
      const remoteRect = nodeRect(nodeById.get(remoteNodeId));
      const terminal = endpointPoint(path, role);
      const stub = stubPoint(path, role);
      if (!rect || !remoteRect || !terminal || !stub) {
        invalidEndpointCount += 1;
        continue;
      }
      const handle = role === 'source' ? edge.sourceHandle : edge.targetHandle;
      const side = terminalSide(terminal, rect, handle);
      if (!side) {
        invalidEndpointCount += 1;
        continue;
      }
      const key = `${nodeId}\u001f${role}\u001f${side}`;
      const group = groups.get(key) ?? { key, nodeId, role, side, entries: [] };
      const remoteCoordinate = centerCoordinate(remoteRect, side);
      group.entries.push({
        edgeIndex,
        edgeId: edge.id,
        nodeId,
        role,
        side,
        endpointCoordinate: tangentialCoordinate(terminal, side),
        remoteCoordinate,
        terminal: { ...terminal },
        stub: { ...stub },
        movable: terminalIsMovable(edge, role, path),
        direct: path.length === 2,
      });
      groups.set(key, group);
    }
  });

  return {
    groups: [...groups.values()]
      .filter(group => group.entries.length >= 2)
      .sort((first, second) => first.key.localeCompare(second.key)),
    invalidEndpointCount,
  };
}

function terminalNormalDelta(entry: EndpointEntry): number {
  return entry.side === 'top' || entry.side === 'bottom'
    ? entry.stub.y - entry.terminal.y
    : entry.stub.x - entry.terminal.x;
}

function entriesShareTerminalTrunk(first: EndpointEntry, second: EndpointEntry): boolean {
  if (
    Math.abs(first.terminal.x - second.terminal.x) > EPS
    || Math.abs(first.terminal.y - second.terminal.y) > EPS
  ) return false;
  const expectedAxis = first.side === 'top' || first.side === 'bottom' ? 'v' : 'h';
  if (
    axisOf(first.terminal, first.stub) !== expectedAxis
    || axisOf(second.terminal, second.stub) !== expectedAxis
  ) return false;
  const firstDelta = terminalNormalDelta(first);
  const secondDelta = terminalNormalDelta(second);
  return Math.sign(firstDelta) === Math.sign(secondDelta)
    && Math.sign(firstDelta) !== 0
    && Math.min(Math.abs(firstDelta), Math.abs(secondDelta)) >= MIN_TRUE_TRUNK_STEM - EPS;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
}

function buildEndpointBlocks(group: EndpointGroup): EndpointBlock[] {
  const entryGroups: EndpointEntry[][] = [];
  const orderedEntries = [...group.entries].sort((first, second) => (
    first.terminal.x - second.terminal.x
    || first.terminal.y - second.terminal.y
    || first.edgeId.localeCompare(second.edgeId)
  ));
  for (const entry of orderedEntries) {
    const expectedAxis = entry.side === 'top' || entry.side === 'bottom' ? 'v' : 'h';
    const normalDelta = terminalNormalDelta(entry);
    if (
      axisOf(entry.terminal, entry.stub) !== expectedAxis
      || Math.abs(normalDelta) < MIN_TRUE_TRUNK_STEM - EPS
    ) {
      entryGroups.push([entry]);
      continue;
    }
    const compatibleGroup = entryGroups.find(entries => entries.every(
      existing => entriesShareTerminalTrunk(existing, entry),
    ));
    if (compatibleGroup) compatibleGroup.push(entry);
    else entryGroups.push([entry]);
  }
  return entryGroups.map((entries) => ({
    entries,
    endpointCoordinate: entries[0]?.endpointCoordinate ?? 0,
    remoteCoordinate: median(entries.map(entry => entry.remoteCoordinate)),
    remoteMinimum: Math.min(...entries.map(entry => entry.remoteCoordinate)),
    remoteMaximum: Math.max(...entries.map(entry => entry.remoteCoordinate)),
    movable: entries.every(entry => entry.movable),
    direct: entries.every(entry => entry.direct),
  })).sort((first, second) => (
    first.endpointCoordinate - second.endpointCoordinate
    || (first.entries[0]?.edgeId ?? '').localeCompare(second.entries[0]?.edgeId ?? '')
  ));
}

function compareBlockRemoteOrder(first: EndpointBlock, second: EndpointBlock): -1 | 0 | 1 {
  if (first.remoteMaximum < second.remoteMinimum - EPS) return -1;
  if (second.remoteMaximum < first.remoteMinimum - EPS) return 1;
  return 0;
}

function orderBlocksByRemoteEnvelope(blocks: readonly EndpointBlock[]): EndpointBlock[] {
  const result = [...blocks].sort((first, second) => (
    first.endpointCoordinate - second.endpointCoordinate
    || (first.entries[0]?.edgeId ?? '').localeCompare(second.entries[0]?.edgeId ?? '')
  ));
  for (let pass = 0; pass < result.length; pass += 1) {
    let changed = false;
    for (let index = 0; index < result.length - 1; index += 1) {
      if (compareBlockRemoteOrder(result[index], result[index + 1]) !== 1) continue;
      [result[index], result[index + 1]] = [result[index + 1], result[index]];
      changed = true;
    }
    if (!changed) break;
  }
  return result;
}

function legalSharedTrunksForBlock(
  group: EndpointGroup,
  block: EndpointBlock,
): SameSideEndpointTrunkIdentity[] {
  const entries = [...block.entries].sort((first, second) => (
    Math.abs(terminalNormalDelta(second)) - Math.abs(terminalNormalDelta(first))
    || first.edgeId.localeCompare(second.edgeId)
  ));
  const trunks: SameSideEndpointTrunkIdentity[] = [];
  for (let index = 1; index < entries.length; index += 1) {
    const commonStemLength = Math.abs(terminalNormalDelta(entries[index]));
    const next = entries[index + 1];
    if (next && commonStemLength - Math.abs(terminalNormalDelta(next)) <= EPS) continue;
    const edgeIds = entries.slice(0, index + 1).map(entry => entry.edgeId).sort((first, second) => (
      first.localeCompare(second)
    ));
    trunks.push({
      id: `${group.nodeId}|${group.role}|${group.side}|${edgeIds.join(',')}`,
      nodeId: group.nodeId,
      role: group.role,
      side: group.side,
      edgeIds,
      commonStemLength,
    });
  }
  return trunks;
}

function metricsForGroup(group: EndpointGroup): SameSideEndpointOrderGroupMetrics {
  const blocks = buildEndpointBlocks(group);
  let comparablePairs = 0;
  let inversions = 0;
  let desiredOrderTies = 0;
  let ambiguousLaneTies = 0;
  let collapsedLanePairs = 0;
  const legalSharedTrunks = blocks.flatMap(block => legalSharedTrunksForBlock(group, block))
    .sort((first, second) => first.id.localeCompare(second.id));
  const legalSharedTrunkTies = blocks.reduce((total, block) => (
    total + block.entries.length * (block.entries.length - 1) / 2
  ), 0);
  for (let firstIndex = 0; firstIndex < blocks.length; firstIndex += 1) {
    const first = blocks[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < blocks.length; secondIndex += 1) {
      const second = blocks[secondIndex];
      const endpointDelta = first.endpointCoordinate - second.endpointCoordinate;
      const desiredOrder = compareBlockRemoteOrder(first, second);
      const desiredTie = desiredOrder === 0;
      const endpointTie = Math.abs(endpointDelta) <= EPS;
      if (desiredTie) desiredOrderTies += 1;
      if (endpointTie && !desiredTie) ambiguousLaneTies += 1;
      if (Math.abs(endpointDelta) < MIN_DISTINCT_PORT_GAP - EPS) collapsedLanePairs += 1;
      // A direct two-point leg terminates before either sibling can pass it, so
      // its remote position cannot create port weaving. Keep gap auditing, but
      // exclude this non-passage pair from the ordering contract.
      if (desiredTie || endpointTie || first.direct || second.direct) continue;
      comparablePairs += 1;
      if (desiredOrder * endpointDelta < 0) inversions += 1;
    }
  }
  const movableEndpointCount = group.entries.filter(entry => entry.movable).length;
  return {
    key: group.key,
    nodeId: group.nodeId,
    role: group.role,
    side: group.side,
    endpointCount: group.entries.length,
    movableEndpointCount,
    fixedEndpointCount: group.entries.length - movableEndpointCount,
    comparablePairs,
    inversions,
    desiredOrderTies,
    sharedLaneTies: legalSharedTrunkTies + ambiguousLaneTies,
    legalSharedTrunkTies,
    ambiguousLaneTies,
    collapsedLanePairs,
    legalSharedTrunks,
  };
}

/** Audits actual geometric port sides; handle names are only a side hint. */
export function auditFinalSameSideEndpointOrder(
  edges: readonly Edge[],
  nodes: readonly ReactFlowNode[],
): SameSideEndpointOrderMetrics {
  const collected = collectEndpointGroups(edges, nodes);
  const groups = collected.groups.map(metricsForGroup);
  return groups.reduce<SameSideEndpointOrderMetrics>((total, group) => ({
    ...total,
    endpointCount: total.endpointCount + group.endpointCount,
    movableEndpointCount: total.movableEndpointCount + group.movableEndpointCount,
    fixedEndpointCount: total.fixedEndpointCount + group.fixedEndpointCount,
    comparablePairs: total.comparablePairs + group.comparablePairs,
    inversions: total.inversions + group.inversions,
    desiredOrderTies: total.desiredOrderTies + group.desiredOrderTies,
    sharedLaneTies: total.sharedLaneTies + group.sharedLaneTies,
    legalSharedTrunkTies: total.legalSharedTrunkTies + group.legalSharedTrunkTies,
    ambiguousLaneTies: total.ambiguousLaneTies + group.ambiguousLaneTies,
    collapsedLanePairs: total.collapsedLanePairs + group.collapsedLanePairs,
    legalSharedTrunks: [...total.legalSharedTrunks, ...group.legalSharedTrunks],
    groups: [...total.groups, group],
  }), {
    groups: [],
    endpointCount: 0,
    invalidEndpointCount: collected.invalidEndpointCount,
    movableEndpointCount: 0,
    fixedEndpointCount: 0,
    comparablePairs: 0,
    inversions: 0,
    desiredOrderTies: 0,
    sharedLaneTies: 0,
    legalSharedTrunkTies: 0,
    ambiguousLaneTies: 0,
    collapsedLanePairs: 0,
    legalSharedTrunks: [],
  });
}

function moveTerminalAndStub(
  path: readonly Point[],
  role: Role,
  side: Side,
  coordinate: number,
): Point[] | null {
  if (!isBoundedCoordinate(coordinate) || path.length < 3) return null;
  const result = path.map(point => ({ ...point }));
  const terminalIndex = role === 'source' ? 0 : result.length - 1;
  const stubIndex = role === 'source' ? 1 : result.length - 2;
  if (side === 'top' || side === 'bottom') {
    result[terminalIndex].x = coordinate;
    result[stubIndex].x = coordinate;
  } else {
    result[terminalIndex].y = coordinate;
    result[stubIndex].y = coordinate;
  }
  return result;
}

function withRouterOwnedPath(edge: Edge, path: Point[]): Edge {
  const currentData = asRecord(edge.data);
  const treeRouting = asRecord(currentData.treeRouting);
  return {
    ...edge,
    data: {
      ...currentData,
      computedPath: path,
      ...(Array.isArray(treeRouting.points)
        ? { treeRouting: { ...treeRouting, points: path } }
        : {}),
      finalSameSideEndpointOrderRepaired: true,
    },
  };
}

type BlockAssignment = { block: EndpointBlock; coordinate: number };
type GroupCandidate = { edges: Edge[]; changedEdgeIndexes: number[] };

function materializeBlockAssignments(
  edges: readonly Edge[],
  assignments: readonly BlockAssignment[],
): GroupCandidate | null {
  if (assignments.length === 0) return null;
  const next = [...edges];
  const changedEdgeIndexes: number[] = [];
  for (const { block, coordinate } of assignments) {
    if (Math.abs(block.endpointCoordinate - coordinate) <= EPS) continue;
    for (const entry of block.entries) {
      const edge = next[entry.edgeIndex];
      const path = edge ? readRouterOwnedPath(edge) : null;
      if (!edge || !path) return null;
      const moved = moveTerminalAndStub(path, entry.role, entry.side, coordinate);
      if (!moved) return null;
      next[entry.edgeIndex] = withRouterOwnedPath(edge, compactPath(moved));
      changedEdgeIndexes.push(entry.edgeIndex);
    }
  }
  return changedEdgeIndexes.length > 0
    ? { edges: next, changedEdgeIndexes: [...new Set(changedEdgeIndexes)] }
    : null;
}

function buildMultisetGroupCandidate(edges: readonly Edge[], group: EndpointGroup): GroupCandidate | null {
  const blocksBySize = new Map<number, EndpointBlock[]>();
  for (const block of buildEndpointBlocks(group)) {
    if (!block.movable) continue;
    const blocks = blocksBySize.get(block.entries.length) ?? [];
    blocks.push(block);
    blocksBySize.set(block.entries.length, blocks);
  }
  const assignments: BlockAssignment[] = [];
  for (const blocks of blocksBySize.values()) {
    if (blocks.length < 2) continue;
    const orderedBlocks = orderBlocksByRemoteEnvelope(blocks);
    const coordinates = blocks
      .map(block => block.endpointCoordinate)
      .sort((first, second) => first - second);
    orderedBlocks.forEach((block, index) => {
      assignments.push({ block, coordinate: coordinates[index] ?? block.endpointCoordinate });
    });
  }
  return materializeBlockAssignments(edges, assignments);
}

function slotBounds(group: EndpointGroup, rect: Rect): { minimum: number; maximum: number } {
  return group.side === 'top' || group.side === 'bottom'
    ? { minimum: rect.x, maximum: rect.x + rect.width }
    : { minimum: rect.y, maximum: rect.y + rect.height };
}

function buildCollapsedLaneCandidate(
  edges: readonly Edge[],
  group: EndpointGroup,
  rect: Rect,
): GroupCandidate | null {
  const blocks = buildEndpointBlocks(group);
  const { minimum, maximum } = slotBounds(group, rect);
  const assignments: BlockAssignment[] = [];
  const sortedByCoordinate = [...blocks].sort((first, second) => (
    first.endpointCoordinate - second.endpointCoordinate
    || first.remoteCoordinate - second.remoteCoordinate
  ));
  for (let start = 0; start < sortedByCoordinate.length;) {
    let end = start + 1;
    while (
      end < sortedByCoordinate.length
      && (
        sortedByCoordinate[end].endpointCoordinate
        - sortedByCoordinate[end - 1].endpointCoordinate
      ) < MIN_DISTINCT_PORT_GAP - EPS
    ) end += 1;
    const cluster = sortedByCoordinate.slice(start, end);
    const lowerNeighbor = sortedByCoordinate[start - 1]?.endpointCoordinate;
    const upperNeighbor = sortedByCoordinate[end]?.endpointCoordinate;
    start = end;
    if (cluster.length < 2) continue;
    const lowerLimit = Math.max(
      minimum,
      typeof lowerNeighbor === 'number' ? lowerNeighbor + MIN_DISTINCT_PORT_GAP : minimum,
    );
    const upperLimit = Math.min(
      maximum,
      typeof upperNeighbor === 'number' ? upperNeighbor - MIN_DISTINCT_PORT_GAP : maximum,
    );
    const requiredSpan = MIN_DISTINCT_PORT_GAP * (cluster.length - 1);
    if (upperLimit - lowerLimit < requiredSpan - EPS) continue;

    const ordered = orderBlocksByRemoteEnvelope(cluster);
    const fixedIndexes = ordered.flatMap((block, index) => block.movable ? [] : [index]);
    const largestBlockSize = Math.max(...ordered.map(block => block.entries.length));
    const dominantBlockIndexes = largestBlockSize > 1
      ? ordered.flatMap((block, index) => (
        block.entries.length === largestBlockSize ? [index] : []
      ))
      : [];
    const anchorIndexes = fixedIndexes.length > 0
      ? fixedIndexes
      : dominantBlockIndexes.length === 1
        ? dominantBlockIndexes
        : [];
    if (anchorIndexes.length === 0) {
      const center = median(cluster.map(block => block.endpointCoordinate));
      let firstCoordinate = center - requiredSpan / 2;
      firstCoordinate = Math.max(lowerLimit, Math.min(
        upperLimit - requiredSpan,
        firstCoordinate,
      ));
      ordered.forEach((block, index) => {
        assignments.push({
          block,
          coordinate: firstCoordinate + MIN_DISTINCT_PORT_GAP * index,
        });
      });
      continue;
    }
    if (anchorIndexes.length > 1) continue;
    const anchorIndex = anchorIndexes[0];
    const anchorCoordinate = ordered[anchorIndex].endpointCoordinate;
    if (
      anchorCoordinate - MIN_DISTINCT_PORT_GAP * anchorIndex < lowerLimit - EPS
      || anchorCoordinate + MIN_DISTINCT_PORT_GAP * (ordered.length - 1 - anchorIndex)
        > upperLimit + EPS
    ) continue;
    ordered.forEach((block, index) => {
      if (!block.movable || index === anchorIndex) return;
      assignments.push({
        block,
        coordinate: anchorCoordinate + MIN_DISTINCT_PORT_GAP * (index - anchorIndex),
      });
    });
  }
  return materializeBlockAssignments(edges, assignments);
}

function terminalStubIsInward(terminal: Point, stub: Point, side: Side): boolean {
  if (side === 'top') return stub.y >= terminal.y - EPS;
  if (side === 'bottom') return stub.y <= terminal.y + EPS;
  if (side === 'left') return stub.x >= terminal.x - EPS;
  return stub.x <= terminal.x + EPS;
}

function evaluateEndpointQuality(
  edges: readonly Edge[],
  nodes: readonly ReactFlowNode[],
): EndpointQualityMetrics {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const obstacles = buildObstacleMap([...nodes]);
  const result: EndpointQualityMetrics = {
    invalidTerminalSides: 0,
    invalidTerminalStubs: 0,
    inwardTerminalStubs: 0,
    endpointNodeTraversalHits: 0,
  };
  for (const edge of edges) {
    const path = readRouterOwnedPath(edge);
    if (!path) {
      result.invalidTerminalSides += 2;
      result.invalidTerminalStubs += 2;
      continue;
    }
    result.endpointNodeTraversalHits += countEndpointNodeTraversalHits(path, edge, obstacles);
    for (const role of ['source', 'target'] as const) {
      const nodeId = role === 'source' ? edge.source : edge.target;
      const rect = nodeRect(nodeById.get(nodeId));
      const terminal = endpointPoint(path, role);
      const stub = stubPoint(path, role);
      if (!rect || !terminal || !stub) {
        result.invalidTerminalSides += 1;
        result.invalidTerminalStubs += 1;
        continue;
      }
      const handle = role === 'source' ? edge.sourceHandle : edge.targetHandle;
      const side = terminalSide(terminal, rect, handle);
      if (!side) {
        result.invalidTerminalSides += 1;
        continue;
      }
      const expectedAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
      if (axisOf(terminal, stub) !== expectedAxis) {
        result.invalidTerminalStubs += 1;
        continue;
      }
      if (terminalStubIsInward(terminal, stub, side)) result.inwardTerminalStubs += 1;
    }
  }
  return result;
}

function endpointQualityDoesNotRegress(
  baseline: EndpointQualityMetrics,
  candidate: EndpointQualityMetrics,
): boolean {
  return candidate.invalidTerminalSides <= baseline.invalidTerminalSides
    && candidate.invalidTerminalStubs <= baseline.invalidTerminalStubs
    && candidate.inwardTerminalStubs <= baseline.inwardTerminalStubs
    && candidate.endpointNodeTraversalHits <= baseline.endpointNodeTraversalHits;
}

function endpointOrderImproves(
  baseline: SameSideEndpointOrderMetrics,
  candidate: SameSideEndpointOrderMetrics,
): boolean {
  return candidate.inversions < baseline.inversions
    || (
      candidate.inversions === baseline.inversions
      && (
        candidate.ambiguousLaneTies < baseline.ambiguousLaneTies
        || (
          candidate.ambiguousLaneTies === baseline.ambiguousLaneTies
          && candidate.collapsedLanePairs < baseline.collapsedLanePairs
        )
      )
    );
}

function preservesLegalSharedTrunks(
  baseline: SameSideEndpointOrderMetrics,
  candidate: SameSideEndpointOrderMetrics,
): boolean {
  const candidateById = new Map(candidate.legalSharedTrunks.map(trunk => [trunk.id, trunk] as const));
  return baseline.legalSharedTrunks.every((trunk) => {
    const retained = candidateById.get(trunk.id);
    return Boolean(retained && retained.commonStemLength >= trunk.commonStemLength - EPS);
  });
}

function acceptCandidateIfSafe(
  current: Edge[],
  candidate: GroupCandidate | null,
  nodes: ReactFlowNode[],
  obstacles: Map<string, Rect>,
  options: SameSideEndpointOrderRepairOptions,
): Edge[] | null {
  if (!candidate) return null;
  const baselineOrder = auditFinalSameSideEndpointOrder(current, nodes);
  const candidateOrder = auditFinalSameSideEndpointOrder(candidate.edges, nodes);
  if (!endpointOrderImproves(baselineOrder, candidateOrder)) return null;
  if (!preservesLegalSharedTrunks(baselineOrder, candidateOrder)) return null;

  const qualityContext = createEdgePathQualityEvaluationContext(current);
  const baselineQuality = qualityContext.evaluate(current);
  const candidateQuality = qualityContext.evaluateChanged(
    candidate.edges,
    candidate.changedEdgeIndexes,
  );
  if (candidateQuality.strictCrossings > baselineQuality.strictCrossings) return null;
  if (!hardQualityDoesNotRegress(baselineQuality, candidateQuality)) return null;
  if (totalObstacleHits(candidate.edges, obstacles) > totalObstacleHits(current, obstacles)) return null;
  if (!endpointQualityDoesNotRegress(
    evaluateEndpointQuality(current, nodes),
    evaluateEndpointQuality(candidate.edges, nodes),
  )) return null;

  if (options.validateCandidate) {
    try {
      if (!options.validateCandidate({
        baselineEdges: current,
        candidateEdges: candidate.edges,
        changedEdgeIndexes: candidate.changedEdgeIndexes,
        baselineOrder,
        candidateOrder,
      })) return null;
    } catch {
      return null;
    }
  }
  return candidate.edges;
}

/**
 * Reassigns the existing tangential coordinate multiset first. If independent
 * blocks are still collapsed onto one coordinate, it uses the smallest bounded
 * monotone slot split that clears the ambiguity. True trunks move atomically.
 */
export function repairFinalSameSideEndpointOrder(
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: SameSideEndpointOrderRepairOptions = {},
): Edge[] {
  if (edges.length < 2 || nodes.length === 0) return edges;
  let current = edges;
  const groupKeys = collectEndpointGroups(current, nodes).groups.map(group => group.key);
  const obstacles = buildObstacleMap(nodes);
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));

  for (const groupKey of groupKeys) {
    const multisetGroup = collectEndpointGroups(current, nodes).groups
      .find(candidate => candidate.key === groupKey);
    if (multisetGroup) {
      current = acceptCandidateIfSafe(
        current,
        buildMultisetGroupCandidate(current, multisetGroup),
        nodes,
        obstacles,
        options,
      ) ?? current;
    }
    const splitGroup = collectEndpointGroups(current, nodes).groups
      .find(candidate => candidate.key === groupKey);
    const rect = splitGroup ? nodeRect(nodeById.get(splitGroup.nodeId)) : null;
    if (!splitGroup || !rect) continue;
    current = acceptCandidateIfSafe(
      current,
      buildCollapsedLaneCandidate(current, splitGroup, rect),
      nodes,
      obstacles,
      options,
    ) ?? current;
  }
  return current;
}
