import type { Edge, Node } from '@xyflow/react';

import {
  BASE_DISPLAY_ROUTING_VERSION,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import {
  getDisplayComputedPath,
  getDisplayNodeRect,
} from './baseReactFlowDisplayGeometry';
import {
  displayHardQualityGatesAreClean as evaluateDisplayHardQualityGatesAreClean,
  getDisplayHardQualityGateReport as evaluateDisplayHardQualityGateReport,
  type BaseDisplayBoundedCandidateReport,
  displayHardQualityReportGeometryIsClean,
} from './baseReactFlowDisplayEvaluation';
import { displayTerminalRoleNeedsDeclaredAxisRepair } from './baseReactFlowDisplayTerminalPortCandidates';
import {
  createDisplayTerminalValidationSnapshot,
  displayEdgesHaveNodeAnchoredTerminals,
  displayEdgesHaveNodeAttachedTerminals,
  getDisplayTerminalValidationReport,
  type DisplayTerminalValidationSnapshot,
} from './baseReactFlowTerminalAxisRepair';

type DisplayEpochNode = Node & {
  positionAbsolute?: { x: number; y: number };
};

const evaluateDisplayTerminalHardGates = (
  edges: Edge[],
  nodes: Node[],
  snapshot = createDisplayTerminalValidationSnapshot(nodes),
): { terminalsAttached: boolean; terminalsAnchored: boolean } => {
  const terminalReport = getDisplayTerminalValidationReport(
    edges,
    snapshot,
  );
  const terminalsAttached = terminalReport.allAttached;
  const terminalsAnchored = (() => {
    if (!terminalsAttached) return false;
    const nodeById = new Map(nodes.map(node => [node.id, node] as const));
    return terminalReport.allAnchored
      && edges.every((edge) => {
        const path = getDisplayComputedPath(edge);
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
        const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
        return Boolean(
          sourceRect
          && targetRect
          && !displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'source', sourceRect)
          && !displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'target', targetRect)
        );
      });
  })();
  return { terminalsAttached, terminalsAnchored };
};

export const getDisplayHardQualityGateReport = (
  edges: Edge[],
  nodes: Node[],
  candidate: BaseDisplayBoundedCandidateReport['candidate'],
  terminalSnapshot?: DisplayTerminalValidationSnapshot,
): BaseDisplayBoundedCandidateReport => evaluateDisplayHardQualityGateReport(
  edges,
  nodes,
  candidate,
  (candidateEdges, candidateNodes) => evaluateDisplayTerminalHardGates(
    candidateEdges,
    candidateNodes,
    terminalSnapshot,
  ),
);

export const displayHardQualityGatesAreClean = (edges: Edge[], nodes: Node[]): boolean => {
  return evaluateDisplayHardQualityGatesAreClean(
    edges,
    nodes,
    evaluateDisplayTerminalHardGates,
  );
};

/** Exact hard contract for geometry after renderer handles have been materialized. */
export const displayRenderedHardQualityGatesAreClean = (edges: Edge[], nodes: Node[]): boolean => {
  const report = getDisplayHardQualityGateReport(edges, nodes, 'polished');
  return displayHardQualityReportGeometryIsClean(report)
    && displayEdgesHaveNodeAttachedTerminals(edges, nodes)
    && displayEdgesHaveNodeAnchoredTerminals(edges, nodes);
};

export const baseReactFlowDisplayHardQualityIsClean = (
  edges: Edge[],
  nodes: Node[],
): boolean => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const repairNodes = withDisplayAbsolutePositions(nodes, nodeById);
  return displayHardQualityGatesAreClean(edges, repairNodes);
};

export const computeBaseReactFlowDisplayEdgeEpoch = ({
  nodes,
  edges,
}: {
  nodes: Node[];
  edges: Edge[];
}): number => {
  let hash = 2166136261;
  const feed = (value: unknown) => {
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };

  feed(BASE_DISPLAY_ROUTING_VERSION);
  nodes.forEach((node) => {
    const displayNode = node as DisplayEpochNode;
    const pos = displayNode.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
    const measured = node.measured;
    feed(node.id);
    feed(Math.round(Number(pos.x || 0)));
    feed(Math.round(Number(pos.y || 0)));
    feed(Math.round(Number(measured?.width ?? node.width ?? node.style?.width ?? 0)));
    feed(Math.round(Number(measured?.height ?? node.height ?? node.style?.height ?? 0)));
  });

  edges.forEach((edge) => {
    feed(edge.id);
    feed(edge.source);
    feed(edge.target);
    feed(edge.sourceHandle);
    feed(edge.targetHandle);
    feed(edge.type);
  });

  return hash >>> 0;
};
