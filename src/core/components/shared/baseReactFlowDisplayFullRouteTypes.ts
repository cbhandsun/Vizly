import type { Edge, Node } from '@xyflow/react';

import type {
  BaseDisplayBoundedCandidateReport,
  DisplayQualityBudget,
} from './baseReactFlowDisplayEvaluation';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import type { RoutingTopologyPlan } from './baseReactFlowDisplayRoutingTopologyPlan';

export type BaseReactFlowDisplayEdgesArgs = {
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  /** Honors an explicit worker full-quality request below the extreme graph cap. */
  forceFullQuality?: boolean;
  /** Same-job interactive candidate; source shape is revalidated before reuse. */
  preparedInteractiveEdges?: Edge[];
  /** Worker-only seed support for a newly connected edge with no renderer metadata yet. */
  seedUnroutedFlowEdges?: boolean;
  reusePreparedGlobalRouting?: boolean;
  skipBoundedAttempt?: boolean;
  skipFinalizedReuse?: boolean;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  evaluationSession?: BaseReactFlowFinalEndpointEvaluation;
};

export type BaseReactFlowPreDisplayFinalEdgesArgs = {
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  /** Reuses the caller's interactive pass instead of routing that seed again. */
  preparedInteractiveEdges?: Edge[];
  skipFullRouteFallback?: boolean;
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  evaluationSession?: BaseReactFlowFinalEndpointEvaluation;
};

export type BaseReactFlowPreDisplayFinalEdgesFactory = (
  args: BaseReactFlowPreDisplayFinalEdgesArgs,
) => Edge[];

export type BaseReactFlowFullRouteContext = {
  inputSignature: string;
  routeSeedEdges: Edge[];
  normalizedEdges: Edge[];
  repairNodes: Node[];
  renderNodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  layoutDirection: string;
  qualityBudget: DisplayQualityBudget;
  useBoundedLargeRepair: boolean;
  canReusePreparedGlobalRouting: boolean;
  reusePreparedGlobalRouting: boolean;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  evaluationSession: BaseReactFlowFinalEndpointEvaluation;
  topologyPlan: RoutingTopologyPlan;
};

export type BaseReactFlowFullRouteSeedResult =
  | { kind: 'finalized'; edges: Edge[] }
  | { kind: 'continue'; context: BaseReactFlowFullRouteContext };
