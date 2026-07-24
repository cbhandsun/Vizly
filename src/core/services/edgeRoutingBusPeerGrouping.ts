import type { Rectangle } from '../algorithms/pathfinding';
import type { PathFindingJob } from '../types/routing';

export type RoutingSide = 'top' | 'bottom' | 'left' | 'right';

export interface BusPeerEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface BusPeerClassification {
  edge: BusPeerEdge;
  peerId: string;
  side: RoutingSide;
  delta: number;
}

export interface BusPeerGroupingResult {
  groups: Map<RoutingSide, BusPeerEdge[]>;
  classifications: BusPeerClassification[];
  flow: 'horizontal' | 'vertical' | undefined;
}

interface GroupBusPeersOptions {
  hubRect: Rectangle;
  busGroupJobs: readonly PathFindingJob[];
  globalPeers: readonly unknown[];
  getNodeRect: (id: string) => Rectangle | undefined;
  isManyToOne: boolean;
  escapeRatio?: number;
  escapeMinimumDistance?: number;
  escapeMinimumPeerCount?: number;
}

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const validRectangle = (rectangle: Rectangle | undefined): rectangle is Rectangle =>
  !!rectangle
  && finiteNumber(rectangle.x)
  && finiteNumber(rectangle.y)
  && finiteNumber(rectangle.width)
  && finiteNumber(rectangle.height)
  && rectangle.width >= 0
  && rectangle.height >= 0;

const positiveFinite = (value: unknown, fallback: number): number =>
  finiteNumber(value) && value > 0 ? value : fallback;

const positiveInteger = (value: unknown, fallback: number): number =>
  finiteNumber(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback;

const endpointKey = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const parsePeerEdge = (value: unknown): BusPeerEdge | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<BusPeerEdge>;
  const id = endpointKey(candidate.id);
  const source = endpointKey(candidate.source);
  const target = endpointKey(candidate.target);
  if (!id || !source || !target) return undefined;
  return {
    id,
    source,
    target,
    ...(typeof candidate.type === 'string' ? { type: candidate.type } : {}),
  };
};

const oppositeSides = (left: RoutingSide, right: RoutingSide): boolean =>
  (left === 'top' && right === 'bottom')
  || (left === 'bottom' && right === 'top')
  || (left === 'left' && right === 'right')
  || (left === 'right' && right === 'left');

/**
 * Classifies bus peers into flow-aligned hemispheres. Strong cross-axis
 * outliers may escape to a side port, except explicit reverse edges.
 */
export const groupBusPeersByHemisphere = ({
  hubRect,
  busGroupJobs,
  globalPeers,
  getNodeRect,
  isManyToOne,
  escapeRatio: rawEscapeRatio,
  escapeMinimumDistance: rawEscapeMinimumDistance,
  escapeMinimumPeerCount: rawEscapeMinimumPeerCount,
}: GroupBusPeersOptions): BusPeerGroupingResult => {
  const groups = new Map<RoutingSide, BusPeerEdge[]>();
  const classifications: BusPeerClassification[] = [];
  if (!validRectangle(hubRect)) {
    return { groups, classifications, flow: undefined };
  }

  const escapeRatio = positiveFinite(rawEscapeRatio, 1.25);
  const escapeMinimumDistance = positiveFinite(rawEscapeMinimumDistance, 50);
  const escapeMinimumPeerCount = positiveInteger(rawEscapeMinimumPeerCount, 4);
  const seenEdgeIds = new Set<string>();
  const peers: Array<{
    edge: BusPeerEdge;
    peerId: string;
    center: { x: number; y: number };
  }> = [];

  for (const rawPeer of globalPeers) {
    const edge = parsePeerEdge(rawPeer);
    if (!edge || seenEdgeIds.has(edge.id)) continue;
    const peerId = isManyToOne ? edge.source : edge.target;
    const peerRect = getNodeRect(peerId);
    if (!validRectangle(peerRect)) continue;
    seenEdgeIds.add(edge.id);
    peers.push({
      edge,
      peerId,
      center: {
        x: peerRect.x + peerRect.width / 2,
        y: peerRect.y + peerRect.height / 2,
      },
    });
  }

  if (peers.length === 0) {
    return { groups, classifications, flow: undefined };
  }

  const hubCenter = {
    x: hubRect.x + hubRect.width / 2,
    y: hubRect.y + hubRect.height / 2,
  };
  const centroid = peers.reduce(
    (sum, peer) => ({
      x: sum.x + peer.center.x,
      y: sum.y + peer.center.y,
    }),
    { x: 0, y: 0 },
  );
  centroid.x /= peers.length;
  centroid.y /= peers.length;
  const flowDx = centroid.x - hubCenter.x;
  const flowDy = centroid.y - hubCenter.y;
  const isVerticalFlow = Math.abs(flowDy) >= Math.abs(flowDx);
  const flow = isVerticalFlow ? 'vertical' : 'horizontal';
  const reverseEdgeIds = new Set(
    busGroupJobs
      .filter(job => job.isReverseEdge === true)
      .map(job => endpointKey(job.edgeId))
      .filter(Boolean),
  );

  for (const peer of peers) {
    const dx = peer.center.x - hubCenter.x;
    const dy = peer.center.y - hubCenter.y;
    const keepTrueHemisphere = reverseEdgeIds.has(peer.edge.id);
    let side: RoutingSide;
    if (isVerticalFlow) {
      const escapes = !keepTrueHemisphere
        && peers.length >= escapeMinimumPeerCount
        && Math.abs(dx) > Math.abs(dy) * escapeRatio
        && Math.abs(dx) > escapeMinimumDistance;
      side = escapes ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
    } else {
      const escapes = !keepTrueHemisphere
        && peers.length >= escapeMinimumPeerCount
        && Math.abs(dy) > Math.abs(dx) * escapeRatio
        && Math.abs(dy) > escapeMinimumDistance;
      side = escapes ? (dy < 0 ? 'top' : 'bottom') : (dx < 0 ? 'left' : 'right');
    }
    classifications.push({
      edge: peer.edge,
      peerId: peer.peerId,
      side,
      delta: isVerticalFlow ? dy : dx,
    });
    const group = groups.get(side) ?? [];
    group.push(peer.edge);
    groups.set(side, group);
  }

  if (groups.size > 1) {
    let largestSide: RoutingSide | undefined;
    let largestCount = 0;
    for (const [side, edges] of groups) {
      if (edges.length > largestCount) {
        largestSide = side;
        largestCount = edges.length;
      }
    }
    if (largestSide) {
      const singletonSides: RoutingSide[] = [];
      for (const [side, edges] of groups) {
        if (side === largestSide || edges.length !== 1) continue;
        const edge = edges[0];
        if (!reverseEdgeIds.has(edge.id) && !oppositeSides(side, largestSide)) {
          groups.get(largestSide)?.push(edge);
          singletonSides.push(side);
        }
      }
      for (const side of singletonSides) groups.delete(side);
    }
  }

  return { groups, classifications, flow };
};
