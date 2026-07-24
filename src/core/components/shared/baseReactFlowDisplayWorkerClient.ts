import type { Edge, Node } from '@xyflow/react';
import type { MutableRefObject } from 'react';
import {
  parseDisplayEdgesWorkerResponse,
  readDisplayEdgesWorkerRequestId,
  type DisplayEdgesWorkerRequest,
  type DisplayEdgesWorkerResponse,
  type DisplayEdgesWorkerCandidateSource,
  type DisplayEdgesWorkerRouteResolution,
  type DisplayQualityMode,
} from './baseReactFlowDisplayWorkerProtocol';
import { sanitizeBaseReactFlowPrecompiledRoutePatches } from './baseReactFlowPrecompiledRouteArtifact';
import {
  createBaseReactFlowDisplayEdgePatches,
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowDisplayCachePatches,
} from './baseReactFlowDisplayRoutingTransaction';
import { createDisplayWorkerFinalQualityError } from './baseReactFlowDisplayWorkerFailure';
import { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';

export type { DisplayQualityMode } from './baseReactFlowDisplayWorkerProtocol';
export { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';
export {
  createBaseReactFlowDisplayEdgePatches,
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayRoutingTransactions,
  mergeTrustedBaseReactFlowDisplayCacheEntry,
  resolveBaseReactFlowDisplayCacheReplaySignature,
} from './baseReactFlowDisplayRoutingTransaction';

export type DeferredDisplayEdges = {
  signature: string;
  geometryDigest: string;
  displayPatches: Edge[];
  hardClean: boolean;
};
export type BaseReactFlowDisplayWorkerResult = {
  edges: Edge[];
  hardClean: boolean;
  routeResolution: DisplayEdgesWorkerRouteResolution;
  /** Exact DTO edge baseline that produced the worker response. */
  projectedEdges: Edge[];
};
type BaseReactFlowDisplayWorkerResponseResult = Omit<BaseReactFlowDisplayWorkerResult, 'projectedEdges'>;

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
type DisplayRoutingDebugState = {
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
  workerStartCount?: number;
  workerAbortCount?: number;
  error?: string;
  boundedCandidate?: DisplayEdgesWorkerResponse['boundedCandidate'];
  inputGeometryDigest?: string;
  outputRouteSignature?: string;
  routingVersion?: string;
  workerResolution?: DisplayEdgesWorkerRouteResolution;
  terminalDiagnostics?: unknown;
};

const DISPLAY_WORKER_TIMEOUT_MS = 60_000;
const INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS = 12_000;
const INTERACTIVE_DISPLAY_NODE_THRESHOLD = 30;
const INTERACTIVE_DISPLAY_EDGE_THRESHOLD = 24;
const DISPLAY_QUALITY_GEOMETRY_SETTLE_MS = 320;

type DisplayWorkerIdleListeners = {
  error: EventListener;
  messageerror: EventListener;
};

const displayWorkerIdleListeners = new WeakMap<Worker, DisplayWorkerIdleListeners>();

export const resolveBaseReactFlowDisplayQualityPolicy = ({
  nodeCount,
  edgeCount,
  isLargeGraph,
}: {
  nodeCount: number;
  edgeCount: number;
  isLargeGraph: boolean;
}): DisplayQualityPolicy => {
  if (
    nodeCount <= 0
    || edgeCount <= 0
  ) {
    return { mode: 'skip', timeoutMs: 0 };
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

export const updateDisplayRoutingDebugState = (patch: DisplayRoutingDebugState): void => {
  if (typeof window === 'undefined') return;
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return;
  const debugWindow = window as unknown as {
    __vizlyBaseReactFlowDisplayRouting?: DisplayRoutingDebugState;
  };
  const nextState = {
    ...(debugWindow.__vizlyBaseReactFlowDisplayRouting || {}),
    ...patch,
    updatedAt: Date.now(),
  };
  if (!Object.prototype.hasOwnProperty.call(patch, 'error')) {
    delete nextState.error;
  }
  debugWindow.__vizlyBaseReactFlowDisplayRouting = nextState;
  try {
    document.documentElement.setAttribute(
      'data-vizly-display-routing',
      JSON.stringify(debugWindow.__vizlyBaseReactFlowDisplayRouting),
    );
  } catch {
    // Debug-only mirror; rendering must not depend on it.
  }
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
}: {
  signature: string;
  geometryDigest: string;
  policyMode: DisplayQualityPolicy['mode'];
  deferred: DeferredDisplayEdges | null;
  cached: Edge[] | null;
  immediate: Edge[];
}): Edge[] => {
  if (
    deferred?.signature === signature
    && deferred.geometryDigest === geometryDigest
  ) {
    return mergeBaseReactFlowDisplayEdgePatches(immediate, deferred.displayPatches) ?? [];
  }
  if (cached) return cached;
  return policyMode === 'skip' || policyMode === 'interactive' ? immediate : [];
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

/** Releases both request-idle guards and the worker owned by a canvas hook. */
export const disposeBaseReactFlowDisplayWorker = (
  workerRef: MutableRefObject<Worker | null>,
): void => {
  const worker = workerRef.current;
  if (!worker) return;
  terminateBaseReactFlowDisplayWorker(worker, workerRef);
};

export const doesBaseReactFlowDisplayWorkerResolutionMatchOperation = (
  operation: DisplayEdgesWorkerRequest['operation'],
  routeResolution: DisplayEdgesWorkerRouteResolution,
): boolean => {
  if (operation === 'route') return routeResolution === 'full-route';
  if (operation === 'repair') return routeResolution === 'repair';
  return routeResolution === 'validated-candidate' || routeResolution === 'full-route';
};

const requestBaseReactFlowDisplayEdgesWorker = ({
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
      const response = parseDisplayEdgesWorkerResponse(event.data, request.requestId);
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
        updateDisplayRoutingDebugState({
          stage: 'worker-bounded-fallback',
          requestId: request.requestId,
          boundedCandidate: response.boundedCandidate,
        });
        return;
      }
      const responseEdges = Array.isArray(response.edges) ? response.edges : null;
      const routeResolution = response.routeResolution;
      if (responseEdges) {
        if (
          !routeResolution
          || !doesBaseReactFlowDisplayWorkerResolutionMatchOperation(
            request.operation,
            routeResolution,
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
        if (response.error || !responseEdges || !routeResolution) {
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
          hardClean: response.hardClean === true,
          routeResolution,
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

export const resolveBaseReactFlowDisplayWorkerTimeoutMs = (
  timeoutMs: number,
  qualityMode: DisplayQualityMode,
): number => {
  const maximumTimeoutMs = qualityMode === 'interactive'
    ? INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS
    : DISPLAY_WORKER_TIMEOUT_MS;
  const fallbackTimeoutMs = qualityMode === 'interactive'
    ? INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS
    : DISPLAY_WORKER_TIMEOUT_MS;
  const candidate = Number.isFinite(timeoutMs) ? Math.round(timeoutMs) : fallbackTimeoutMs;
  return Math.max(1_000, Math.min(candidate, maximumTimeoutMs));
};

export const computeBaseReactFlowDisplayEdgesInWorker = async ({
  workerRef,
  requestId,
  edges,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  displayEdgeEpoch,
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
  cachedCandidateEdges?: Edge[] | null;
  candidateSource?: DisplayEdgesWorkerCandidateSource;
  qualityMode?: DisplayQualityMode;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<BaseReactFlowDisplayWorkerResult> => {
  const projectedInput = projectBaseReactFlowDisplayWorkerInput({ edges, nodes });
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
  return { ...result, projectedEdges: projectedInput.edges };
};

export const repairBaseReactFlowDisplayEdgesInWorker = async ({
  workerRef,
  requestId,
  edges,
  nodes,
  timeoutMs = DISPLAY_WORKER_TIMEOUT_MS,
  signal,
}: {
  workerRef: MutableRefObject<Worker | null>;
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<BaseReactFlowDisplayWorkerResult> => {
  const projectedInput = projectBaseReactFlowDisplayWorkerInput({ edges, nodes });
  const result = await requestBaseReactFlowDisplayEdgesWorker({
    workerRef,
    request: {
      operation: 'repair',
      requestId,
      edges: projectedInput.edges,
      nodes: projectedInput.nodes,
    },
    qualityMode: 'full',
    timeoutMs,
    signal,
  });
  if (signal?.aborted) throw new Error('display-edge-worker-cancelled');
  if (result.hardClean !== true) {
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
