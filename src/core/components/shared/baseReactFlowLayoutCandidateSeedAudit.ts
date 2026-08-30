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
  allowExactCleanSeed = false,
): boolean => edgeCount > 0 && (
  (
    allowExactCleanSeed
    && audit.terminalsAttached
    && audit.terminalsAnchored
    && audit.obstacleHits === 0
    && audit.strictCrossings === 0
  )
  || (
    !audit.terminalsAttached
    && !audit.terminalsAnchored
    && audit.strictCrossings >= edgeCount
  )
);

/**
 * A fully attached lane seed with dense obstacle penetration and at least one
 * strict crossing is not a near-clean repair candidate. Keep lighter defects
 * on the bounded repair path; only this high-confidence class is sent to the
 * existing domain-compound fallback by the layout transaction owner.
 */
export const shouldBypassBaseReactFlowObstacleDirtyLaneCandidate = (
  edgeCount: number,
  audit: BaseReactFlowLayoutCandidateSeedAudit,
): boolean => (
  Number.isSafeInteger(edgeCount)
  && edgeCount > 0
  && Number.isSafeInteger(audit.obstacleHits)
  && audit.obstacleHits >= 4
  && audit.obstacleHits / edgeCount >= 2 / 3
  && Number.isSafeInteger(audit.strictCrossings)
  && audit.strictCrossings > 0
  && audit.terminalsAttached
  && audit.terminalsAnchored
);

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
