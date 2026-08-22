import type { Edge, Node } from '@xyflow/react';

import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import { createBaseDisplayHardGateMemo, type BaseDisplayHardGateMemo } from './baseReactFlowDisplayHardGateMemo';
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
): BaseReactFlowPreDisplayContext => {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const repairNodes = withDisplayAbsolutePositions(nodes, nodeById);
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(repairNodes);
  const { getReport } = createBaseDisplayHardGateMemo(repairNodes, terminalSnapshot);
  return {
    repairNodes,
    getRouteHardQualityGateReport: getReport,
    routeTerminalsAreAttached: edges => (
      getDisplayTerminalValidationReport(edges, terminalSnapshot).allAttached
    ),
  };
};
