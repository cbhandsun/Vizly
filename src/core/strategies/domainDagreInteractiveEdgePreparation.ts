import type { Edge } from '@xyflow/react';
import type { LayoutOptions } from '../types/layout';
import { expandHandle } from '../routing/utils/handleUtils';
import {
  buildEndpointOrthogonalFallbackPath,
  lockComputedPathOnEdge,
} from './shared/edgeFallbackPath';
import {
  repairSharedTargetEntryCrossings,
  synthesizeSharedEndpointTrunks,
} from './shared/edgeSharedTrunkSynthesis';
import {
  asRoutingRecord,
  readManualHandleLocks,
  routingNodeAbsolutePosition,
  routingNodeSize,
  type RoutingNode,
} from './domainDagreEdgePreparationSupport';

export interface DomainDagreInteractiveEdgePreparationInput {
  nodes: RoutingNode[];
  edges: Edge[];
  options: LayoutOptions;
  nodeById: Map<string, RoutingNode>;
}

// Ordered-lane candidates are promoted into the display-routing transaction.
// Seed them at the render-safe preference so the canonical finalizer does not
// have to expand every otherwise valid cross-lane terminal again.
const INTERACTIVE_ENDPOINT_STUB = 56;

const pickInteractiveHandles = (
  source: RoutingNode,
  target: RoutingNode,
  layoutDirection: string,
  preferEndpointGeometry = false,
): { sourceHandle: string; targetHandle: string } => {
  const sourcePos = routingNodeAbsolutePosition(source);
  const targetPos = routingNodeAbsolutePosition(target);
  const sourceSize = routingNodeSize(source);
  const targetSize = routingNodeSize(target);
  const dx = (targetPos.x + targetSize.width / 2) - (sourcePos.x + sourceSize.width / 2);
  const dy = (targetPos.y + targetSize.height / 2) - (sourcePos.y + sourceSize.height / 2);
  if (
    (!preferEndpointGeometry && (layoutDirection === 'LR' || layoutDirection === 'RL'))
    || Math.abs(dx) > Math.abs(dy) * 1.35
  ) {
    return dx >= 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' };
  }
  return dy >= 0
    ? { sourceHandle: 'bottom', targetHandle: 'top' }
    : { sourceHandle: 'top', targetHandle: 'bottom' };
};

export function prepareDomainDagreInteractiveEdges({
  nodes,
  edges,
  options,
  nodeById,
}: DomainDagreInteractiveEdgePreparationInput): Edge[] {
  const layoutDirection = String(options.direction || 'TB').toUpperCase();
  const orderedLanes = options.domainPlacement === 'ordered-lanes';
  const interactiveEdges = edges.map(edge => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      return {
        ...edge,
        sourceHandle: edge.sourceHandle || (layoutDirection === 'LR' || layoutDirection === 'RL' ? 'right' : 'bottom'),
        targetHandle: edge.targetHandle || (layoutDirection === 'LR' || layoutDirection === 'RL' ? 'left' : 'top'),
        data: {
          ...(edge.data || {}),
          algorithm: 'domain-dagre-interactive',
          trunkPolishVersion: 2,
        },
      };
    }

    const sourceDomain = String(source.data.domain ?? '').trim();
    const targetDomain = String(target.data.domain ?? '').trim();
    const handles = pickInteractiveHandles(
      source,
      target,
      layoutDirection,
      orderedLanes
        && sourceDomain.length > 0
        && targetDomain.length > 0
        && sourceDomain !== targetDomain,
    );
    const manualHandleLocks = readManualHandleLocks(asRoutingRecord(edge.data));
    const sourceHandle = manualHandleLocks.source && edge.sourceHandle
      ? edge.sourceHandle
      : handles.sourceHandle;
    const targetHandle = manualHandleLocks.target && edge.targetHandle
      ? edge.targetHandle
      : handles.targetHandle;
    const nextEdge = {
      ...edge,
      sourceHandle: expandHandle(sourceHandle),
      targetHandle: expandHandle(targetHandle),
      data: {
        ...(edge.data || {}),
        autoSource: !manualHandleLocks.source,
        autoTarget: !manualHandleLocks.target,
        auto: [
          ...(!manualHandleLocks.source ? ['source'] : []),
          ...(!manualHandleLocks.target ? ['target'] : []),
        ],
        algorithm: 'domain-dagre-interactive',
        trunkPolishVersion: 2,
      },
    } as Edge;
    lockComputedPathOnEdge(nextEdge, buildEndpointOrthogonalFallbackPath({
      source,
      target,
      sourceHandle: nextEdge.sourceHandle,
      targetHandle: nextEdge.targetHandle,
      nodeById,
      stubLength: orderedLanes ? INTERACTIVE_ENDPOINT_STUB : 40,
    }));
    return nextEdge;
  });

  return repairSharedTargetEntryCrossings(
    synthesizeSharedEndpointTrunks(interactiveEdges, { nodes }),
  ).map(edge => ({
    ...edge,
    data: {
      ...(edge.data || {}),
      algorithm: 'domain-dagre-interactive',
      trunkPolishVersion: 2,
      layoutPathLocked: true,
      runtimeHandleLock: {
        ...asRoutingRecord(asRoutingRecord(edge.data).runtimeHandleLock),
        source: true,
        target: true,
      },
    },
  })) as Edge[];
}
