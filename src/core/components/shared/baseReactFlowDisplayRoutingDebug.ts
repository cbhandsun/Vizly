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
};

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
    finalAppliedAt: now,
    routeMs: undefined,
    totalRouteMs: undefined,
    phaseTrace: undefined,
    workerResolution: undefined,
    hardGateDiagnostics: undefined,
  };
};

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
