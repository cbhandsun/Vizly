import type { Edge } from '@xyflow/react';

import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
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
  routingPatches?: Edge[];
  hardClean?: boolean;
  hardReport?: BaseDisplayBoundedCandidateReport;
  routeResolution?: DisplayEdgesWorkerRouteResolution;
  error?: string;
  boundedCandidate?: BaseDisplayBoundedCandidateReport;
  phaseTrace?: DisplayRoutingPhaseTrace[];
  phaseProgress?: DisplayRoutingPhaseTrace;
  affectedEdgeCount?: number;
  fallbackLevel?: DisplayRoutingFallbackLevel;
  nextIdentity?: RoutingIdentity;
  outputRouteSignature?: string;
  sessionRef?: RoutingWorkerSessionRef;
  workerDurationMs?: number;
};
