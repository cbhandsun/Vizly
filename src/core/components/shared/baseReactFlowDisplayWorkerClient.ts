import type { Edge, Node } from '@xyflow/react';
import type { MutableRefObject } from 'react';
import {
  baseReactFlowDisplayOutputRouteSignatureMatches,
  type BaseReactFlowDisplayEdgesCacheEntry,
} from './baseReactFlowDisplayCache';

export type DeferredDisplayEdges = {
  signature: string;
  edges: Edge[];
  hardClean: boolean;
};

export type BaseReactFlowDisplayWorkerResult = {
  edges: Edge[];
  hardClean: boolean;
};

export type DisplayRoutingInput = {
  cacheSignature: string;
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
};

export type DisplayQualityMode = 'full' | 'interactive';

export type DisplayQualityPolicy = {
  mode: DisplayQualityMode | 'skip';
  timeoutMs: number;
};

type DisplayQualityCancel = () => void;
type DisplayWorkerResponse = {
  requestId: string;
  edges?: Edge[];
  hardClean?: boolean;
  error?: string;
  boundedCandidate?: {
    candidate: 'terminal-lane' | 'polished';
    hardClean: boolean;
    obstacleHits: number;
    quality: Record<string, number>;
    unrelatedOverlapPairs?: Array<{
      firstId: string;
      secondId: string;
      overlap: number;
    }>;
  };
};

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
  boundedCandidate?: DisplayWorkerResponse['boundedCandidate'];
};

const DISPLAY_WORKER_TIMEOUT_MS = 60_000;
const COMPLEX_DISPLAY_WORKER_TIMEOUT_MS = 300_000;
const INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS = 12_000;
const DISPLAY_WORKER_VALUE_DEPTH = 8;
const DISPLAY_WORKER_MAX_ARRAY_ITEMS = 2_000;
const DISPLAY_WORKER_MAX_OBJECT_KEYS = 120;
const LARGE_DISPLAY_NODE_THRESHOLD = 36;
const LARGE_DISPLAY_EDGE_THRESHOLD = 36;
const INTERACTIVE_DISPLAY_NODE_THRESHOLD = 30;
const INTERACTIVE_DISPLAY_EDGE_THRESHOLD = 24;
const DISPLAY_QUALITY_GEOMETRY_SETTLE_MS = 320;

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
  if (isLargeGraph) {
    return {
      mode: 'interactive',
      timeoutMs: INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS,
    };
  }
  if (
    nodeCount > LARGE_DISPLAY_NODE_THRESHOLD
    || edgeCount > LARGE_DISPLAY_EDGE_THRESHOLD
    || nodeCount > INTERACTIVE_DISPLAY_NODE_THRESHOLD
    || edgeCount > INTERACTIVE_DISPLAY_EDGE_THRESHOLD
  ) {
    return {
      mode: 'full',
      timeoutMs: COMPLEX_DISPLAY_WORKER_TIMEOUT_MS,
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
  policyMode,
  deferred,
  cached,
  immediate,
}: {
  signature: string;
  policyMode: DisplayQualityPolicy['mode'];
  deferred: DeferredDisplayEdges | null;
  cached: Edge[] | null;
  immediate: Edge[];
}): Edge[] => {
  if (deferred?.signature === signature) return deferred.edges;
  if (cached) return cached;
  return policyMode === 'skip' ? immediate : [];
};

const finiteNumberOrUndefined = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const projectDisplayWorkerValue = (value: unknown, depth = 0): unknown => {
  if (value == null) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.length <= 20_000 ? value : value.slice(0, 20_000);
  if (Array.isArray(value)) {
    if (depth >= DISPLAY_WORKER_VALUE_DEPTH || value.length > DISPLAY_WORKER_MAX_ARRAY_ITEMS) return undefined;
    const next: unknown[] = [];
    for (const item of value) {
      const projected = projectDisplayWorkerValue(item, depth + 1);
      if (typeof projected !== 'undefined') next.push(projected);
    }
    return next;
  }
  if (typeof value !== 'object' || depth >= DISPLAY_WORKER_VALUE_DEPTH) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > DISPLAY_WORKER_MAX_OBJECT_KEYS) return undefined;
  const next: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    const projected = projectDisplayWorkerValue(item, depth + 1);
    if (typeof projected !== 'undefined') next[key] = projected;
  }
  return next;
};

const projectDisplayWorkerPosition = (value: unknown, fallback = { x: 0, y: 0 }) => {
  const point = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
  return {
    x: finiteNumberOrUndefined(point.x) ?? fallback.x,
    y: finiteNumberOrUndefined(point.y) ?? fallback.y,
  };
};

const projectDisplayWorkerNodes = (nodes: Node[]): Node[] => (
  nodes.map((node) => {
    const measured = (node as any).measured;
    const style = (node.style && typeof node.style === 'object')
      ? node.style as Record<string, unknown>
      : {};
    const data = (node.data && typeof node.data === 'object')
      ? node.data as Record<string, unknown>
      : {};
    const projectedStyle = {
      width: projectDisplayWorkerValue(style.width),
      height: projectDisplayWorkerValue(style.height),
    };
    const projected: Record<string, unknown> = {
      id: node.id,
      type: node.type,
      parentId: (node as any).parentId,
      position: projectDisplayWorkerPosition(node.position),
      positionAbsolute: (node as any).positionAbsolute
        ? projectDisplayWorkerPosition((node as any).positionAbsolute)
        : undefined,
      width: finiteNumberOrUndefined(node.width),
      height: finiteNumberOrUndefined(node.height),
      measured: measured && typeof measured === 'object'
        ? {
          width: finiteNumberOrUndefined(measured.width),
          height: finiteNumberOrUndefined(measured.height),
        }
        : undefined,
      style: Object.values(projectedStyle).some(value => typeof value !== 'undefined')
        ? projectedStyle
        : undefined,
      data: typeof data.layoutDirection === 'undefined'
        ? {}
        : { layoutDirection: projectDisplayWorkerValue(data.layoutDirection) },
    };
    return projected as Node;
  })
);

const projectDisplayWorkerEdges = (edges: Edge[]): Edge[] => (
  edges.map((edge) => {
    const projected: Record<string, unknown> = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type,
      label: (edge as any).label,
      animated: (edge as any).animated,
      style: projectDisplayWorkerValue((edge as any).style),
      markerStart: projectDisplayWorkerValue((edge as any).markerStart),
      markerEnd: projectDisplayWorkerValue((edge as any).markerEnd),
      data: projectDisplayWorkerValue(edge.data) ?? {},
    };
    return projected as Edge;
  })
);

export const projectBaseReactFlowDisplayWorkerInput = ({
  edges,
  nodes,
}: Pick<DisplayRoutingInput, 'edges' | 'nodes'>): Pick<DisplayRoutingInput, 'edges' | 'nodes'> => ({
  edges: projectDisplayWorkerEdges(edges),
  nodes: projectDisplayWorkerNodes(nodes),
});

const ROUTING_PATCH_NO_CHANGE = Symbol('routing-patch-no-change');

const isRoutingPatchObject = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const isRoutingPatchKeySafe = (key: string): boolean => (
  key !== '__proto__' && key !== 'prototype' && key !== 'constructor'
);

const buildRoutingValuePatch = (baseline: unknown, routed: unknown): unknown | typeof ROUTING_PATCH_NO_CHANGE => {
  if (Object.is(baseline, routed)) return ROUTING_PATCH_NO_CHANGE;
  if (Array.isArray(routed)) {
    if (Array.isArray(baseline) && baseline.length === routed.length) {
      const unchanged = routed.every((item, index) => (
        buildRoutingValuePatch(baseline[index], item) === ROUTING_PATCH_NO_CHANGE
      ));
      if (unchanged) return ROUTING_PATCH_NO_CHANGE;
    }
    return routed;
  }
  if (isRoutingPatchObject(routed)) {
    const baselineObject = isRoutingPatchObject(baseline) ? baseline : {};
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(routed)) {
      if (!isRoutingPatchKeySafe(key)) continue;
      const childPatch = buildRoutingValuePatch(baselineObject[key], value);
      if (childPatch !== ROUTING_PATCH_NO_CHANGE) patch[key] = childPatch;
    }
    return Object.keys(patch).length > 0 ? patch : ROUTING_PATCH_NO_CHANGE;
  }
  return routed;
};

const applyRoutingValuePatch = (baseline: unknown, patch: unknown): unknown => {
  if (Array.isArray(patch)) return patch;
  if (!isRoutingPatchObject(patch)) return patch;
  const baselineObject = isRoutingPatchObject(baseline) ? baseline : {};
  const merged: Record<string, unknown> = { ...baselineObject };
  for (const [key, value] of Object.entries(patch)) {
    if (!isRoutingPatchKeySafe(key)) continue;
    merged[key] = applyRoutingValuePatch(baselineObject[key], value);
  }
  return merged;
};

export const createBaseReactFlowDisplayEdgePatches = (
  sourceEdges: Edge[],
  routedEdges: Edge[],
): Edge[] | null => {
  if (sourceEdges.length !== routedEdges.length) return null;
  const patches: Edge[] = [];
  for (let index = 0; index < routedEdges.length; index += 1) {
    const routedEdge = routedEdges[index];
    const sourceEdge = sourceEdges[index];
    if (
      routedEdge?.id !== sourceEdge?.id
      || routedEdge.source !== sourceEdge.source
      || routedEdge.target !== sourceEdge.target
    ) {
      return null;
    }
    const valuePatch = buildRoutingValuePatch(sourceEdge, routedEdge);
    const patch = valuePatch === ROUTING_PATCH_NO_CHANGE || !isRoutingPatchObject(valuePatch)
      ? {}
      : valuePatch;
    patches.push({
      id: routedEdge.id,
      source: routedEdge.source,
      target: routedEdge.target,
      ...patch,
    } as Edge);
  }
  return patches;
};

export const mergeBaseReactFlowDisplayEdgePatches = (
  sourceEdges: Edge[],
  patches: Edge[],
): Edge[] | null => {
  if (sourceEdges.length !== patches.length) return null;
  const merged: Edge[] = [];
  for (let index = 0; index < sourceEdges.length; index += 1) {
    const sourceEdge = sourceEdges[index];
    const patch = patches[index];
    if (
      patch?.id !== sourceEdge?.id
      || patch.source !== sourceEdge.source
      || patch.target !== sourceEdge.target
    ) {
      return null;
    }
    merged.push(applyRoutingValuePatch(sourceEdge, patch) as Edge);
  }
  return merged;
};

/**
 * Applies cache patches to the newest source edges while reusing hardClean only
 * when the merged path/handle geometry exactly matches the report-bound signature.
 */
export const mergeTrustedBaseReactFlowDisplayCacheEntry = (
  sourceEdges: Edge[],
  cacheEntry: BaseReactFlowDisplayEdgesCacheEntry,
): Edge[] | null => {
  if (cacheEntry.hardClean !== true) return null;
  const merged = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, cacheEntry.edges);
  if (!merged) return null;
  return baseReactFlowDisplayOutputRouteSignatureMatches(
    merged,
    cacheEntry.outputRouteSignature,
  ) ? merged : null;
};

const ensureBaseReactFlowDisplayWorker = (
  workerRef: MutableRefObject<Worker | null>,
): Worker | null => {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (workerRef.current) return workerRef.current;
  workerRef.current = new Worker(new URL('./baseReactFlowDisplayEdges.worker.ts', import.meta.url), {
    type: 'module',
  });
  return workerRef.current;
};

/**
 * Starts fetching and compiling the display worker as soon as the canvas mounts.
 * The expensive routing request is still posted only after geometry settles, so
 * users see one final result while worker startup overlaps node measurement.
 */
export const prewarmBaseReactFlowDisplayWorker = (
  workerRef: MutableRefObject<Worker | null>,
): boolean => ensureBaseReactFlowDisplayWorker(workerRef) !== null;

export const computeBaseReactFlowDisplayEdgesInWorker = ({
  workerRef,
  requestId,
  edges,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  displayEdgeEpoch,
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
  qualityMode?: DisplayQualityMode;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<BaseReactFlowDisplayWorkerResult> => (
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

    let settled = false;
    const terminateWorker = () => {
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
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
      callback();
    };
    const handleMessage = (event: MessageEvent<DisplayWorkerResponse>) => {
      const response = event.data;
      if (!response || response.requestId !== requestId) return;
      if (response.boundedCandidate && !response.edges && !response.error) {
        updateDisplayRoutingDebugState({
          stage: 'worker-bounded-fallback',
          requestId,
          boundedCandidate: response.boundedCandidate,
        });
        return;
      }
      finish(() => {
        if (response.error || !Array.isArray(response.edges)) {
          updateDisplayRoutingDebugState({
            stage: 'worker-response-error',
            requestId,
            error: response.error || 'display-edge-worker-empty-response',
          });
          reject(new Error(response.error || 'display-edge-worker-empty-response'));
          return;
        }
        updateDisplayRoutingDebugState({
          stage: 'worker-response',
          requestId,
          edgeCount: response.edges.length,
        });
        resolve({
          edges: response.edges,
          hardClean: response.hardClean === true,
        });
      });
    };
    const handleError = () => {
      finish(() => {
        updateDisplayRoutingDebugState({ stage: 'worker-error', requestId, error: 'display-edge-worker-error' });
        reject(new Error('display-edge-worker-error'));
      });
    };
    const handleMessageError = () => {
      finish(() => {
        updateDisplayRoutingDebugState({ stage: 'worker-message-error', requestId, error: 'display-edge-worker-message-error' });
        reject(new Error('display-edge-worker-message-error'));
      });
    };
    const handleAbort = () => {
      finish(() => {
        updateDisplayRoutingDebugState({
          stage: 'worker-cancelled',
          requestId,
          error: 'display-edge-worker-cancelled',
        });
        reject(new Error('display-edge-worker-cancelled'));
      }, true);
    };
    const maximumTimeoutMs = qualityMode === 'interactive'
      ? INTERACTIVE_DISPLAY_WORKER_TIMEOUT_MS
      : COMPLEX_DISPLAY_WORKER_TIMEOUT_MS;
    const timeoutId = window.setTimeout(() => {
      finish(() => {
        updateDisplayRoutingDebugState({ stage: 'worker-timeout', requestId, error: 'display-edge-worker-timeout' });
        reject(new Error('display-edge-worker-timeout'));
      }, true);
    }, Math.max(1_000, Math.min(timeoutMs, maximumTimeoutMs)));

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.addEventListener('messageerror', handleMessageError);
    signal?.addEventListener('abort', handleAbort, { once: true });
    try {
      updateDisplayRoutingDebugState({ stage: 'worker-post', requestId });
      const projectedInput = projectBaseReactFlowDisplayWorkerInput({ edges, nodes });
      worker.postMessage({
        requestId,
        edges: projectedInput.edges,
        nodes: projectedInput.nodes,
        enableSmartEdges,
        smartEdgePadding,
        isLargeGraph,
        displayEdgeEpoch,
        qualityMode,
      });
    } catch {
      finish(() => reject(new Error('display-edge-worker-post-failed')), true);
    }
  })
);

export const doDisplayEdgesMatchSourceGraph = (sourceEdges: Edge[], displayEdges: Edge[]): boolean => (
  sourceEdges.length === displayEdges.length
  && sourceEdges.every((edge, index) => {
    const displayEdge = displayEdges[index];
    return displayEdge?.id === edge.id
      && displayEdge.source === edge.source
      && displayEdge.target === edge.target;
  })
);
