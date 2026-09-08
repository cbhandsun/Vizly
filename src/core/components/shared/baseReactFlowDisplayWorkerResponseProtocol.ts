import type { Edge } from '@xyflow/react';
import type { RoutingPatch } from '../../routing/routingPatch';
import type { DisplayWorkerExecutionTiming } from './baseReactFlowDisplayWorkerExecutionTiming';

import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import type { DisplayRoutingWorkerCommitReceipt } from './baseReactFlowDisplayWorkerCommitReceipt';
import type {
  RoutingIdentity,
  RoutingWorkerSessionRef,
} from './baseReactFlowDisplayRoutingSession';

export type DisplayEdgesWorkerRouteResolution =
  | 'validated-candidate'
  | 'repaired-candidate'
  | 'incremental-route'
  | 'full-route'
  | 'full-route-repaired'
  | 'repair';

export type DisplayRoutingFallbackLevel = 'none' | 'full';

export type DisplayEdgesWorkerResponse = {
  requestId: string;
  edges?: Edge[];
  routingPatches?: RoutingPatch[];
  hardClean?: boolean;
  hardReport?: BaseDisplayBoundedCandidateReport;
  routeResolution?: DisplayEdgesWorkerRouteResolution;
  error?: string;
  boundedCandidate?: BaseDisplayBoundedCandidateReport;
  phaseTrace?: DisplayRoutingPhaseTrace[];
  phaseProgress?: DisplayRoutingPhaseTrace;
  affectedEdgeCount?: number;
  /** Final incremental candidate's allowed repair scope; not inferred from changed paths. */
  eligibleEdgeIds?: string[];
  fallbackLevel?: DisplayRoutingFallbackLevel;
  nextIdentity?: RoutingIdentity;
  outputRouteSignature?: string;
  sessionRef?: RoutingWorkerSessionRef;
  commitReceipt?: DisplayRoutingWorkerCommitReceipt;
  workerDurationMs?: number;
  workerExecutionTiming?: DisplayWorkerExecutionTiming;
};
