/**
 * @file 边路由管线
 * @description 组装智能边路由、后处理和可选 ELK 路由阶段。
 */
import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { diagramConfigManager } from '../../components/config/DiagramConfig';
import {
  edgeTerminalHandleChangeIsAllowed,
  readEdgeTerminalPolicy,
  resolveEdgeTerminalHandleForSide,
  type EdgeTerminalRole,
  type EdgeTerminalSide,
} from '../../routing/utils/edgeTerminalPolicy';
import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  assignGlobalPorts,
  beautifyOrthogonalEdges,
  bundleEdges,
  decideEdgeRouting,
  distributePortConnections,
  globalOptimizeEdgeRouting,
  layerBasedEdgeRouting,
  optimizeEdgeLabelPositions,
  optimizeTreeBusRouting,
  separateParallelEdges,
} from '../../utils/HandlePicker';
import { routeEdgesWithELK } from '../../utils/elkEdgeRouter';
import { logElkEdgeRouterFallback } from '../layoutLogging';
import { separateDetachedParallelOverlaps } from './edgeDetachedOverlapRepair';
import { repairDetachedStrictCrossingBypasses } from './edgeDetachedStrictCrossingRepair';
import { repairEndpointLaneCrossings } from './edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from './edgeEndpointPathRepair';
import { refineGlobalEdgeWaypoints } from './edgeGlobalWaypointRefinement';
import { repairLocalDoglegArtifacts } from './edgeLocalDoglegRepair';
import { repairReverseFlowBypassCrossings } from './edgeReverseFlowBypassRepair';
import {
  computeAbsolutePosition,
  handleToAnchor,
  lockComputedPathsForDisplay,
  sanitizeComputedPaths,
  setAbsolutePositions,
} from './edgeRoutingPathGeometry';
import {
  buildEdgeTopologyStats,
  edgeTopologyPriority,
} from './edgeRoutingTopology';
import {
  reduceEdgeCrossingsWithWaypoints,
  repairSharedTrunkAwareCrossings,
  repairSharedTrunkAwareObstacles,
} from './edgeRoutingWaypointRefinement';
import { repairSameNodeInOutCrossings } from './edgeSameNodeRoleRepair';
import {
  repairSharedTargetEntryCrossings,
  synthesizeSharedEndpointTrunks,
  synthesizeSharedTargetTrunks,
} from './edgeSharedTrunkSynthesis';
import {
  chooseFewestStrictCrossings,
  keepIfNoNewStrictCrossings,
} from './edgeStrictCrossingGuard';

export {
  computeAbsolutePosition,
  reduceEdgeCrossingsWithWaypoints,
  repairSharedTrunkAwareCrossings,
  setAbsolutePositions,
};

const HANDLE_SIDE_BY_SHORTHAND: Record<'l' | 'r' | 't' | 'b', EdgeTerminalSide> = {
  l: 'left',
  r: 'right',
  t: 'top',
  b: 'bottom',
};

const edgeTerminalHandle = (
  edge: Edge,
  role: EdgeTerminalRole,
): string | null | undefined => (
  role === 'source' ? edge.sourceHandle : edge.targetHandle
);

/**
 * A routing choice selects a terminal side, not a DOM handle identity. Keep an
 * existing exact/compound ID when the side is unchanged and reject changes to
 * source-authored or unvalidated runtime-owned terminals.
 */
const resolvePipelineTerminalHandle = (
  edge: Edge,
  role: EdgeTerminalRole,
  proposedHandle: unknown,
): string | null | undefined => {
  const currentHandle = edgeTerminalHandle(edge, role);
  if (typeof proposedHandle !== 'string') return currentHandle;
  const shorthand = normalizeHandle(proposedHandle);
  if (!shorthand) return currentHandle;
  const resolvedHandle = resolveEdgeTerminalHandleForSide(
    edge,
    role,
    HANDLE_SIDE_BY_SHORTHAND[shorthand],
  );
  return edgeTerminalHandleChangeIsAllowed(edge, role, resolvedHandle)
    ? resolvedHandle
    : currentHandle;
};

const constrainPipelinePortsForEdge = (
  edge: Edge,
  globalPorts: Record<string, { source?: string; target?: string }>,
): Record<string, { source?: string; target?: string }> => {
  let constrainedPorts = globalPorts;
  const constrainRole = (role: EdgeTerminalRole, nodeId: string): void => {
    const policy = readEdgeTerminalPolicy(edge, role);
    if (!policy.sideFixed && !policy.runtimeFixed) return;
    const side = normalizeHandle(edgeTerminalHandle(edge, role));
    if (!side) return;
    if (constrainedPorts === globalPorts) constrainedPorts = { ...globalPorts };
    constrainedPorts[nodeId] = {
      ...(constrainedPorts[nodeId] || {}),
      [role]: HANDLE_SIDE_BY_SHORTHAND[side],
    };
  };
  constrainRole('source', edge.source);
  constrainRole('target', edge.target);
  return constrainedPorts;
};

const preservePipelineTerminalOwnership = (
  baselineEdges: readonly Edge[],
  candidateEdges: Edge[],
): Edge[] => candidateEdges.map((candidate, index) => {
  const baseline = baselineEdges[index];
  if (!baseline) return candidate;
  return {
    ...candidate,
    sourceHandle: resolvePipelineTerminalHandle(baseline, 'source', candidate.sourceHandle),
    targetHandle: resolvePipelineTerminalHandle(baseline, 'target', candidate.targetHandle),
  };
});

/** 处理单条边的路由。 */
function processEdge(
  edge: any,
  existingPaths: Array<{ points: Array<{ x: number; y: number }> }>,
  nodeMap: Map<string, ReactFlowNode>,
  nodes: ReactFlowNode[],
  cfgEdge: any,
  layoutDirection: string,
  globalPorts: any,
) {
  const edgeType = String(edge.type || '').toLowerCase();
  const baseType = edgeType.includes('smart') ? edge.type : 'smart-step';

  const newData = {
    ...(edge.data || {}),
    intraContainerNoObstacle: true,
    obstacleScope: 'corridor',
    obstaclePadding: 24,
    pathOptions: {
      ...(edge.data?.pathOptions || {}),
      gridRatio: 1.04,
      borderRadius: 4,
    },
  };

  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);

  let finalType = baseType;
  let finalSourceHandle = edge.sourceHandle;
  let finalTargetHandle = edge.targetHandle;
  let computedPath: Array<{ x: number; y: number }> = [];

  if (sourceNode && targetNode) {
    const routingConfig = {
      mode: 'advanced-smart' as const,
      globalPath: (cfgEdge.pathType || 'step') as string,
      autoPathSelection: true,
      layoutDirection,
      directionalHandlePolicy: 'force' as const,
      angleToleranceDeg: Number(cfgEdge.angleToleranceDeg ?? 36),
      routedPaths: existingPaths,
      preAssignedPorts: constrainPipelinePortsForEdge(edge, globalPorts),
    };

    const choice = decideEdgeRouting(sourceNode, targetNode, nodes, routingConfig);
    finalType = choice.type;
    finalSourceHandle = resolvePipelineTerminalHandle(edge, 'source', choice.sourceHandle);
    finalTargetHandle = resolvePipelineTerminalHandle(edge, 'target', choice.targetHandle);
    computedPath = choice.computedPath || [];

    if (computedPath.length < 2) {
      const sourcePosition = (sourceNode as any).positionAbsolute
        ?? (sourceNode as any).position
        ?? { x: 0, y: 0 };
      const targetPosition = (targetNode as any).positionAbsolute
        ?? (targetNode as any).position
        ?? { x: 0, y: 0 };
      const sourceWidth = (sourceNode as any)?.measured?.width ?? 100;
      const sourceHeight = (sourceNode as any)?.measured?.height ?? 50;
      const targetWidth = (targetNode as any)?.measured?.width ?? 100;
      const targetHeight = (targetNode as any)?.measured?.height ?? 50;

      if (!finalSourceHandle) {
        const dx = targetPosition.x - sourcePosition.x;
        const dy = targetPosition.y - sourcePosition.y;
        finalSourceHandle = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'bottom' : 'top');
      }
      if (!finalTargetHandle) {
        const dx = sourcePosition.x - targetPosition.x;
        const dy = sourcePosition.y - targetPosition.y;
        finalTargetHandle = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'bottom' : 'top');
      }

      computedPath = [
        handleToAnchor(
          sourcePosition,
          sourceWidth,
          sourceHeight,
          finalSourceHandle,
          sourceNode.type,
        ),
        handleToAnchor(
          targetPosition,
          targetWidth,
          targetHeight,
          finalTargetHandle,
          targetNode.type,
        ),
      ];
    }
  }

  return {
    edge: {
      ...edge,
      type: finalType,
      sourceHandle: finalSourceHandle,
      targetHandle: finalTargetHandle,
      data: { ...newData, computedPath },
    },
    computedPath,
  };
}

export interface EdgeRoutingOptions {
  /** 布局方向：'TB' | 'LR' */
  layoutDirection: 'TB' | 'LR';
}

/**
 * 执行完整的边路由管线。
 *
 * 1. 设置 positionAbsolute
 * 2. 全局端口分配
 * 3. 边排序（短边先处理）
 * 4. 两轮路由优化
 * 5. P2-P10 后处理管线
 * 6. ELK 边路由集成（可选）
 */
export async function runEdgeRoutingPipeline(
  nodes: ReactFlowNode[],
  edges: Edge[],
  options: EdgeRoutingOptions,
): Promise<Edge[]> {
  const { layoutDirection } = options;
  const cfgEdge = (diagramConfigManager.getConfig() as any)?.edge || {};
  const nodeMap = new Map<string, ReactFlowNode>(nodes.map(node => [node.id, node] as const));

  setAbsolutePositions(nodes);

  const routedPaths: Array<{ points: Array<{ x: number; y: number }> }> = [];
  const globalPorts = assignGlobalPorts(nodes, edges, { ...cfgEdge, layoutDirection });
  const topologyStats = buildEdgeTopologyStats(edges);

  const edgesWithDistance = edges.map((edge, originalIndex) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    let distance = 0;
    if (sourceNode && targetNode) {
      const sourcePosition = (sourceNode as any).positionAbsolute
        ?? (sourceNode as any).position
        ?? { x: 0, y: 0 };
      const targetPosition = (targetNode as any).positionAbsolute
        ?? (targetNode as any).position
        ?? { x: 0, y: 0 };
      const sourceWidth = (sourceNode as any)?.measured?.width ?? 100;
      const sourceHeight = (sourceNode as any)?.measured?.height ?? 50;
      const targetWidth = (targetNode as any)?.measured?.width ?? 100;
      const targetHeight = (targetNode as any)?.measured?.height ?? 50;
      const sourceCenterX = sourcePosition.x + sourceWidth / 2;
      const sourceCenterY = sourcePosition.y + sourceHeight / 2;
      const targetCenterX = targetPosition.x + targetWidth / 2;
      const targetCenterY = targetPosition.y + targetHeight / 2;
      distance = Math.sqrt(
        (targetCenterX - sourceCenterX) ** 2 + (targetCenterY - sourceCenterY) ** 2,
      );
    }
    return {
      edge,
      originalIndex,
      distance,
      topologyPriority: edgeTopologyPriority(edge, topologyStats),
    };
  });

  edgesWithDistance.sort((first, second) => {
    if (first.topologyPriority !== second.topologyPriority) {
      return first.topologyPriority - second.topologyPriority;
    }
    return first.distance - second.distance;
  });

  const sortedResults: Array<{ result: any; originalIndex: number }> = [];
  for (const item of edgesWithDistance) {
    const result = processEdge(
      item.edge,
      routedPaths,
      nodeMap,
      nodes,
      cfgEdge,
      layoutDirection,
      globalPorts,
    );
    routedPaths.push({ points: result.computedPath });
    sortedResults.push({ result, originalIndex: item.originalIndex });
  }

  const firstPassResults = new Array(edges.length);
  for (const item of sortedResults) {
    firstPassResults[item.originalIndex] = item.result;
  }

  const longEdgeIndices = [...edgesWithDistance]
    .sort((first, second) => first.distance - second.distance)
    .slice(-Math.min(5, Math.ceil(edges.length / 4)))
    .map(item => item.originalIndex);

  for (const index of longEdgeIndices) {
    const otherPaths = routedPaths.filter((_, pathIndex) => pathIndex !== index);
    const result = processEdge(
      edges[index],
      otherPaths,
      nodeMap,
      nodes,
      cfgEdge,
      layoutDirection,
      globalPorts,
    );
    firstPassResults[index] = result;
    const sortedIndex = edgesWithDistance.findIndex(item => item.originalIndex === index);
    if (sortedIndex >= 0) {
      routedPaths[sortedIndex] = { points: result.computedPath };
    }
  }

  let finalEdges = firstPassResults.map((result: any) => result.edge);

  const enableGlobalOptimization = cfgEdge?.globalOptimization ?? false;
  if (enableGlobalOptimization && finalEdges.length > 1) {
    const preGlobalOptimizationEdges = finalEdges;
    finalEdges = preservePipelineTerminalOwnership(
      preGlobalOptimizationEdges,
      globalOptimizeEdgeRouting(
        finalEdges,
        nodes,
        {
          mode: 'advanced-smart',
          layoutDirection,
          directionalHandlePolicy: 'force',
          topK: 4,
          preAssignedPorts: globalPorts,
        },
        3,
      ),
    );
  }

  finalEdges = separateParallelEdges(finalEdges, 12);
  finalEdges = distributePortConnections(finalEdges, nodes, 16);

  const bundlingEnabled = cfgEdge?.bundling ?? true;
  finalEdges = bundleEdges(finalEdges, nodes, {
    enabled: bundlingEnabled,
    layoutDirection,
    regionSize: 200,
    minBundleSize: 2,
    bundleSpacing: 8,
  });

  finalEdges = layerBasedEdgeRouting(finalEdges, nodes, {
    enabled: true,
    layerThreshold: 400,
    layoutDirection,
  });
  finalEdges = beautifyOrthogonalEdges(finalEdges, nodes, {
    enabled: true,
    minSegmentLength: 20,
  });
  finalEdges = optimizeTreeBusRouting(finalEdges, nodes, {
    enabled: true,
    minBusSize: 2,
    layoutDirection,
  });

  finalEdges = sanitizeComputedPaths(finalEdges);
  finalEdges = repairSharedTrunkAwareObstacles(finalEdges, nodes);
  finalEdges = sanitizeComputedPaths(finalEdges);
  finalEdges = repairSharedTrunkAwareCrossings(finalEdges, nodes);
  finalEdges = sanitizeComputedPaths(finalEdges);
  finalEdges = repairSharedTrunkAwareObstacles(finalEdges, nodes, 18);
  finalEdges = sanitizeComputedPaths(finalEdges);
  finalEdges = repairSharedTrunkAwareCrossings(finalEdges, nodes);
  finalEdges = sanitizeComputedPaths(finalEdges);
  finalEdges = repairSharedTrunkAwareObstacles(finalEdges, nodes, 18);
  finalEdges = sanitizeComputedPaths(finalEdges);

  finalEdges = reduceEdgeCrossingsWithWaypoints(finalEdges, nodes, layoutDirection);
  finalEdges = sanitizeComputedPaths(finalEdges);
  finalEdges = repairSharedTrunkAwareObstacles(finalEdges, nodes, 18);
  finalEdges = repairSharedTrunkAwareCrossings(finalEdges, nodes);
  finalEdges = sanitizeComputedPaths(finalEdges);
  finalEdges = separateDetachedParallelOverlaps(finalEdges, nodes);
  finalEdges = sanitizeComputedPaths(finalEdges);
  finalEdges = repairSharedTrunkAwareObstacles(finalEdges, nodes, 18);
  finalEdges = sanitizeComputedPaths(finalEdges);

  finalEdges = optimizeEdgeLabelPositions(finalEdges, nodes, {
    enabled: true,
    labelPadding: 8,
  });

  const useElkRouting = cfgEdge?.useElkRouting ?? false;
  if (useElkRouting && finalEdges.length > 0) {
    try {
      const elkPaths = await routeEdgesWithELK(nodes, finalEdges, {
        direction: layoutDirection,
        edgeNodeSpacing: 25,
        edgeEdgeSpacing: 20,
      });

      if (elkPaths.size > 0) {
        finalEdges = finalEdges.map((edge: any) => {
          const path = elkPaths.get(edge.id || `${edge.source}->${edge.target}`);
          if (path && path.length >= 2) {
            return {
              ...edge,
              data: { ...edge.data, elkPath: path, useElkRouting: true },
            };
          }
          return edge;
        });
      }
    } catch (error) {
      logElkEdgeRouterFallback(error);
    }
  }

  finalEdges = separateDetachedParallelOverlaps(
    repairLocalDoglegArtifacts(
      synthesizeSharedEndpointTrunks(
        repairEndpointOrthogonalPaths(repairEndpointOrthogonalPaths(finalEdges, nodes), nodes),
        { nodes },
      ),
      nodes,
    ),
    nodes,
    24,
  );
  finalEdges = synthesizeSharedEndpointTrunks(finalEdges, { nodes });
  finalEdges = repairEndpointOrthogonalPaths(repairEndpointOrthogonalPaths(finalEdges, nodes), nodes);
  finalEdges = synthesizeSharedTargetTrunks(finalEdges, { nodes });
  finalEdges = repairEndpointOrthogonalPaths(repairEndpointOrthogonalPaths(finalEdges, nodes), nodes);
  finalEdges = repairSameNodeInOutCrossings(finalEdges, nodes);
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = repairReverseFlowBypassCrossings(finalEdges, nodes);
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = repairSharedTrunkAwareCrossings(finalEdges, nodes);
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = repairReverseFlowBypassCrossings(finalEdges, nodes);
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = repairSharedTrunkAwareCrossings(finalEdges, nodes);
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = repairEndpointLaneCrossings(finalEdges, nodes);
  finalEdges = refineGlobalEdgeWaypoints(finalEdges, nodes);
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = refineGlobalEdgeWaypoints(finalEdges, nodes);
  finalEdges = repairLocalDoglegArtifacts(finalEdges, nodes);
  finalEdges = refineGlobalEdgeWaypoints(finalEdges, nodes);
  finalEdges = repairLocalDoglegArtifacts(finalEdges, nodes);
  finalEdges = synthesizeSharedTargetTrunks(finalEdges, { nodes });
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = repairSharedTargetEntryCrossings(finalEdges);
  finalEdges = separateDetachedParallelOverlaps(finalEdges, nodes, 16);
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = repairLocalDoglegArtifacts(finalEdges, nodes);
  finalEdges = repairSharedTargetEntryCrossings(finalEdges);
  finalEdges = separateDetachedParallelOverlaps(finalEdges, nodes, 16);
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = refineGlobalEdgeWaypoints(finalEdges, nodes);
  finalEdges = repairEndpointOrthogonalPaths(finalEdges, nodes);
  finalEdges = repairSharedTargetEntryCrossings(finalEdges);

  const finalGlobalCrossingCandidate = repairEndpointOrthogonalPaths(
    refineGlobalEdgeWaypoints(finalEdges, nodes),
    nodes,
  );
  const finalSharedCrossingCandidate = repairEndpointOrthogonalPaths(
    repairSharedTrunkAwareCrossings(finalGlobalCrossingCandidate, nodes),
    nodes,
  );
  const finalEndpointLaneCandidate = keepIfNoNewStrictCrossings(
    finalSharedCrossingCandidate,
    repairEndpointOrthogonalPaths(
      repairEndpointLaneCrossings(finalSharedCrossingCandidate, nodes),
      nodes,
    ),
  );
  const finalPostSharedGlobalCandidate = keepIfNoNewStrictCrossings(
    finalEndpointLaneCandidate,
    repairEndpointOrthogonalPaths(
      refineGlobalEdgeWaypoints(finalEndpointLaneCandidate, nodes),
      nodes,
    ),
  );
  const finalPostGlobalEndpointLaneCandidate = keepIfNoNewStrictCrossings(
    finalPostSharedGlobalCandidate,
    repairEndpointOrthogonalPaths(
      repairEndpointLaneCrossings(finalPostSharedGlobalCandidate, nodes),
      nodes,
    ),
  );
  const finalPreOverlapRepairCandidate = keepIfNoNewStrictCrossings(
    finalPostGlobalEndpointLaneCandidate,
    repairEndpointOrthogonalPaths(finalPostGlobalEndpointLaneCandidate, nodes),
  );
  const finalDetachedOverlapCandidate = separateDetachedParallelOverlaps(
    finalPreOverlapRepairCandidate,
    nodes,
    16,
  );
  const finalCrossingRepairCandidate = keepIfNoNewStrictCrossings(
    finalPreOverlapRepairCandidate,
    finalDetachedOverlapCandidate,
  );
  finalEdges = chooseFewestStrictCrossings(
    finalEdges,
    finalGlobalCrossingCandidate,
    finalSharedCrossingCandidate,
    finalEndpointLaneCandidate,
    finalPostSharedGlobalCandidate,
    finalPostGlobalEndpointLaneCandidate,
    finalPreOverlapRepairCandidate,
    finalCrossingRepairCandidate,
  );

  const finalStrictSweepCandidate = repairEndpointOrthogonalPaths(
    refineGlobalEdgeWaypoints(finalEdges, nodes),
    nodes,
  );
  const finalStrictEndpointLaneCandidate = repairEndpointOrthogonalPaths(
    repairEndpointLaneCrossings(finalEdges, nodes),
    nodes,
  );
  const finalStrictBypassRawCandidate = repairDetachedStrictCrossingBypasses(
    finalEdges,
    nodes,
  );
  const finalStrictBypassCandidate = repairEndpointOrthogonalPaths(
    finalStrictBypassRawCandidate,
    nodes,
  );
  const finalQualityBaseEdges = chooseFewestStrictCrossings(
    finalEdges,
    finalStrictSweepCandidate,
    finalStrictEndpointLaneCandidate,
    finalStrictBypassRawCandidate,
    finalStrictBypassCandidate,
  );
  const finalPostQualityStrictBypassRawCandidate = repairDetachedStrictCrossingBypasses(
    finalQualityBaseEdges,
    nodes,
  );
  const finalPostQualityStrictBypassCandidate = repairEndpointOrthogonalPaths(
    finalPostQualityStrictBypassRawCandidate,
    nodes,
  );
  finalEdges = chooseFewestStrictCrossings(
    finalQualityBaseEdges,
    finalPostQualityStrictBypassRawCandidate,
    finalPostQualityStrictBypassCandidate,
  );
  for (let pass = 0; pass < 3; pass += 1) {
    const strictBypassRawCandidate = repairDetachedStrictCrossingBypasses(finalEdges, nodes);
    const strictBypassCandidate = repairEndpointOrthogonalPaths(strictBypassRawCandidate, nodes);
    const nextFinalEdges = chooseFewestStrictCrossings(
      finalEdges,
      strictBypassRawCandidate,
      strictBypassCandidate,
    );
    if (nextFinalEdges === finalEdges) break;
    finalEdges = nextFinalEdges;
  }
  finalEdges = preservePipelineTerminalOwnership(edges, finalEdges);
  finalEdges = lockComputedPathsForDisplay(finalEdges);
  return finalEdges;
}
