import type { Edge, Node } from '@xyflow/react';

import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import { collectBoundedDisplayRoutingPairDiagnostics } from './baseReactFlowDisplayDiagnostics';
import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import {
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  getDisplayNodeRect,
} from './baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { displayTerminalRoleNeedsDeclaredAxisRepair } from './baseReactFlowDisplayTerminalPortCandidates';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalValidation';
import { updateDisplayRoutingDebugState } from './baseReactFlowDisplayRoutingDebug';

const summarizeRejectedNode = (
  nodes: readonly Node[],
  nodeId: string,
) => {
  const node = nodes.find(item => item.id === nodeId);
  const rect = node ? getDisplayNodeRect(node) : null;
  return node && {
    id: node.id,
    position: rect ? { x: rect.x, y: rect.y } : node.position,
    width: rect?.width ?? node.width ?? node.measured?.width,
    height: rect?.height ?? node.height ?? node.measured?.height,
  };
};

const summarizeRejectedEdge = (
  edge: Edge,
  nodes: readonly Node[],
) => {
  const data = (edge.data ?? {}) as Record<string, unknown>;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    sourcePortPolicy: data.sourcePortPolicy,
    targetPortPolicy: data.targetPortPolicy,
    layoutDirection: data.layoutDirection,
    path: data.computedPath,
    sourceNode: summarizeRejectedNode(nodes, edge.source),
    targetNode: summarizeRejectedNode(nodes, edge.target),
  };
};

export const recordBaseReactFlowRejectedDisplayDiagnostics = ({
  edges,
  nodes,
}: {
  edges: Edge[];
  nodes: Node[];
}): void => {
  const terminalNodes = withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(terminalNodes);
  const terminalReport = getDisplayTerminalValidationReport(edges, terminalSnapshot);
  const hardGateDiagnostics = getDisplayHardQualityGateReport(
    edges,
    terminalNodes,
    'polished',
  );
  const summarizeEdge = (edge: Edge) => summarizeRejectedEdge(edge, terminalNodes);
  const hairpinEdges = edges.filter(edge => (
    calculateEdgePathQualityScore([edge]).hairpins > 0
  ));
  const terminalNodeById = new Map(terminalNodes.map(node => [node.id, node] as const));
  const declaredAxisMismatches = edges.filter((edge) => {
    const sourceNode = terminalNodeById.get(edge.source);
    const targetNode = terminalNodeById.get(edge.target);
    if (!sourceNode || !targetNode) return true;
    const sourceRect = getDisplayNodeRect(sourceNode);
    const targetRect = getDisplayNodeRect(targetNode);
    if (!sourceRect || !targetRect) return true;
    const path = getDisplayComputedPath(edge);
    return displayTerminalRoleNeedsDeclaredAxisRepair(
      edge,
      path,
      'source',
      sourceRect,
    ) || displayTerminalRoleNeedsDeclaredAxisRepair(
      edge,
      path,
      'target',
      targetRect,
    );
  });
  const unexplainedPairReport = collectBoundedDisplayRoutingPairDiagnostics({ edges });
  const strictCrossings = findDisplayStrictCrossingHits(edges).slice(0, 4).map(({ a, b }) => ({
    first: summarizeEdge(edges[a.edgeIndex]),
    second: summarizeEdge(edges[b.edgeIndex]),
    firstSegmentIndex: a.segmentIndex,
    secondSegmentIndex: b.segmentIndex,
  }));
  updateDisplayRoutingDebugState({
    hardGateDiagnostics,
    terminalDiagnostics: {
      unanchored: terminalReport.unanchoredEdgeIndexes.slice(0, 3).map(
        index => summarizeEdge(edges[index]),
      ),
      hairpins: hairpinEdges.slice(0, 3).map(summarizeEdge),
      declaredAxisMismatches: declaredAxisMismatches.slice(0, 3).map(summarizeEdge),
      strictCrossings,
      unexplainedPairs: unexplainedPairReport.pairs.map(pair => ({
        first: summarizeEdge(pair.first),
        second: summarizeEdge(pair.second),
        overlap: pair.overlap,
      })),
      pairBudget: {
        evaluatedPairCount: unexplainedPairReport.evaluatedPairCount,
        truncated: unexplainedPairReport.truncated,
      },
    },
  });
};
