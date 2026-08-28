import type { Edge, Node } from '@xyflow/react';

import { countStrictEdgeCrossings } from '../../strategies/shared/edgeStrictCrossingGuard';
import { countDisplayObstacleHits } from './baseReactFlowDisplayEvaluation';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalValidation';

export type BaseReactFlowLayoutCandidateSeedAudit = Readonly<{
  terminalsAttached: boolean;
  terminalsAnchored: boolean;
  obstacleHits: number;
  strictCrossings: number;
}>;

export const shouldSkipBaseReactFlowLayoutCandidateRepair = (
  edgeCount: number,
  audit: BaseReactFlowLayoutCandidateSeedAudit,
): boolean => edgeCount > 0
  && !audit.terminalsAttached
  && !audit.terminalsAnchored
  && audit.strictCrossings >= edgeCount;

/**
 * Produces bounded aggregate evidence for deciding whether a staged layout
 * seed is close enough for measured repair. It intentionally omits edge ids,
 * paths, node geometry, and the more expensive complete hard-quality report.
 */
export const auditBaseReactFlowLayoutCandidateSeed = (
  edges: Edge[],
  nodes: Node[],
): BaseReactFlowLayoutCandidateSeedAudit => {
  const terminalReport = getDisplayTerminalValidationReport(
    edges,
    createDisplayTerminalValidationSnapshot(nodes),
  );
  return {
    terminalsAttached: terminalReport.allAttached,
    terminalsAnchored: terminalReport.allAnchored,
    obstacleHits: countDisplayObstacleHits(edges, nodes),
    strictCrossings: countStrictEdgeCrossings(edges),
  };
};
