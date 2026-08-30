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
  layoutSeedStageAudits?: Partial<Record<
    'raw' | 'anchored' | 'detached-fallback' | 'axis-repaired' | 'geometry-normalized' | 'final',
    Readonly<{
      terminalsAttached: boolean;
      terminalsAnchored: boolean;
      obstacleHits: number;
      strictCrossings: number;
    }>
  >>;
  incrementalBaselineSignature?: string;
  incrementalPlanStatus?: 'ready' | 'missing-baseline' | 'rejected';
  renderAuthorityStatus?: BaseReactFlowRenderAuthorityStatus;
  renderAuthorityIssue?: BaseReactFlowRenderAuthorityIssue;
  layoutTransactionJobId?: number;
  layoutTransactionStatus?: DisplayLayoutTransactionStatus;
  layoutTransactionAttemptCount?: number;
  layoutTransactionErrorCode?: DisplayLayoutTransactionErrorCode;
  layoutPhaseTrace?: DisplayLayoutPhaseTrace[];
};

export type DisplayLayoutPhase =
  | 'command'
  | 'input-preparation'
  | 'layout-calculation'
  | 'dynamic-import'
  | 'worker-routing'
  | 'state-commit'
  | 'render-reconcile'
  | 'fit-request';

export type DisplayLayoutPhaseTrace = Readonly<{
  sequence: number;
  phase: DisplayLayoutPhase;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  durationMs?: number;
}>;

export type DisplayLayoutTransactionStatus = 'running' | 'committed' | 'failed';

export type DisplayLayoutTransactionErrorCode =
  | 'cancelled'
  | 'hard-quality-rejected'
  | 'no-layoutable-nodes'
  | 'strategy-failed';

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

export const updateDisplayLayoutTransactionState = ({
  jobId,
  status,
  attemptCount,
  errorCode,
}: Readonly<{
  jobId: number;
  status: DisplayLayoutTransactionStatus;
  attemptCount: number;
  errorCode?: DisplayLayoutTransactionErrorCode;
}>): void => updateDisplayRoutingDebugState({
  layoutTransactionJobId: jobId,
  layoutTransactionStatus: status,
  layoutTransactionAttemptCount: attemptCount,
  layoutTransactionErrorCode: errorCode,
});

export const classifyDisplayLayoutTransactionError = (
  error: unknown,
): DisplayLayoutTransactionErrorCode => {
  if (!(error instanceof Error)) return 'strategy-failed';
  if (error.message === 'layout-routing-cancelled') return 'cancelled';
  if (error.message === 'layout-routing-hard-quality-rejected') {
    return 'hard-quality-rejected';
  }
  return 'strategy-failed';
};

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
