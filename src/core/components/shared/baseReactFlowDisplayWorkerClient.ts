import type { Edge, Node } from '@xyflow/react';
import type { MutableRefObject } from 'react';
import type { RoutingPatch } from '../../routing/routingPatch';
import {
  parseDisplayEdgesWorkerCommitResponse,
  readDisplayEdgesWorkerRequestId,
  type DisplayEdgesWorkerResponse,
  type DisplayEdgesWorkerRequest,
  type DisplayEdgesWorkerCandidateSource,
  type DisplayEdgesWorkerRouteResolution,
  type DisplayRoutingFallbackLevel,
  type DisplayQualityMode,
} from './baseReactFlowDisplayWorkerProtocol';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import {
  createDisplayRoutingIdentity,
  type RoutingIdentity,
  type RoutingWorkerSessionRef,
} from './baseReactFlowDisplayRoutingSession';
import { rememberDisplayWorkerSession } from './baseReactFlowDisplayWorkerSessionClient';
import {
  appendDisplayRoutingBoundedCandidate,
  appendDisplayRoutingPhaseProgress,
  updateDisplayRoutingDebugState,
} from './baseReactFlowDisplayRoutingDebug';
import { sanitizeBaseReactFlowPrecompiledRoutePatches } from './baseReactFlowPrecompiledRouteArtifact';
import {
  createBaseReactFlowDisplayEdgePatches,
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowDisplayCachePatches,
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from './baseReactFlowDisplayRoutingTransaction';
import { createDisplayWorkerFinalQualityError } from './baseReactFlowDisplayWorkerFailure';
import { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';
import { computeBaseReactFlowDisplayInputIdentityBundle } from './baseReactFlowDisplayInputIdentity';
import { displayWorkerCommitReceiptMatchesRequest } from './baseReactFlowDisplayWorkerCommitBoundary';
import {
  DISPLAY_WORKER_TIMEOUT_MS,
  INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS,
  PRECOMPILED_CAPTURE_WORKER_TIMEOUT_MS,
  resolveBaseReactFlowDisplayWorkerTimeoutMs,
} from './baseReactFlowDisplayWorkerTimeout';
import {
  doesBaseReactFlowDisplayWorkerResolutionMatchOperation,
  runBaseReactFlowLayoutRepairAndRouteInWorker,
  type BaseReactFlowLayoutRepairWorkerOptions,
} from './baseReactFlowDisplayWorkerLayoutClient';

export { doesBaseReactFlowDisplayWorkerResolutionMatchOperation } from './baseReactFlowDisplayWorkerLayoutClient';

export type { DisplayQualityMode } from './baseReactFlowDisplayWorkerProtocol';
export { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';
export { resolveBaseReactFlowDisplayWorkerTimeoutMs } from './baseReactFlowDisplayWorkerTimeout';
export {
  createBaseReactFlowDisplayEdgePatches,
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayRoutingTransactions,
  mergeTrustedBaseReactFlowDisplayCacheEntry,
  resolveBaseReactFlowDisplayCacheReplaySignature,
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from './baseReactFlowDisplayRoutingTransaction';

export type DeferredDisplayEdges = {
  signature: string;
  geometryDigest: string;
  displayPatches: RoutingPatch[];
  hardClean: boolean;
};
export type BaseReactFlowDisplayWorkerResult = {
  edges: Edge[];
  /** Sanitized routing-only transaction produced at the Worker trust boundary. */
  routingPatches: RoutingPatch[];
  hardClean: boolean;
  hardReport?: DisplayEdgesWorkerResponse['hardReport'];
  routeResolution: DisplayEdgesWorkerRouteResolution;
  /** Exact DTO edge baseline that produced the worker response. */
  projectedEdges: Edge[];
  phaseTrace: DisplayRoutingPhaseTrace[];
  affectedEdgeCount?: number;
  fallbackLevel?: DisplayRoutingFallbackLevel;
  nextIdentity?: RoutingIdentity;
  outputRouteSignature?: string;
  sessionRef?: RoutingWorkerSessionRef;
  commitReceipt?: DisplayEdgesWorkerResponse['commitReceipt'];
  /** Aggregate timestamp after protocol validation and routing-only sanitization. */
  workerResponseParsedAt?: number;
};
export type BaseReactFlowDisplayWorkerResponseResult = Omit<
  BaseReactFlowDisplayWorkerResult,
  'projectedEdges'
>;

export type DisplayRoutingInput = {
  cacheSignature: string;
  inputGeometryDigest: string;
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
};

export type DisplayQualityPolicy = {
  mode: DisplayQualityMode | 'skip';
  timeoutMs: number;
};

type DisplayQualityCancel = () => void;

const INTERACTIVE_DISPLAY_NODE_THRESHOLD = 30;
const INTERACTIVE_DISPLAY_EDGE_THRESHOLD = 24;
const DISPLAY_QUALITY_GEOMETRY_SETTLE_MS = 320;

type DisplayWorkerIdleListeners = {
  error: EventListener;
  messageerror: EventListener;
};

const displayWorkerIdleListeners = new WeakMap<Worker, DisplayWorkerIdleListeners>();
const eagerDisplayWorkerRef: MutableRefObject<Worker | null> = { current: null };

export const resolveBaseReactFlowDisplayQualityPolicy = ({
  nodeCount,
  edgeCount,
  isLargeGraph,
  forceFullQuality = false,
}: {
  nodeCount: number;
  edgeCount: number;
  isLargeGraph: boolean;
  forceFullQuality?: boolean;
}): DisplayQualityPolicy => {
  if (
    nodeCount <= 0
    || edgeCount <= 0
  ) {
    return { mode: 'skip', timeoutMs: 0 };
  }
  if (forceFullQuality) {
    return {
      mode: 'full',
      timeoutMs: PRECOMPILED_CAPTURE_WORKER_TIMEOUT_MS,
    };
  }
  if (
    isLargeGraph
    || nodeCount > INTERACTIVE_DISPLAY_NODE_THRESHOLD
    || edgeCount > INTERACTIVE_DISPLAY_EDGE_THRESHOLD
  ) {
    return {
      mode: 'interactive',
      timeoutMs: INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS,
    };
  }
  return {
    mode: 'full',
    timeoutMs: DISPLAY_WORKER_TIMEOUT_MS,
  };
};

export const scheduleBaseReactFlowDisplayQuality = (
  run: () => void,
  delayMs = DISPLAY_QUALITY_GEOMETRY_SETTLE_MS,
): DisplayQualityCancel => {
  if (typeof window === 'undefined') return () => {};
  const safeDelayMs = Number.isFinite(delayMs)
    ? Math.max(0, Math.min(1_000, Math.round(delayMs)))
    : DISPLAY_QUALITY_GEOMETRY_SETTLE_MS;
  const timeoutId = window.setTimeout(run, safeDelayMs);

  return () => {
    window.clearTimeout(timeoutId);
  };
};

export const scheduleBaseReactFlowDisplayCacheWrite = (
  run: () => void,
  timeoutMs = 750,
): DisplayQualityCancel => {
  if (typeof window === 'undefined') return () => {};
  const safeTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(0, Math.min(5_000, Math.round(timeoutMs)))
    : 750;
  const idleWindow = window as typeof window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(run, { timeout: safeTimeoutMs });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const timeoutId = window.setTimeout(run, 0);
  return () => window.clearTimeout(timeoutId);
};

export const resolveBaseReactFlowDisplayedEdges = ({
  signature,
  geometryDigest,
  policyMode,
  deferred,
  cached,
  immediate,
  source,
}: {
  signature: string;
  geometryDigest: string;
  policyMode: DisplayQualityPolicy['mode'];
  deferred: DeferredDisplayEdges | null;
  cached: Edge[] | null;
  source?: Edge[];
  immediate: Edge[];
}): Edge[] => {
  const patchSource = source ?? immediate;
  if (
    deferred?.signature === signature
    && deferred.geometryDigest === geometryDigest
  ) {
    return mergeBaseReactFlowDisplayEdgePatches(patchSource, deferred.displayPatches) ?? [];
  }
  if (cached) return cached;
  // A full-quality route is an enhancement, not a prerequisite for rendering.
  // Keeping endpoint-driven fallback edges visible prevents a blank graph while
  // geometry is measured, after layout changes, and when the worker rejects.
  void policyMode;
  return immediate;
};

const detachBaseReactFlowDisplayWorkerIdleListeners = (worker: Worker): void => {
  const listeners = displayWorkerIdleListeners.get(worker);
  if (!listeners) return;
  worker.removeEventListener('error', listeners.error);
  worker.removeEventListener('messageerror', listeners.messageerror);
  displayWorkerIdleListeners.delete(worker);
};

const terminateBaseReactFlowDisplayWorker = (
  worker: Worker,
  workerRef: MutableRefObject<Worker | null>,
): void => {
  detachBaseReactFlowDisplayWorkerIdleListeners(worker);
  worker.terminate();
  if (workerRef.current === worker) workerRef.current = null;
};

/**
 * A prewarmed/reusable worker has no request listeners yet. Keep a small idle
 * health guard so module-load, CSP, or structured-clone failures cannot leave
 * a dead worker in the ref until the next request times out.
 */
const armBaseReactFlowDisplayWorkerIdleListeners = (
  worker: Worker,
  workerRef: MutableRefObject<Worker | null>,
): void => {
  detachBaseReactFlowDisplayWorkerIdleListeners(worker);
  const retireWorker = () => terminateBaseReactFlowDisplayWorker(worker, workerRef);
  const listeners: DisplayWorkerIdleListeners = {
    error: retireWorker,
    messageerror: retireWorker,
  };
  displayWorkerIdleListeners.set(worker, listeners);
  worker.addEventListener('error', listeners.error);
  worker.addEventListener('messageerror', listeners.messageerror);
};

const ensureBaseReactFlowDisplayWorker = (
  workerRef: MutableRefObject<Worker | null>,
): Worker | null => {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (workerRef.current) return workerRef.current;
  if (workerRef !== eagerDisplayWorkerRef && eagerDisplayWorkerRef.current) {
    const eagerWorker = eagerDisplayWorkerRef.current;
    detachBaseReactFlowDisplayWorkerIdleListeners(eagerWorker);
    eagerDisplayWorkerRef.current = null;
    workerRef.current = eagerWorker;
    armBaseReactFlowDisplayWorkerIdleListeners(eagerWorker, workerRef);
    return eagerWorker;
  }
  try {
    const worker = new Worker(new URL('./baseReactFlowDisplayEdges.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    armBaseReactFlowDisplayWorkerIdleListeners(worker, workerRef);
    return worker;
  } catch {
    workerRef.current = null;
    return null;
  }
};

/**
 * Starts fetching and compiling the display worker as soon as the canvas mounts.
 * The expensive routing request is still posted only after geometry settles, so
 * users see one final result while worker startup overlaps node measurement.
 */
export const prewarmBaseReactFlowDisplayWorker = (
  workerRef: MutableRefObject<Worker | null>,
): boolean => ensureBaseReactFlowDisplayWorker(workerRef) !== null;

// This module is loaded with the flowchart route, before the canvas effects run.
// Starting the module worker here overlaps its fetch/compile cost with React and
// node measurement; the first mounted canvas adopts the same worker instance.
// Other canvases still receive independently owned workers through the normal
// ensure path, so request listeners and disposal remain single-owner.
if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
  ensureBaseReactFlowDisplayWorker(eagerDisplayWorkerRef);
}

/** Releases both request-idle guards and the worker owned by a canvas hook. */
export const disposeBaseReactFlowDisplayWorker = (
  workerRef: MutableRefObject<Worker | null>,
): void => {
  const worker = workerRef.current;
  if (!worker) return;
  terminateBaseReactFlowDisplayWorker(worker, workerRef);
};

export const requestBaseReactFlowDisplayEdgesWorker = ({
  workerRef,
  request,
  qualityMode = 'full',
  timeoutMs = DISPLAY_WORKER_TIMEOUT_MS,
  signal,
}: {
  workerRef: MutableRefObject<Worker | null>;
  request: DisplayEdgesWorkerRequest;
  qualityMode?: DisplayQualityMode;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<BaseReactFlowDisplayWorkerResponseResult> => (
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('display-edge-worker-cancelled'));
      return;
    }
    const worker = ensureBaseReactFlowDisplayWorker(workerRef);
    if (!worker || typeof window === 'undefined') {
      reject(new Error('display-edge-worker-unavailable'));
      return;
    }
    // The idle guard owns error events only between requests. Detach it before
    // installing request-scoped listeners so one error cannot race two owners.
    detachBaseReactFlowDisplayWorkerIdleListeners(worker);

    let settled = false;
    const terminateWorker = () => {
      terminateBaseReactFlowDisplayWorker(worker, workerRef);
    };
    const finish = (callback: () => void, terminate = false) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.removeEventListener('messageerror', handleMessageError);
      signal?.removeEventListener('abort', handleAbort);
      if (terminate) terminateWorker();
      else armBaseReactFlowDisplayWorkerIdleListeners(worker, workerRef);
      callback();
    };
    const handleMessage = (event: MessageEvent<unknown>) => {
      const responseRequestId = readDisplayEdgesWorkerRequestId(event.data);
      if (responseRequestId !== request.requestId) return;
      const response = parseDisplayEdgesWorkerCommitResponse(event.data, request.requestId);
      if (!response) {
        finish(() => {
          updateDisplayRoutingDebugState({
            stage: 'worker-response-error',
            requestId: request.requestId,
            error: 'display-edge-worker-invalid-response',
          });
          reject(new Error('display-edge-worker-invalid-response'));
        }, true);
        return;
      }
      if (response.boundedCandidate && !response.edges && !response.error) {
        appendDisplayRoutingBoundedCandidate(
          response.boundedCandidate,
          request.requestId,
        );
        return;
      }
      if (response.phaseProgress && !response.edges && !response.error) {
        appendDisplayRoutingPhaseProgress(response.phaseProgress);
        return;
      }
      const rawRoutingPatches = response.routingPatches
        ?? (Array.isArray(response.edges)
          ? createBaseReactFlowDisplayEdgePatches(request.edges, response.edges)
          : null);
      const safeRoutingPatches = rawRoutingPatches
        ? sanitizeBaseReactFlowTrustedDisplayPatches(request.edges, rawRoutingPatches)
        : null;
      const responseEdges = safeRoutingPatches
        ? mergeBaseReactFlowDisplayEdgePatches(request.edges, safeRoutingPatches)
        : null;
      const routeResolution = response.routeResolution;
      if (responseEdges) {
        if (!displayWorkerCommitReceiptMatchesRequest({ request, response, responseEdges })) {
          finish(() => reject(new Error('display-edge-worker-commit-receipt-mismatch')), true);
          return;
        }
        if (
          !routeResolution
          || !doesBaseReactFlowDisplayWorkerResolutionMatchOperation(
            request.operation,
            routeResolution,
          )
          || (
            request.operation === 'incremental-route'
              ? (
                typeof response.affectedEdgeCount !== 'number'
                || (
                  routeResolution === 'incremental-route'
                    ? response.fallbackLevel !== 'none'
                    : response.fallbackLevel !== 'full'
                )
              )
              : (
                typeof response.affectedEdgeCount !== 'undefined'
                || typeof response.fallbackLevel !== 'undefined'
              )
          )
        ) {
          finish(() => {
            updateDisplayRoutingDebugState({
              stage: 'worker-response-error',
              requestId: request.requestId,
              error: 'display-edge-worker-resolution-mismatch',
            });
            reject(new Error('display-edge-worker-resolution-mismatch'));
          }, true);
          return;
        }
        const submittedCandidateEdges = request.operation === 'validate-or-route'
          ? (request.candidateEdges
            ?? (request.candidatePatches
              ? mergeBaseReactFlowDisplayEdgePatches(request.edges, request.candidatePatches)
              : null))
          : null;
        if (
          routeResolution === 'validated-candidate'
          && (
            request.operation !== 'validate-or-route'
            || !submittedCandidateEdges
            || !doBaseReactFlowDisplayRoutesMatchExactly(
              submittedCandidateEdges,
              responseEdges,
            )
          )
        ) {
          finish(() => {
            updateDisplayRoutingDebugState({
              stage: 'worker-response-error',
              requestId: request.requestId,
              error: 'display-edge-worker-candidate-mismatch',
            });
            reject(new Error('display-edge-worker-candidate-mismatch'));
          }, true);
          return;
        }
      }
      finish(() => {
        if (response.error || !safeRoutingPatches || !responseEdges || !routeResolution) {
          updateDisplayRoutingDebugState({
            stage: 'worker-response-error',
            requestId: request.requestId,
            error: response.error || 'display-edge-worker-empty-response',
          });
          reject(new Error(response.error || 'display-edge-worker-empty-response'));
          return;
        }
        updateDisplayRoutingDebugState({
          stage: 'worker-response',
          requestId: request.requestId,
          edgeCount: responseEdges.length,
        });
        resolve({
          edges: responseEdges,
          routingPatches: safeRoutingPatches,
          hardClean: response.hardClean === true,
          hardReport: response.hardReport,
          routeResolution,
          phaseTrace: response.phaseTrace ?? [],
          affectedEdgeCount: response.affectedEdgeCount,
          fallbackLevel: response.fallbackLevel,
          nextIdentity: response.nextIdentity,
          outputRouteSignature: response.outputRouteSignature,
          sessionRef: response.sessionRef,
          commitReceipt: response.commitReceipt,
          workerResponseParsedAt: Date.now(),
        });
      });
    };
    const handleError = () => {
      finish(() => {
        updateDisplayRoutingDebugState({ stage: 'worker-error', requestId: request.requestId, error: 'display-edge-worker-error' });
        reject(new Error('display-edge-worker-error'));
      }, true);
    };
    const handleMessageError = () => {
      finish(() => {
        updateDisplayRoutingDebugState({ stage: 'worker-message-error', requestId: request.requestId, error: 'display-edge-worker-message-error' });
        reject(new Error('display-edge-worker-message-error'));
      }, true);
    };
    const handleAbort = () => {
      finish(() => {
        updateDisplayRoutingDebugState({
          stage: 'worker-cancelled',
          requestId: request.requestId,
          error: 'display-edge-worker-cancelled',
        });
        reject(new Error('display-edge-worker-cancelled'));
      }, true);
    };
    const safeTimeoutMs = resolveBaseReactFlowDisplayWorkerTimeoutMs(timeoutMs, qualityMode);
    const timeoutId = window.setTimeout(() => {
      finish(() => {
        updateDisplayRoutingDebugState({ stage: 'worker-timeout', requestId: request.requestId, error: 'display-edge-worker-timeout' });
        reject(new Error('display-edge-worker-timeout'));
      }, true);
    }, safeTimeoutMs);

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.addEventListener('messageerror', handleMessageError);
    signal?.addEventListener('abort', handleAbort, { once: true });
    try {
      updateDisplayRoutingDebugState({ stage: 'worker-post', requestId: request.requestId });
      worker.postMessage(request);
    } catch {
      finish(() => reject(new Error('display-edge-worker-post-failed')), true);
    }
  })
);

export const computeBaseReactFlowDisplayEdgesInWorker = async ({
  workerRef,
  requestId,
  edges,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  displayEdgeEpoch,
  inputSignature,
  inputGeometryDigest,
  cachedCandidateEdges = null,
  candidateSource,
  qualityMode = 'full',
  timeoutMs = DISPLAY_WORKER_TIMEOUT_MS,
  signal,
}: {
  workerRef: MutableRefObject<Worker | null>;
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  inputSignature?: string;
  inputGeometryDigest?: string;
  cachedCandidateEdges?: Edge[] | null;
  candidateSource?: DisplayEdgesWorkerCandidateSource;
  qualityMode?: DisplayQualityMode;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<BaseReactFlowDisplayWorkerResult> => {
  const projectedInput = projectBaseReactFlowDisplayWorkerInput({ edges, nodes });
  const computedIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
    nodes: projectedInput.nodes,
    edges: projectedInput.edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });
  const inputIdentity = createDisplayRoutingIdentity(
    inputSignature ?? computedIdentity.cacheSignature,
    inputGeometryDigest ?? computedIdentity.geometryDigest,
  );
  const rawPrecompiledPatches = cachedCandidateEdges && candidateSource === 'precompiled'
    ? createBaseReactFlowDisplayEdgePatches(edges, cachedCandidateEdges)
    : null;
  const safeCandidatePatches = cachedCandidateEdges
    ? (candidateSource === 'precompiled'
      ? sanitizeBaseReactFlowPrecompiledRoutePatches(edges, rawPrecompiledPatches)
      : sanitizeBaseReactFlowDisplayCachePatches(edges, cachedCandidateEdges))
    : null;
  const routeRequest = {
    requestId,
    edges: projectedInput.edges,
    nodes: projectedInput.nodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    displayEdgeEpoch,
    qualityMode,
    inputIdentity,
  };
  const result = await requestBaseReactFlowDisplayEdgesWorker({
    workerRef,
    request: safeCandidatePatches
      ? {
        ...routeRequest,
        operation: 'validate-or-route',
        candidatePatches: safeCandidatePatches,
        candidateSource: candidateSource === 'precompiled' ? 'precompiled' : 'persistent',
      }
      : { ...routeRequest, operation: 'route' },
    qualityMode,
    timeoutMs,
    signal,
  });
  rememberDisplayWorkerSession(workerRef.current, result.sessionRef);
  return { ...result, projectedEdges: projectedInput.edges };
};

export const computeBaseReactFlowLayoutRepairAndRouteInWorker = (
  options: BaseReactFlowLayoutRepairWorkerOptions,
): Promise<BaseReactFlowDisplayWorkerResult> => (
  runBaseReactFlowLayoutRepairAndRouteInWorker(
    options,
    requestBaseReactFlowDisplayEdgesWorker,
  )
);

export const repairBaseReactFlowDisplayEdgesInWorker = async ({
  workerRef,
  requestId,
  edges,
  nodes,
  timeoutMs = DISPLAY_WORKER_TIMEOUT_MS,
  signal,
  requireHardClean = true,
  repairMode = 'finalized',
  stopAfterObstacleFailure = false,
  inputSignature,
  inputGeometryDigest,
}: {
  workerRef: MutableRefObject<Worker | null>;
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  timeoutMs?: number;
  signal?: AbortSignal;
  requireHardClean?: boolean;
  repairMode?: 'bounded' | 'finalized';
  stopAfterObstacleFailure?: boolean;
  inputSignature: string;
  inputGeometryDigest: string;
}): Promise<BaseReactFlowDisplayWorkerResult> => {
  const projectedInput = projectBaseReactFlowDisplayWorkerInput({ edges, nodes });
  const result = await requestBaseReactFlowDisplayEdgesWorker({
    workerRef,
    request: {
      operation: 'repair',
      requestId,
      edges: projectedInput.edges,
      nodes: projectedInput.nodes,
      inputIdentity: createDisplayRoutingIdentity(inputSignature, inputGeometryDigest),
      repairMode,
      stopAfterObstacleFailure,
    },
    qualityMode: 'full',
    timeoutMs,
    signal,
  });
  if (signal?.aborted) throw new Error('display-edge-worker-cancelled');
  if (requireHardClean && result.hardClean !== true) {
    throw createDisplayWorkerFinalQualityError(
      result.edges,
      projectedInput.nodes,
    );
  }
  return { ...result, projectedEdges: projectedInput.edges };
};

export const doDisplayEdgesMatchSourceGraph = (sourceEdges: Edge[], displayEdges: Edge[]): boolean => (
  sourceEdges.length === displayEdges.length
  && sourceEdges.every((edge, index) => {
    const displayEdge = displayEdges[index];
    return displayEdge?.id === edge.id
      && displayEdge.source === edge.source
      && displayEdge.target === edge.target;
  })
);
