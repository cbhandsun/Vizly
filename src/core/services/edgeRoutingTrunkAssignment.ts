import { Position } from '@xyflow/react';

import { optimizeHubPortOrder } from '../algorithms/hubPortOrderOptimizer';
import type { Rectangle } from '../algorithms/pathfinding';
import type {
  BusRoutingPlan,
  PathFindingJob,
  Point,
} from '../types/routing';
import type { BusPeerEdge, RoutingSide } from './edgeRoutingBusPeerGrouping';

export interface BusTrunkGeometry {
  axis: number;
  direction: 'horizontal' | 'vertical';
  range: { min: number; max: number };
  suggestedPort: RoutingSide;
}

interface AssignBusTrunkGeometryOptions {
  edges: readonly unknown[];
  jobs: PathFindingJob[];
  trunk: BusTrunkGeometry;
  layoutDirection: string;
  getNodeRect: (id: string) => Rectangle | undefined;
  isManyToOne: boolean;
  hubPortConflict?: boolean;
  peerGroupKeyOverride?: string;
  hubPortSlot?: number;
  trunkPortTangent?: number;
}

export interface BusTrunkAssignmentResult {
  assignedEdgeIds: string[];
  orderedEdgeIds: string[];
}

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const endpointKey = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const validRectangle = (rectangle: Rectangle | undefined): rectangle is Rectangle =>
  !!rectangle
  && finiteNumber(rectangle.x)
  && finiteNumber(rectangle.y)
  && finiteNumber(rectangle.width)
  && finiteNumber(rectangle.height)
  && rectangle.width >= 0
  && rectangle.height >= 0;

const validPort = (value: unknown): value is RoutingSide =>
  value === 'top' || value === 'bottom' || value === 'left' || value === 'right';

const parseEdge = (value: unknown): BusPeerEdge | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<BusPeerEdge>;
  const id = endpointKey(candidate.id);
  const source = endpointKey(candidate.source);
  const target = endpointKey(candidate.target);
  if (!id || !source || !target) return undefined;
  return { id, source, target };
};

const cloneTrunkData = (
  source: Point,
  target: Point,
): { source: Point; target: Point } => ({
  source: { ...source },
  target: { ...target },
});

export const assignBusTrunkGeometry = ({
  edges: rawEdges,
  jobs,
  trunk: rawTrunk,
  layoutDirection,
  getNodeRect,
  isManyToOne,
  hubPortConflict = false,
  peerGroupKeyOverride,
  hubPortSlot: rawHubPortSlot = 0,
  trunkPortTangent: rawTrunkPortTangent = 0,
}: AssignBusTrunkGeometryOptions): BusTrunkAssignmentResult => {
  const emptyResult = { assignedEdgeIds: [], orderedEdgeIds: [] };
  if (
    !finiteNumber(rawTrunk.axis)
    || !finiteNumber(rawTrunk.range?.min)
    || !finiteNumber(rawTrunk.range?.max)
    || !validPort(rawTrunk.suggestedPort)
  ) {
    return emptyResult;
  }

  const seenEdgeIds = new Set<string>();
  const edges: BusPeerEdge[] = [];
  for (const rawEdge of rawEdges) {
    const edge = parseEdge(rawEdge);
    if (!edge || seenEdgeIds.has(edge.id)) continue;
    seenEdgeIds.add(edge.id);
    edges.push(edge);
  }
  if (edges.length === 0) return emptyResult;

  const trunk: BusTrunkGeometry = {
    axis: rawTrunk.axis,
    direction: rawTrunk.direction,
    range: {
      min: Math.min(rawTrunk.range.min, rawTrunk.range.max),
      max: Math.max(rawTrunk.range.min, rawTrunk.range.max),
    },
    suggestedPort: rawTrunk.suggestedPort,
  };
  const trunkPort = trunk.suggestedPort as Position;
  const trunkPortTangent = finiteNumber(rawTrunkPortTangent)
    ? rawTrunkPortTangent
    : 0;
  const hubPortSlot = hubPortConflict && finiteNumber(rawHubPortSlot)
    ? Math.min(1, Math.max(0, Math.round(rawHubPortSlot)))
    : 0;
  const normalizedLayoutDirection = endpointKey(layoutDirection) || 'LR';

  const trunkProjection = (rectangle?: Rectangle): number => {
    if (!validRectangle(rectangle)) return 0;
    return trunk.direction === 'horizontal'
      ? rectangle.x + rectangle.width / 2
      : rectangle.y + rectangle.height / 2;
  };
  const peerSecondaryProjection = (rectangle?: Rectangle): number => {
    if (!validRectangle(rectangle)) return 0;
    return trunk.direction === 'horizontal'
      ? rectangle.y + rectangle.height / 2
      : rectangle.x + rectangle.width / 2;
  };
  const peerRectangle = (edge: BusPeerEdge): Rectangle | undefined =>
    getNodeRect(isManyToOne ? edge.source : edge.target);

  const orderedEdges = optimizeHubPortOrder(
    edges.map(edge => {
      const rectangle = peerRectangle(edge);
      const branchCoord = trunkProjection(rectangle);
      return {
        item: edge,
        id: edge.id,
        branchCoord,
        peerCoord: peerSecondaryProjection(rectangle),
        secondaryCoord: branchCoord,
      };
    }),
    { primaryWeight: 12, branchOrderWeight: 8, secondaryWeight: 2 },
  );
  const orderedEdgeIds = orderedEdges.map(edge => edge.id);
  const orderByEdgeId = new Map(
    orderedEdgeIds.map((edgeId, index) => [edgeId, index]),
  );
  const jobByEdgeId = new Map<string, PathFindingJob>();
  for (const job of jobs) {
    const edgeId = endpointKey(job.edgeId);
    if (edgeId && !jobByEdgeId.has(edgeId)) jobByEdgeId.set(edgeId, job);
  }

  const trunkSource = trunk.direction === 'vertical'
    ? { x: trunk.axis, y: trunk.range.min }
    : { x: trunk.range.min, y: trunk.axis };
  const trunkTarget = trunk.direction === 'vertical'
    ? { x: trunk.axis, y: trunk.range.max }
    : { x: trunk.range.max, y: trunk.axis };
  const explicitGroupKey = endpointKey(peerGroupKeyOverride);
  const assignedEdgeIds: string[] = [];

  for (const edge of edges) {
    const job = jobByEdgeId.get(edge.id);
    const index = orderByEdgeId.get(edge.id);
    if (!job || index === undefined) continue;
    const branchCoord = trunkProjection(peerRectangle(edge));
    const peerGroupKey = explicitGroupKey
      || (isManyToOne ? edge.target : edge.source);
    const trunkData = cloneTrunkData(trunkSource, trunkTarget);

    job.busIndex = index;
    job.trunkOrderIndex = index;
    job.trunkOrderCount = orderedEdges.length;
    job.trunkBranchCoord = branchCoord;
    if (isManyToOne) {
      job.incomingCount = hubPortConflict ? 2 : 1;
      job.incomingIndex = hubPortConflict ? hubPortSlot : 0;
      job.outgoingCount = 1;
      job.outgoingIndex = 0;
      job.m2oTrunk = cloneTrunkData(trunkSource, trunkTarget);
      job.m2oTrunkPort = trunkPort;
    } else {
      job.outgoingCount = hubPortConflict ? 2 : 1;
      job.outgoingIndex = 0;
      job.incomingCount = 1;
      job.incomingIndex = 0;
      job.o2mTrunk = cloneTrunkData(trunkSource, trunkTarget);
      job.o2mTrunkPort = trunkPort;
    }
    job.busTrunkSource = { ...trunkSource };
    job.busTrunkTarget = { ...trunkTarget };

    job.peerGroupMembers = [...orderedEdgeIds];
    job.peerGroupKey = peerGroupKey;
    job.peerGroupSize = edges.length;
    job.trunkPort = trunk.suggestedPort;
    job.trunkPortTangent = trunkPortTangent;
    if (isManyToOne) {
      job.m2oPeerGroupKey = peerGroupKey;
    } else {
      job.o2mPeerGroupKey = peerGroupKey;
    }

    const plan: BusRoutingPlan = {
      ...(job.busRoutingPlan ?? {}),
      busIndex: index,
      peerGroupKey,
      peerGroupSize: edges.length,
      peerGroupMembers: [...orderedEdgeIds],
      trunkPort,
      trunkPortTangent,
      trunkBranchCoord: branchCoord,
      portFrozen: true,
      ...(isManyToOne
        ? {
            m2oPeerGroupKey: peerGroupKey,
            m2oTrunk: trunkData,
            m2oTrunkPort: trunkPort,
          }
        : {
            o2mPeerGroupKey: peerGroupKey,
            o2mTrunk: trunkData,
            o2mTrunkPort: trunkPort,
          }),
    };
    job.busRoutingPlan = plan;
    job.layoutDirection = normalizedLayoutDirection;
    assignedEdgeIds.push(edge.id);
  }

  return { assignedEdgeIds, orderedEdgeIds };
};
