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
 * Flat full-graph ELK can produce an orthogonal, obstacle-clean seed whose
 * terminal segments are attached but point away from their resolved handles.
 * That exact boundary cannot be corrected by routing alone without changing
 * the requested layout geometry, so the layout owner should retry with the
 * domain-preserving compound strategy before starting the expensive route.
 */
export const shouldBypassBaseReactFlowUnanchoredFlatElkCandidate = (
  edgeCount: number,
  audit: BaseReactFlowLayoutCandidateSeedAudit,
): boolean => Number.isSafeInteger(edgeCount)
  && edgeCount > 0
  && audit.terminalsAttached
  && !audit.terminalsAnchored
  && audit.obstacleHits === 0
  && audit.strictCrossings === 0;

/**
 * A fully attached lane seed with dense obstacle penetration and at least one
 * strict crossing is not a near-clean repair candidate. Keep lighter defects
 * on the bounded repair path; only this high-confidence class is sent to the
 * existing domain-compound fallback by the layout transaction owner.
 */
export const shouldBypassBaseReactFlowObstacleDirtyLaneCandidate = (
  edgeCount: number,
  audit: BaseReactFlowLayoutCandidateSeedAudit,
): boolean => {
  if (
    !Number.isSafeInteger(edgeCount)
    || edgeCount <= 0
    || !Number.isSafeInteger(audit.obstacleHits)
    || audit.obstacleHits < 4
    || !Number.isSafeInteger(audit.strictCrossings)
    || audit.strictCrossings <= 0
    || !audit.terminalsAttached
  ) return false;

  if (audit.terminalsAnchored) return audit.obstacleHits / edgeCount >= 2 / 3;

  // An attached-but-unanchored seed may still be cheaply recoverable, so it
  // needs stronger evidence than an anchored seed. The observed reverse WMS
  // lane candidate penetrates at least one obstacle per edge and crosses on
  // at least one eighth of the graph. That class cannot become hard-clean by
  // terminal-axis normalization alone and should enter the existing compound
  // fallback without first paying for a measured obstacle repair.
  return audit.obstacleHits >= edgeCount
    && audit.strictCrossings / edgeCount >= 1 / 8;
};

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
