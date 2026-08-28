import type { DisplayGeometryBarrierResolution } from './baseReactFlowDisplayGeometryBarrier';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import type {
  DisplayEdgesWorkerResponse,
  DisplayEdgesWorkerRouteResolution,
  DisplayRoutingFallbackLevel,
} from './baseReactFlowDisplayWorkerProtocol';

export type DisplayRoutingDebugState = {
  stage?: string;
  signature?: string;
  nodeCount?: number;
  edgeCount?: number;
  requestId?: string;
  updatedAt?: number;
  scheduledAt?: number;
  workerStartedAt?: number;
  workerResponseParsedAt?: number;
  finalAppliedAt?: number;
  cacheHitAt?: number;
  routeMs?: number;
  /** User-visible latency from scheduling through final state commit. */
  totalRouteMs?: number;
  workerStartCount?: number;
  workerAbortCount?: number;
  error?: string;
  boundedCandidate?: DisplayEdgesWorkerResponse['boundedCandidate'];
  boundedCandidateTrace?: NonNullable<DisplayEdgesWorkerResponse['boundedCandidate']>[];
  inputGeometryDigest?: string;
  outputRouteSignature?: string;
  routingVersion?: string;
  workerResolution?: DisplayEdgesWorkerRouteResolution;
  cacheTrustLevel?: 'runtime-committed' | 'external-candidate' | 'miss';
  terminalDiagnostics?: unknown;
  phaseTrace?: DisplayRoutingPhaseTrace[];
  lastPhaseTrace?: DisplayRoutingPhaseTrace;
  phaseProgressTrace?: DisplayRoutingPhaseTrace[];
  affectedEdgeCount?: number;
  fallbackLevel?: DisplayRoutingFallbackLevel;
  geometryBarrierResolution?: DisplayGeometryBarrierResolution;
  geometryBarrierMs?: number;
  geometryBarrierSamples?: number;
  hardGateDiagnostics?: BaseDisplayBoundedCandidateReport;
  stagedLayoutPrimarySignature?: string;
  stagedLayoutPrimaryGeometryDigest?: string;
  stagedLayoutSourceSignature?: string;
  stagedLayoutSourceGeometryDigest?: string;
  layoutSeedTerminalsAttached?: boolean;
  layoutSeedTerminalsAnchored?: boolean;
  layoutSeedObstacleHits?: number;
  layoutSeedStrictCrossings?: number;
  incrementalBaselineSignature?: string;
  incrementalPlanStatus?: 'ready' | 'missing-baseline' | 'rejected';
  renderAuthorityStatus?: BaseReactFlowRenderAuthorityStatus;
  renderAuthorityIssue?: BaseReactFlowRenderAuthorityIssue;
};

export type BaseReactFlowRenderAuthorityIssue =
  | 'untrusted-baseline'
  | 'missing-worker-session'
  | 'missing-hard-report'
  | 'output-signature-mismatch'
  | 'invalid-authority-payload';

export type BaseReactFlowRenderAuthorityStatus =
  | 'accepted'
  | 'missing-commit'
  | 'input-signature-mismatch'
  | 'input-geometry-mismatch'
  | 'output-signature-mismatch'
  | 'edge-claim-mismatch';

type DisplayRoutingDebugWindow = Window & {
  __vizlyBaseReactFlowDisplayRouting?: DisplayRoutingDebugState;
};

const readDisplayRoutingDebugWindow = (): DisplayRoutingDebugWindow | null => {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return null;
  return window as DisplayRoutingDebugWindow;
};

export const updateDisplayRoutingDebugState = (patch: DisplayRoutingDebugState): void => {
  const debugWindow = readDisplayRoutingDebugWindow();
  if (!debugWindow) return;
  const nextState = {
    ...(debugWindow.__vizlyBaseReactFlowDisplayRouting || {}),
    ...patch,
    updatedAt: Date.now(),
  };
  if (!Object.prototype.hasOwnProperty.call(patch, 'error')) delete nextState.error;
  debugWindow.__vizlyBaseReactFlowDisplayRouting = nextState;
  try {
    document.documentElement.setAttribute(
      'data-vizly-display-routing',
      JSON.stringify(nextState),
    );
  } catch {
    // Debug-only mirror; rendering must not depend on it.
  }
};

export const updateDisplayRoutingLifecycleState = (
  stage: string,
  signature: string,
  nodeCount: number,
  edgeCount: number,
): void => updateDisplayRoutingDebugState({ stage, signature, nodeCount, edgeCount });

export const updateDisplayRoutingFinalAppliedState = (
  patch: DisplayRoutingDebugState,
): void => updateDisplayRoutingDebugState({
  boundedCandidate: undefined,
  boundedCandidateTrace: undefined,
  hardGateDiagnostics: undefined,
  terminalDiagnostics: undefined,
  ...patch,
  stage: 'final-applied',
});

export const resolveDisplayRoutingCommittedReuseTiming = ({
  current,
  signature,
  inputGeometryDigest,
  outputRouteSignature,
  now,
}: {
  current: DisplayRoutingDebugState | undefined;
  signature: string;
  inputGeometryDigest: string;
  outputRouteSignature?: string;
  now: number;
}): Pick<DisplayRoutingDebugState,
  | 'scheduledAt'
  | 'workerStartedAt'
  | 'workerResponseParsedAt'
  | 'finalAppliedAt'
  | 'routeMs'
  | 'totalRouteMs'
  | 'phaseTrace'
  | 'workerResolution'
  | 'hardGateDiagnostics'
> => {
  const sameCommittedRoute = current?.stage === 'final-applied'
    && current.signature === signature
    && current.inputGeometryDigest === inputGeometryDigest
    && current.outputRouteSignature === outputRouteSignature;
  if (sameCommittedRoute) {
    return {
      scheduledAt: current.scheduledAt,
      workerStartedAt: current.workerStartedAt,
      workerResponseParsedAt: current.workerResponseParsedAt,
      finalAppliedAt: current.finalAppliedAt,
      routeMs: current.routeMs,
      totalRouteMs: current.totalRouteMs,
      phaseTrace: current.phaseTrace,
      workerResolution: current.workerResolution,
      hardGateDiagnostics: current.hardGateDiagnostics,
    };
  }
  return {
    scheduledAt: undefined,
    workerStartedAt: undefined,
    workerResponseParsedAt: undefined,
    finalAppliedAt: now,
    routeMs: undefined,
    totalRouteMs: undefined,
    phaseTrace: undefined,
    workerResolution: undefined,
    hardGateDiagnostics: undefined,
  };
};

/**
 * Only an atomic staged-layout handoff may retain the Worker request evidence
 * that immediately preceded committed-snapshot reuse. Ordinary cache reuse
 * must clear it, otherwise a failed layout can make the previous canvas look
 * as though it committed the newer layout request.
 */
export const resolveDisplayRoutingCommittedReuseTransactionEvidence = (
  current: DisplayRoutingDebugState | undefined,
  trustedTransactionHandoff: boolean,
): Pick<DisplayRoutingDebugState, 'requestId' | 'lastPhaseTrace' | 'phaseProgressTrace'> => (
  trustedTransactionHandoff
    ? {
      requestId: current?.requestId,
      lastPhaseTrace: current?.lastPhaseTrace,
      phaseProgressTrace: current?.phaseProgressTrace,
    }
    : {
      requestId: undefined,
      lastPhaseTrace: undefined,
      phaseProgressTrace: undefined,
    }
);

export const readDisplayRoutingDebugState = (): DisplayRoutingDebugState | undefined => (
  readDisplayRoutingDebugWindow()?.__vizlyBaseReactFlowDisplayRouting
);

export const appendDisplayRoutingPhaseProgress = (
  trace: DisplayRoutingPhaseTrace,
): void => {
  const debugWindow = readDisplayRoutingDebugWindow();
  if (!debugWindow) return;
  const previous = debugWindow.__vizlyBaseReactFlowDisplayRouting?.phaseProgressTrace ?? [];
  updateDisplayRoutingDebugState({
    stage: 'worker-phase',
    lastPhaseTrace: trace,
    phaseProgressTrace: [...previous, trace].slice(-32),
  });
};

export const appendDisplayRoutingBoundedCandidate = (
  boundedCandidate: NonNullable<DisplayEdgesWorkerResponse['boundedCandidate']>,
  requestId: string,
): void => {
  const debugWindow = readDisplayRoutingDebugWindow();
  if (!debugWindow) return;
  const boundedCandidateTrace = [
    ...(debugWindow.__vizlyBaseReactFlowDisplayRouting?.boundedCandidateTrace ?? []),
    boundedCandidate,
  ].slice(-8);
  updateDisplayRoutingDebugState({
    stage: 'worker-bounded-fallback',
    requestId,
    boundedCandidate,
    boundedCandidateTrace,
  });
};
