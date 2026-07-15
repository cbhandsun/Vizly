import type { Edge, Node } from '@xyflow/react';

import type {
  BaseDisplayBoundedCandidateReport,
  DisplayQualityBudget,
} from './baseReactFlowDisplayEvaluation';

export type BaseReactFlowDisplayEdgesArgs = {
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  reusePreparedGlobalRouting?: boolean;
  skipBoundedAttempt?: boolean;
  skipFinalizedReuse?: boolean;
};

export type BaseReactFlowPreDisplayFinalEdgesFactory = (args: {
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  skipFullRouteFallback?: boolean;
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void;
}) => Edge[];

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
};

export type BaseReactFlowFullRouteSeedResult =
  | { kind: 'finalized'; edges: Edge[] }
  | { kind: 'continue'; context: BaseReactFlowFullRouteContext };
