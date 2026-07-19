import { countObstaclesInDirection } from './GraphBuilder';
import type { PathfindingContext, Point } from '../../types/routing';
import { Position } from '../../types/routing';
import type { BusDetector } from '../preprocessing/BusDetector';
import type { PortSelector } from '../preprocessing/PortSelector';
import type { ResolvedWorkerRoutingContext } from './edgeRoutingWorkerContext';
import {
  collectWorkerPeerGroups,
  oppositeWorkerPort,
  resolveWorkerPortAnchors,
  resolveWorkerPortFromTrunkAxis,
} from './edgeRoutingWorkerBusGeometry';
import { applyWorkerPortGuards } from './edgeRoutingWorkerPortGuards';
import { selectWorkerPorts } from './edgeRoutingWorkerPortSelection';
import { logRoutingWorkerDebug } from '../../utils/routingLogging';

type TrunkHint = { source: Point; target: Point };

export interface WorkerEndpointResolution {
  startPosition: Position;
  endPosition: Position;
  startPoint: Point;
  endPoint: Point;
  startOffset: Point;
  endOffset: Point;
  hasExplicitSource: boolean;
  hasExplicitTarget: boolean;
  isGlobalTrunkMember: boolean;
  isReverseBypassActive: boolean;
  reverseBypassSide: Position | null;
  o2mTrunk?: TrunkHint;
  m2oTrunk?: TrunkHint;
  busPeerGroupSize: number;
  busPeerGroupKey: string | null;
  busPeerGroupMembers: string[] | null;
}

export const parseWorkerHandleDirection = (handle?: unknown): Position | undefined => {
  if (typeof handle !== 'string' || handle.length === 0 || handle.length > 1_024) return undefined;
  const normalized = handle.toLowerCase();
  if (normalized === 'left' || normalized === 'l') return Position.Left;
  if (normalized === 'right' || normalized === 'r') return Position.Right;
  if (normalized === 'top' || normalized === 't') return Position.Top;
  if (normalized === 'bottom' || normalized === 'b') return Position.Bottom;
  if (normalized.includes('left')) return Position.Left;
  if (normalized.includes('right')) return Position.Right;
  if (normalized.includes('top')) return Position.Top;
  if (normalized.includes('bottom')) return Position.Bottom;
  return undefined;
};

export const resolveWorkerEndpoints = ({
  context,
  resolved,
  busDetector,
  portSelector,
}: {
  context: PathfindingContext;
  resolved: ResolvedWorkerRoutingContext;
  busDetector: BusDetector;
  portSelector: PortSelector;
}): WorkerEndpointResolution => {
  const { job, graph, config, runtime = {} } = context;
  const {
    nodes,
    nodeMap,
    edgeMap,
    sourceNode,
    targetNode,
    sourceRect,
    targetRect,
    routingObstacles,
    spatialIndex,
  } = resolved;
  const busOrientation = busDetector.resolveBusOrientation(
    !!job.isManyToOne,
    job.isManyToOne ? job.target : job.source,
    graph.edges,
    graph.nodes,
    job.layoutDirection || 'LR',
    nodeMap,
  );

  let startPosition = job.sourcePosition || Position.Right;
  let endPosition = job.targetPosition || Position.Left;
  const explicitSource = parseWorkerHandleDirection(job.sourceHandle);
  const explicitTarget = parseWorkerHandleDirection(job.targetHandle);
  const hasExplicitSource = explicitSource !== undefined;
  const hasExplicitTarget = explicitTarget !== undefined;
  let hasFixedSourcePort = false;
  let hasFixedTargetPort = false;
  let busPeerGroupSize = 0;
  let busPeerGroupKey: string | null = null;
  let busPeerGroupMembers: string[] | null = null;

  if (explicitSource) {
    startPosition = explicitSource;
    hasFixedSourcePort = true;
  }
  if (explicitTarget) {
    endPosition = explicitTarget;
    hasFixedTargetPort = true;
  }

  const isGlobalTrunkMember = !!(job.busTrunkSource && job.busTrunkTarget);
  const fallbackTrunk = job.busTrunkSource && job.busTrunkTarget
    ? { source: job.busTrunkSource, target: job.busTrunkTarget }
    : undefined;
  const o2mTrunk = job.busRoutingPlan?.o2mTrunk ?? job.o2mTrunk;
  const m2oTrunk = job.busRoutingPlan?.m2oTrunk ?? job.m2oTrunk;

  if (job.isOneToMany && o2mTrunk && !hasFixedSourcePort) {
    startPosition = resolveWorkerPortFromTrunkAxis({
      rectangle: sourceRect,
      otherRectangle: targetRect,
      trunkHint: o2mTrunk,
      fallbackTrunk,
      isGlobalTrunkMember,
    });
    hasFixedSourcePort = true;
  }
  if (job.isManyToOne && m2oTrunk && !hasFixedTargetPort) {
    endPosition = resolveWorkerPortFromTrunkAxis({
      rectangle: targetRect,
      isTargetSide: true,
      trunkHint: m2oTrunk,
      fallbackTrunk,
      isGlobalTrunkMember,
    });
    hasFixedTargetPort = true;
  }

  const { o2mPeerGroup, m2oPeerGroup } = collectWorkerPeerGroups(job, edgeMap, nodeMap);
  const peerGroupForDebug = o2mPeerGroup ?? m2oPeerGroup;
  if (peerGroupForDebug) {
    busPeerGroupSize = Math.max(o2mPeerGroup?.edges.length ?? 0, m2oPeerGroup?.edges.length ?? 0);
    busPeerGroupKey = [
      o2mPeerGroup ? `o2m:${o2mPeerGroup.key}` : null,
      m2oPeerGroup ? `m2o:${m2oPeerGroup.key}` : null,
    ].filter(Boolean).join('|') || peerGroupForDebug.key;
    busPeerGroupMembers = Array.from(new Set([
      ...(o2mPeerGroup?.members ?? []),
      ...(m2oPeerGroup?.members ?? []),
    ]));
  }

  if (!hasFixedSourcePort && job.isOneToMany && o2mPeerGroup && o2mPeerGroup.edges.length > 1) {
    const result = busDetector.calculateBusConsensus(
      false,
      sourceRect,
      o2mPeerGroup.edges,
      nodes,
      spatialIndex || null,
      routingObstacles,
      startPosition,
      hasExplicitSource,
    );
    startPosition = result.position;
    hasFixedSourcePort = result.hasFixed;
  }
  if (!hasFixedTargetPort && job.isManyToOne && m2oPeerGroup && m2oPeerGroup.edges.length > 1) {
    const result = busDetector.calculateBusConsensus(
      true,
      targetRect,
      m2oPeerGroup.edges,
      nodes,
      spatialIndex || null,
      routingObstacles,
      endPosition,
      hasExplicitTarget,
    );
    endPosition = result.position;
    hasFixedTargetPort = result.hasFixed;
  }

  if (!hasFixedTargetPort && (job.isOneToMany || isGlobalTrunkMember)) {
    if (isGlobalTrunkMember) {
      endPosition = resolveWorkerPortFromTrunkAxis({
        rectangle: targetRect,
        otherRectangle: sourceRect,
        isTargetSide: true,
        trunkHint: o2mTrunk,
        fallbackTrunk,
        isGlobalTrunkMember,
      });
    } else {
      const dx = sourceRect.x + sourceRect.width / 2 - (targetRect.x + targetRect.width / 2);
      const dy = sourceRect.y + sourceRect.height / 2 - (targetRect.y + targetRect.height / 2);
      endPosition = Math.abs(dx) > Math.abs(dy) * 0.8
        ? (dx > 0 ? Position.Right : Position.Left)
        : (dy > 0 ? Position.Bottom : Position.Top);
    }
    const blocked = countObstaclesInDirection(targetRect, endPosition, routingObstacles, 40);
    if (blocked > 2) {
      const fallback = oppositeWorkerPort(endPosition);
      if (countObstaclesInDirection(targetRect, fallback, routingObstacles, 40) < blocked) {
        endPosition = fallback;
      }
    }
    hasFixedTargetPort = true;
  }

  if (!hasFixedSourcePort && (job.isManyToOne || isGlobalTrunkMember)) {
    if (isGlobalTrunkMember) {
      startPosition = resolveWorkerPortFromTrunkAxis({
        rectangle: sourceRect,
        otherRectangle: targetRect,
        trunkHint: m2oTrunk,
        fallbackTrunk,
        isGlobalTrunkMember,
      });
    } else {
      const dx = targetRect.x + targetRect.width / 2 - (sourceRect.x + sourceRect.width / 2);
      const dy = targetRect.y + targetRect.height / 2 - (sourceRect.y + sourceRect.height / 2);
      startPosition = Math.abs(dx) > Math.abs(dy) * 0.8
        ? (dx > 0 ? Position.Right : Position.Left)
        : (dy > 0 ? Position.Bottom : Position.Top);
    }
    const blocked = countObstaclesInDirection(sourceRect, startPosition, routingObstacles, 40);
    if (blocked > 2) {
      const fallback = oppositeWorkerPort(startPosition);
      if (countObstaclesInDirection(sourceRect, fallback, routingObstacles, 40) < blocked) {
        startPosition = fallback;
      }
    }
    hasFixedSourcePort = true;
  }

  const selectedPorts = selectWorkerPorts({
    job,
    config,
    selector: portSelector,
    sourceRect,
    targetRect,
    obstacles: routingObstacles,
    pendingEdges: graph.pendingEdges,
    effectiveDirection: busOrientation.busDir,
    portUsage: runtime.portUsage || {},
    startPosition,
    endPosition,
    hasFixedSourcePort,
    hasFixedTargetPort,
    hasExplicitSource,
    hasExplicitTarget,
    isGlobalTrunkMember,
  });
  startPosition = selectedPorts.startPosition;
  endPosition = selectedPorts.endPosition;

  const guardedPorts = applyWorkerPortGuards({
    job,
    sourceNode,
    targetNode,
    sourceRect,
    targetRect,
    routingObstacles,
    startPosition,
    endPosition,
    isGlobalTrunkMember,
    hasExplicitSource,
    hasExplicitTarget,
    onDebug: config.debug ? logRoutingWorkerDebug : undefined,
  });
  startPosition = guardedPorts.startPosition;
  endPosition = guardedPorts.endPosition;

  const isPrecomputedSharedTrunkMember = isGlobalTrunkMember
    && ((job.busRoutingPlan?.peerGroupSize ?? job.peerGroupSize ?? 0) > 1);
  if (isPrecomputedSharedTrunkMember && job.isManyToOne && !hasExplicitSource) {
    startPosition = resolveWorkerPortFromTrunkAxis({
      rectangle: sourceRect,
      otherRectangle: targetRect,
      trunkHint: m2oTrunk,
      fallbackTrunk,
      isGlobalTrunkMember,
    });
  }

  const anchors = resolveWorkerPortAnchors({
    job,
    config,
    selector: portSelector,
    sourceRect,
    targetRect,
    sourcePosition: startPosition,
    targetPosition: endPosition,
  });
  return {
    startPosition,
    endPosition,
    startPoint: anchors.startPoint,
    endPoint: anchors.endPoint,
    startOffset: anchors.startOffset,
    endOffset: anchors.endOffset,
    hasExplicitSource,
    hasExplicitTarget,
    isGlobalTrunkMember,
    isReverseBypassActive: guardedPorts.isReverseBypassActive,
    reverseBypassSide: guardedPorts.reverseBypassSide,
    o2mTrunk,
    m2oTrunk,
    busPeerGroupSize,
    busPeerGroupKey,
    busPeerGroupMembers,
  };
};
