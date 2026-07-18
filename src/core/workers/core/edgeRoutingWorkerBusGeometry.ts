import {
  getNodePosition,
  getPortOffsetPoint,
} from '../../algorithms/smartEdgeUtils';
import type {
  PathFindingJob,
  Point,
  Rectangle,
  UnifiedRoutingConfig,
} from '../../types/routing';
import { Position } from '../../types/routing';
import type {
  WorkerGraphEdge,
  WorkerGraphNode,
} from './edgeRoutingWorkerContext';
import type { PortSelector } from '../preprocessing/PortSelector';

interface ResolveWorkerPortAnchorsOptions {
  job: PathFindingJob;
  config: UnifiedRoutingConfig;
  selector: Pick<PortSelector, 'getDistributedPortPoint'>;
  sourceRect: Rectangle;
  targetRect: Rectangle;
  sourcePosition: Position;
  targetPosition: Position;
}

export interface WorkerPortAnchors {
  startPoint: Point;
  endPoint: Point;
  startOffset: Point;
  endOffset: Point;
}

export const resolveWorkerPortAnchors = ({
  job,
  config,
  selector,
  sourceRect,
  targetRect,
  sourcePosition,
  targetPosition,
}: ResolveWorkerPortAnchorsOptions): WorkerPortAnchors => {
  const forceSourceCoalesce = !!job.isOneToMany && (job.outgoingCount || 1) <= 1;
  const forceTargetCoalesce = !!job.isManyToOne && (job.incomingCount || 1) <= 1;
  const isBus = !!job.isOneToMany || !!job.isManyToOne;
  const outgoingCount = forceSourceCoalesce ? 1 : (job.outgoingCount || 1);
  const incomingCount = forceTargetCoalesce ? 1 : (job.incomingCount || 1);
  const sharedCenter = {
    x: (
      sourceRect.x + sourceRect.width / 2
      + targetRect.x + targetRect.width / 2
    ) / 2,
    y: (
      sourceRect.y + sourceRect.height / 2
      + targetRect.y + targetRect.height / 2
    ) / 2,
  };
  const allowSlide = !isBus && config.portSelection.enableDynamicPorts;
  const startPoint = selector.getDistributedPortPoint(
    sourceRect,
    sourcePosition,
    forceSourceCoalesce ? 0 : (job.outgoingIndex || 0),
    outgoingCount,
    allowSlide && outgoingCount > 1 ? sharedCenter : undefined,
  );
  const endPoint = selector.getDistributedPortPoint(
    targetRect,
    targetPosition,
    forceTargetCoalesce ? 0 : (job.incomingIndex || 0),
    incomingCount,
    allowSlide && incomingCount > 1 ? sharedCenter : undefined,
  );
  return {
    startPoint,
    endPoint,
    startOffset: getPortOffsetPoint(
      startPoint.x,
      startPoint.y,
      sourcePosition,
      config.offsets.source,
    ),
    endOffset: getPortOffsetPoint(
      endPoint.x,
      endPoint.y,
      targetPosition,
      config.offsets.target,
    ),
  };
};

export interface WorkerPeerGroup {
  edges: WorkerGraphEdge[];
  key: 'ALL' | 'FWD' | 'REV';
  members: string[];
}

interface TrunkGeometry {
  source: Point;
  target: Point;
}

interface ResolveTrunkPortOptions {
  rectangle: Rectangle;
  otherRectangle?: Rectangle;
  isTargetSide?: boolean;
  trunkHint?: TrunkGeometry;
  fallbackTrunk?: TrunkGeometry;
  isGlobalTrunkMember: boolean;
}

interface PickPeerGroupOptions {
  job: PathFindingJob;
  originId: string;
  isSource: boolean;
  allPeers: WorkerGraphEdge[];
  nodeMap: ReadonlyMap<string, WorkerGraphNode>;
  edgeMap: ReadonlyMap<string, WorkerGraphEdge>;
}

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const nodeDimension = (value: unknown): number =>
  finiteNumber(value) && value > 0 ? value : 0;

const validPoint = (point: Point | undefined): point is Point =>
  !!point && finiteNumber(point.x) && finiteNumber(point.y);

const validTrunk = (trunk: TrunkGeometry | undefined): trunk is TrunkGeometry =>
  !!trunk && validPoint(trunk.source) && validPoint(trunk.target);

const nodeCenter = (node: WorkerGraphNode): Point => {
  const position = getNodePosition(node);
  return {
    x: position.x + nodeDimension(node.measured?.width ?? node.width) / 2,
    y: position.y + nodeDimension(node.measured?.height ?? node.height) / 2,
  };
};

export const oppositeWorkerPort = (position: Position): Position => {
  if (position === Position.Top) return Position.Bottom;
  if (position === Position.Bottom) return Position.Top;
  if (position === Position.Left) return Position.Right;
  return Position.Left;
};

export const directWorkerPortToward = (
  rectangle: Rectangle,
  otherRectangle: Rectangle,
): { port: Position; absDx: number; absDy: number } => {
  const centerX = rectangle.x + rectangle.width / 2;
  const centerY = rectangle.y + rectangle.height / 2;
  const dx = otherRectangle.x + otherRectangle.width / 2 - centerX;
  const dy = otherRectangle.y + otherRectangle.height / 2 - centerY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  return {
    port: absDx > absDy
      ? (dx > 0 ? Position.Right : Position.Left)
      : (dy > 0 ? Position.Bottom : Position.Top),
    absDx,
    absDy,
  };
};

export const chooseWorkerEndpointOrthogonalPort = (
  rectangle: Rectangle,
  otherRectangle: Rectangle | undefined,
  trunkPort: Position,
): Position => {
  if (!otherRectangle) return trunkPort;
  const { port: directPort, absDx, absDy } = directWorkerPortToward(
    rectangle,
    otherRectangle,
  );
  const trunkIsHorizontalSide = trunkPort === Position.Left
    || trunkPort === Position.Right;
  const directIsVerticalSide = directPort === Position.Top
    || directPort === Position.Bottom;
  const trunkIsVerticalSide = trunkPort === Position.Top
    || trunkPort === Position.Bottom;
  const directIsHorizontalSide = directPort === Position.Left
    || directPort === Position.Right;
  const directionalAxisRatio = 1.1;
  if (
    trunkIsHorizontalSide
    && directIsVerticalSide
    && absDy >= absDx * directionalAxisRatio
    && absDy > rectangle.height / 2
  ) return directPort;
  if (
    trunkIsVerticalSide
    && directIsHorizontalSide
    && absDx >= absDy * directionalAxisRatio
    && absDx > rectangle.width / 2
  ) return directPort;
  return trunkPort;
};

export const resolveWorkerPortFromTrunkAxis = ({
  rectangle,
  otherRectangle,
  isTargetSide = false,
  trunkHint,
  fallbackTrunk,
  isGlobalTrunkMember,
}: ResolveTrunkPortOptions): Position => {
  const trunk = validTrunk(trunkHint)
    ? trunkHint
    : validTrunk(fallbackTrunk) ? fallbackTrunk : undefined;
  if (!trunk) {
    return otherRectangle
      ? directWorkerPortToward(rectangle, otherRectangle).port
      : Position.Right;
  }
  const verticalTrunk = Math.abs(trunk.source.x - trunk.target.x) < 1;
  const center = {
    x: rectangle.x + rectangle.width / 2,
    y: rectangle.y + rectangle.height / 2,
  };
  const trunkPort = verticalTrunk
    ? (center.x > trunk.source.x ? Position.Left : Position.Right)
    : (center.y > trunk.source.y ? Position.Top : Position.Bottom);
  if (otherRectangle) {
    const { port: directPort, absDx, absDy } = directWorkerPortToward(
      rectangle,
      otherRectangle,
    );
    const dominantRatio = Math.max(absDx, absDy) / (Math.min(absDx, absDy) + 1);
    const crossAxisConflict = absDy > absDx
      ? trunkPort === Position.Left || trunkPort === Position.Right
      : trunkPort === Position.Top || trunkPort === Position.Bottom;
    if (dominantRatio > 3 && crossAxisConflict) return directPort;
    const endpointPort = chooseWorkerEndpointOrthogonalPort(
      rectangle,
      otherRectangle,
      trunkPort,
    );
    if (endpointPort !== trunkPort) return endpointPort;
    if (!isGlobalTrunkMember) {
      if (isTargetSide && trunkPort === directPort) return directPort;
      if (!isTargetSide && trunkPort === oppositeWorkerPort(directPort)) {
        return directPort;
      }
    }
  }
  return trunkPort;
};

export const pickWorkerPeerGroup = ({
  job,
  originId,
  isSource,
  allPeers,
  nodeMap,
  edgeMap,
}: PickPeerGroupOptions): WorkerPeerGroup => {
  const allGroup = (): WorkerPeerGroup => ({
    edges: allPeers,
    key: 'ALL',
    members: allPeers.map(edge => edge.id),
  });
  const referenceEdge = edgeMap.get(job.edgeId);
  if (!referenceEdge) return allGroup();
  const originNode = nodeMap.get(originId);
  const otherId = isSource ? referenceEdge.target : referenceEdge.source;
  const otherNode = nodeMap.get(otherId);
  if (!originNode || !otherNode) return allGroup();
  const originCenter = nodeCenter(originNode);
  const otherCenter = nodeCenter(otherNode);
  const layoutDirection = job.layoutDirection || 'LR';
  const horizontalLayout = layoutDirection === 'LR' || layoutDirection === 'RL';
  const directionSign = layoutDirection === 'RL' || layoutDirection === 'BT'
    ? -1
    : 1;
  const deadzone = 20;
  const referenceDelta = horizontalLayout
    ? otherCenter.x - originCenter.x
    : otherCenter.y - originCenter.y;
  if (Math.abs(referenceDelta) < deadzone) return allGroup();
  const forward = isSource
    ? referenceDelta * directionSign > 0
    : referenceDelta * directionSign < 0;
  const filtered = allPeers.filter(peer => {
    if (peer.id === job.edgeId) return true;
    const peerId = isSource ? peer.target : peer.source;
    const peerNode = nodeMap.get(peerId);
    if (!peerNode) return false;
    const peerCenter = nodeCenter(peerNode);
    const delta = horizontalLayout
      ? peerCenter.x - originCenter.x
      : peerCenter.y - originCenter.y;
    if (Math.abs(delta) < deadzone) return true;
    const peerForward = isSource
      ? delta * directionSign > 0
      : delta * directionSign < 0;
    return peerForward === forward;
  });
  if (filtered.length < 2) return allGroup();
  return {
    edges: filtered,
    key: forward ? 'FWD' : 'REV',
    members: filtered.map(edge => edge.id),
  };
};

export const collectWorkerPeerGroups = (
  job: PathFindingJob,
  edgeMap: ReadonlyMap<string, WorkerGraphEdge>,
  nodeMap: ReadonlyMap<string, WorkerGraphNode>,
): {
  o2mPeerGroup: WorkerPeerGroup | null;
  m2oPeerGroup: WorkerPeerGroup | null;
} => {
  const edges = [...edgeMap.values()];
  const outgoing = job.isOneToMany
    ? edges.filter(edge => edge.source === job.source)
    : [];
  const incoming = job.isManyToOne
    ? edges.filter(edge => edge.target === job.target)
    : [];
  return {
    o2mPeerGroup: outgoing.length > 0
      ? pickWorkerPeerGroup({
          job,
          originId: job.source,
          isSource: true,
          allPeers: outgoing,
          nodeMap,
          edgeMap,
        })
      : null,
    m2oPeerGroup: incoming.length > 0
      ? pickWorkerPeerGroup({
          job,
          originId: job.target,
          isSource: false,
          allPeers: incoming,
          nodeMap,
          edgeMap,
        })
      : null,
  };
};
