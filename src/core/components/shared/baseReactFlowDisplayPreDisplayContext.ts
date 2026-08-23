import type { Edge, Node } from '@xyflow/react';

import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import { createBaseDisplayHardGateMemo, type BaseDisplayHardGateMemo } from './baseReactFlowDisplayHardGateMemo';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalAxisRepair';

export type BaseReactFlowPreDisplayContext = Readonly<{
  repairNodes: Node[];
  getRouteHardQualityGateReport: BaseDisplayHardGateMemo['getReport'];
  routeTerminalsAreAttached: (edges: Edge[]) => boolean;
}>;

export const createBaseReactFlowPreDisplayContext = (
  nodes: Node[],
  evaluationSession?: BaseReactFlowFinalEndpointEvaluation,
): BaseReactFlowPreDisplayContext => {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const repairNodes = evaluationSession?.nodes
    ?? withDisplayAbsolutePositions(nodes, nodeById);
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(repairNodes);
  const { getReport } = createBaseDisplayHardGateMemo(repairNodes, terminalSnapshot);
  return {
    repairNodes,
    getRouteHardQualityGateReport: evaluationSession?.hardReport ?? getReport,
    routeTerminalsAreAttached: edges => (
      evaluationSession?.terminalReport(edges).allAttached
      ?? getDisplayTerminalValidationReport(edges, terminalSnapshot).allAttached
    ),
  };
};
