import type { Edge, Node, XYPosition } from '@xyflow/react';
import { EDGE_ROUTING_CACHE_VERSION } from '../../routing/routingVersion';
import type { RoutingPatch } from '../../routing/routingPatch';
import { edgeRoutingQualityIntentToken } from '../../strategies/shared/edgeRoutingQualityIntent';
import { visitBaseReactFlowDisplayInputIdentity } from './baseReactFlowDisplayInputIdentity';
import {
  createBaseReactFlowPersistedRoutingCandidate,
  parseBaseReactFlowPersistedRoutingCandidate,
} from './baseReactFlowPersistedRoutingCandidate';

const BASE_DISPLAY_FINALIZED_SIGNATURE = '__baseDisplayFinalizedSignature';
export const BASE_DISPLAY_ROUTING_VERSION = EDGE_ROUTING_CACHE_VERSION;
const BASE_DISPLAY_CACHE_VERSION = BASE_DISPLAY_ROUTING_VERSION;
const BASE_DISPLAY_CACHE_NAMESPACE = 'vizly:baseReactFlowDisplayEdges:';
const BASE_DISPLAY_CACHE_PREFIX = `${BASE_DISPLAY_CACHE_NAMESPACE}${BASE_DISPLAY_CACHE_VERSION}:`;
const BASE_DISPLAY_CACHE_MAX_EDGES = 300;
const BASE_DISPLAY_CACHE_MAX_CHARS = 2_000_000;
const BASE_DISPLAY_CACHE_MAX_ARRAY_ITEMS = 2_000;
const BASE_DISPLAY_MEMORY_CACHE_MAX_ENTRIES = 16;
const BASE_DISPLAY_STORAGE_CACHE_MAX_ENTRIES = 12;
const BASE_DISPLAY_CACHE_MAX_SIGNATURE_CHARS = 500;
const BASE_DISPLAY_ROUTE_MAX_ABS_COORDINATE = 1_000_000_000;
const BASE_DISPLAY_ROUTE_MAX_TOTAL_POINTS = 200_000;
const BASE_DISPLAY_ROUTE_SIGNATURE_VERSION = 'route-v2';

export type BaseReactFlowDisplayEdgesCacheEntry = {
  edges: RoutingPatch[];
  hardClean: boolean;
  inputGeometryDigest?: string;
  /** Exact path/handle geometry to which hardClean applies. */
  outputRouteSignature: string;
};

const displayEdgesMemoryCache = new Map<string, BaseReactFlowDisplayEdgesCacheEntry>();

type DisplayNode = Node & {
  positionAbsolute?: XYPosition;
  measured?: { width?: number; height?: number };
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const rememberDisplayEdgesInMemory = (
  signature: string,
  entry: BaseReactFlowDisplayEdgesCacheEntry,
): void => {
  if (displayEdgesMemoryCache.has(signature)) displayEdgesMemoryCache.delete(signature);
  displayEdgesMemoryCache.set(signature, entry);
  while (displayEdgesMemoryCache.size > BASE_DISPLAY_MEMORY_CACHE_MAX_ENTRIES) {
    const oldest = displayEdgesMemoryCache.keys().next().value;
    if (typeof oldest !== 'string') break;
    displayEdgesMemoryCache.delete(oldest);
  }
};

export const isFinitePoint = (value: unknown): value is { x: number; y: number } => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
};

const isBoundedRoutePoint = (value: unknown): value is { x: number; y: number } => (
  isFinitePoint(value)
  && Math.abs(value.x) <= BASE_DISPLAY_ROUTE_MAX_ABS_COORDINATE
  && Math.abs(value.y) <= BASE_DISPLAY_ROUTE_MAX_ABS_COORDINATE
);

const isValidDisplayCacheInputSignature = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= BASE_DISPLAY_CACHE_MAX_SIGNATURE_CHARS
);

export const isBaseReactFlowDisplayOutputRouteSignature = (value: unknown): value is string => (
  typeof value === 'string'
  && /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/.test(value)
);

const routeHandleToken = (value: unknown): string | null => {
  if (value == null) return '';
  return typeof value === 'string' && value.length <= 500 ? value : null;
};

/**
 * Computes the exact rendered-routing identity used to bind a cached hard report.
 * Business and visual metadata are deliberately excluded so routing patches can be
 * merged onto the newest source edge without invalidating an otherwise identical route.
 */
export const computeBaseReactFlowDisplayOutputRouteSignature = (
  edges: readonly Edge[],
): string | null => {
  if (!Array.isArray(edges) || edges.length === 0 || edges.length > BASE_DISPLAY_CACHE_MAX_EDGES) {
    return null;
  }

  let primaryHash = 2166136261;
  let secondaryHash = 3339675911;
  let totalPoints = 0;
  const feedCode = (code: number): void => {
    primaryHash ^= code;
    primaryHash = Math.imul(primaryHash, 16777619);
    secondaryHash ^= code;
    secondaryHash = Math.imul(secondaryHash, 2246822519);
  };
  const feedText = (text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      feedCode(text.charCodeAt(index));
    }
  };
  const feed = (value: unknown): void => {
    const text = String(value);
    feedText(String(text.length));
    feedCode(58);
    feedText(text);
  };
  const feedPath = (carrier: string, value: unknown, required: boolean): boolean => {
    if (typeof value === 'undefined') {
      if (required) return false;
      feed(carrier);
      feed('absent');
      return true;
    }
    if (!Array.isArray(value) || value.length > BASE_DISPLAY_CACHE_MAX_ARRAY_ITEMS) return false;
    if (required && value.length < 2) return false;
    totalPoints += value.length;
    if (totalPoints > BASE_DISPLAY_ROUTE_MAX_TOTAL_POINTS) return false;
    feed(carrier);
    feed(value.length);
    for (const point of value) {
      if (!isBoundedRoutePoint(point)) return false;
      // JSON storage normalizes -0 to 0; they are geometrically identical and
      // must retain the same report-bound signature after a storage round-trip.
      feed(point.x);
      feed(point.y);
    }
    return true;
  };

  feed(BASE_DISPLAY_ROUTE_SIGNATURE_VERSION);
  feed(edges.length);
  for (const edge of edges) {
    if (
      !edge
      || typeof edge.id !== 'string'
      || edge.id.length === 0
      || edge.id.length > 500
      || typeof edge.source !== 'string'
      || edge.source.length === 0
      || edge.source.length > 500
      || typeof edge.target !== 'string'
      || edge.target.length === 0
      || edge.target.length > 500
    ) return null;
    const sourceHandle = routeHandleToken(edge.sourceHandle);
    const targetHandle = routeHandleToken(edge.targetHandle);
    const edgeType = routeHandleToken(edge.type);
    if (sourceHandle === null || targetHandle === null || edgeType === null) return null;
    const data = edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
      ? edge.data as Record<string, unknown>
      : {};
    const treeRouting = data.treeRouting && typeof data.treeRouting === 'object' && !Array.isArray(data.treeRouting)
      ? data.treeRouting as Record<string, unknown>
      : {};
    const effectiveSourceHandle = routeHandleToken(treeRouting.effectiveSourceHandle);
    const effectiveTargetHandle = routeHandleToken(treeRouting.effectiveTargetHandle);
    if (effectiveSourceHandle === null || effectiveTargetHandle === null) return null;

    feed(edge.id);
    feed(edge.source);
    feed(edge.target);
    feed(edgeType);
    feed(sourceHandle);
    feed(targetHandle);
    feed(effectiveSourceHandle);
    feed(effectiveTargetHandle);
    feed(edgeRoutingQualityIntentToken(edge));
    if (!feedPath('computedPath', data.computedPath, true)) return null;
    if (!feedPath('elkPath', data.elkPath, false)) return null;
    if (!feedPath('treeRouting.points', treeRouting.points, false)) return null;
  }

  const hash = `${(primaryHash >>> 0).toString(16).padStart(8, '0')}${(secondaryHash >>> 0).toString(16).padStart(8, '0')}`;
  return `${BASE_DISPLAY_ROUTE_SIGNATURE_VERSION}:${edges.length}:${totalPoints}:${hash}`;
};

export const baseReactFlowDisplayOutputRouteSignatureMatches = (
  edges: Edge[],
  expectedSignature: unknown,
): boolean => (
  isBaseReactFlowDisplayOutputRouteSignature(expectedSignature)
  && computeBaseReactFlowDisplayOutputRouteSignature(edges) === expectedSignature
);

const endpointGeometryKeyPart = (value: unknown): string => {
  const text = String(value ?? '');
  return `${text.length}:${text}`;
};

export const computeBaseReactFlowEndpointGeometryKey = (nodes: Node[]): string => (
  nodes.map((node) => {
    const displayNode = node as DisplayNode;
    const hasAbsolutePosition = Boolean(displayNode.positionAbsolute);
    const position = hasAbsolutePosition
      ? displayNode.positionAbsolute
      : node.position;
    const measured = displayNode.measured;
    const style = asRecord(node.style);
    const width = measured?.width ?? node.width ?? style.width ?? 0;
    const height = measured?.height ?? node.height ?? style.height ?? 0;
    return [
      node.id,
      node.type,
      node.parentId,
      hasAbsolutePosition ? 'absolute' : 'relative',
      Number(position?.x ?? 0),
      Number(position?.y ?? 0),
      Number(width || 0),
      Number(height || 0),
    ].map(endpointGeometryKeyPart).join('');
  }).join('\u001e')
);

export const computeBaseDisplayInputSignature = ({
  nodes,
  edges,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
}: {
  nodes: Node[];
  edges: Edge[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
}): string => {
  let hash = 2166136261;
  const feed = (value: unknown) => {
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };

  feed(enableSmartEdges);
  feed(Number.isFinite(smartEdgePadding) ? Math.round(smartEdgePadding) : 'invalid-padding');
  feed(isLargeGraph);
  feed(BASE_DISPLAY_ROUTING_VERSION);
  nodes.forEach((node) => {
    const displayNode = node as DisplayNode;
    const pos = displayNode.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
    const measured = displayNode.measured;
    const style = asRecord(node.style);
    const data = (node.data && typeof node.data === 'object')
      ? node.data as Record<string, unknown>
      : {};
    feed(node.id);
    feed(node.type);
    feed(node.parentId);
    feed(Boolean(displayNode.positionAbsolute));
    feed(data.layoutDirection);
    feed(Math.round(Number(pos.x || 0)));
    feed(Math.round(Number(pos.y || 0)));
    feed(Math.round(Number(measured?.width ?? node.width ?? style.width ?? 0)));
    feed(Math.round(Number(measured?.height ?? node.height ?? style.height ?? 0)));
  });
  edges.forEach((edge) => {
    const data = (edge.data && typeof edge.data === 'object')
      ? edge.data as Record<string, unknown>
      : {};
    feed(edge.id);
    feed(edge.source);
    feed(edge.target);
    feed(edge.sourceHandle);
    feed(edge.targetHandle);
    // The full-route transaction commits every routed edge to StablePathEdge.
    // Treat that renderer swap as presentation state so feeding a finalized
    // result back into the pipeline remains idempotent. Dedicated canvas
    // references still form a distinct routing class.
    feed(String(edge.type || '').toLowerCase() === 'canvas-ref' ? 'canvas-ref' : 'routed-edge');
    feed(data.autoSource);
    feed(data.autoTarget);
    feed(Array.isArray(data.auto) ? data.auto.map(String).join(',') : data.auto);
    feed(Array.isArray(data.manualHandleSides) ? data.manualHandleSides.map(String).join(',') : data.manualHandleSides);
    const manualHandles = (data.manualHandles && typeof data.manualHandles === 'object')
      ? data.manualHandles as Record<string, unknown>
      : {};
    feed(data.manualHandles === true);
    feed(manualHandles.source);
    feed(manualHandles.target);
    const legacyManualHandles = data.manualHandles == null ? data._manualHandles : undefined;
    const legacyManualHandleRecord = (
      legacyManualHandles
      && typeof legacyManualHandles === 'object'
      && !Array.isArray(legacyManualHandles)
    ) ? legacyManualHandles as Record<string, unknown> : {};
    if (
      legacyManualHandles === true
      || Boolean(legacyManualHandleRecord.source)
      || Boolean(legacyManualHandleRecord.target)
    ) {
      feed('_manualHandles');
      feed(legacyManualHandles === true);
      feed(legacyManualHandleRecord.source);
      feed(legacyManualHandleRecord.target);
    }
    if (Array.isArray(data.manualHandlePositions) && data.manualHandlePositions.length > 0) {
      feed('manualHandlePositions');
      feed(data.manualHandlePositions.map(String).join(','));
    }
    feed(data.sourceHandleLocked);
    feed(data.targetHandleLocked);
    if (data.sourceHandlePositionLocked === true) feed('sourceHandlePositionLocked:true');
    if (data.targetHandlePositionLocked === true) feed('targetHandlePositionLocked:true');
    feed(data.sourcePortPolicy);
    feed(data.targetPortPolicy);
    feed(data.sourcePortConstraint);
    feed(data.targetPortConstraint);
    const runtimeHandleLock = (data.runtimeHandleLock && typeof data.runtimeHandleLock === 'object')
      ? data.runtimeHandleLock as Record<string, unknown>
      : {};
    feed(runtimeHandleLock.source);
    feed(runtimeHandleLock.target);
    if (data.runtimeHandleLock === true) feed('runtimeHandleLock:true');
    const legacyRuntimeHandleLock = data.runtimeHandleLock == null
      ? data._runtimeHandleLock
      : undefined;
    const legacyRuntimeHandleLockRecord = (
      legacyRuntimeHandleLock
      && typeof legacyRuntimeHandleLock === 'object'
      && !Array.isArray(legacyRuntimeHandleLock)
    ) ? legacyRuntimeHandleLock as Record<string, unknown> : {};
    if (
      legacyRuntimeHandleLock === true
      || Boolean(legacyRuntimeHandleLockRecord.source)
      || Boolean(legacyRuntimeHandleLockRecord.target)
    ) {
      feed('_runtimeHandleLock');
      feed(legacyRuntimeHandleLock === true);
      feed(legacyRuntimeHandleLockRecord.source);
      feed(legacyRuntimeHandleLockRecord.target);
    }
    const treeRouting = (data.treeRouting && typeof data.treeRouting === 'object')
      ? data.treeRouting as Record<string, unknown>
      : {};
    feed(treeRouting.effectiveSourceHandle);
    feed(treeRouting.effectiveTargetHandle);
  });

  return String(hash >>> 0);
};

export const computeBaseReactFlowDisplayCacheSignature = (input: {
  nodes: Node[];
  edges: Edge[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
}): string => {
  let hash = 2166136261;
  const feed = (value: unknown) => {
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };
  visitBaseReactFlowDisplayInputIdentity(input, feed);

  return String(hash >>> 0);
};

export const computeBaseReactFlowDisplayEdgeEpoch = ({
  nodes,
  edges,
}: {
  nodes: Node[];
  edges: Edge[];
}): number => {
  let hash = 2166136261;
  const feed = (value: unknown) => {
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };

  feed(BASE_DISPLAY_ROUTING_VERSION);
  nodes.forEach((node) => {
    const displayNode = node as DisplayNode;
    const pos = displayNode.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
    const measured = displayNode.measured;
    const style = asRecord(node.style);
    feed(node.id);
    feed(Math.round(Number(pos.x || 0)));
    feed(Math.round(Number(pos.y || 0)));
    feed(Math.round(Number(measured?.width ?? node.width ?? style.width ?? 0)));
    feed(Math.round(Number(measured?.height ?? node.height ?? style.height ?? 0)));
  });

  edges.forEach((edge) => {
    feed(edge.id);
    feed(edge.source);
    feed(edge.target);
    feed(edge.sourceHandle);
    feed(edge.targetHandle);
    feed(edge.type);
  });

  return hash >>> 0;
};

const cloneDisplayEdges = (edges: Edge[]): Edge[] => (
  edges.map((edge) => ({
    ...edge,
    data: edge.data && typeof edge.data === 'object'
      ? JSON.parse(JSON.stringify(edge.data))
      : edge.data,
  }))
);

const readDisplayCacheStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

const cachedDisplayWrittenAt = (raw: string | null): number => {
  if (!raw) return 0;
  const match = raw.slice(0, 512).match(/"writtenAt":(\d+)/);
  const parsed = match ? Number(match[1]) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const collectCurrentDisplayCacheEntries = (
  storage: Storage,
  incomingKey: string,
): Array<{ key: string; writtenAt: number }> => {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => typeof key === 'string');
  const current: Array<{ key: string; writtenAt: number }> = [];
  for (const key of keys) {
    if (!key.startsWith(BASE_DISPLAY_CACHE_NAMESPACE)) continue;
    if (!key.startsWith(BASE_DISPLAY_CACHE_PREFIX)) {
      try {
        storage.removeItem(key);
      } catch {
        // Cache cleanup is best effort and must never block rendering.
      }
      continue;
    }
    if (key === incomingKey) continue;
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      // An unreadable cache entry is not useful for eviction ordering.
    }
    current.push({ key, writtenAt: cachedDisplayWrittenAt(raw) });
  }
  return current.sort((first, second) => (
    first.writtenAt - second.writtenAt || first.key.localeCompare(second.key)
  ));
};

const prepareDisplayCacheStorageForWrite = (storage: Storage, incomingKey: string): void => {
  const current = collectCurrentDisplayCacheEntries(storage, incomingKey);
  while (current.length >= BASE_DISPLAY_STORAGE_CACHE_MAX_ENTRIES) {
    const oldest = current.shift();
    if (!oldest) break;
    try {
      storage.removeItem(oldest.key);
    } catch {
      break;
    }
  }
};

const removeOldestCurrentDisplayCacheEntry = (storage: Storage, incomingKey: string): void => {
  const oldest = collectCurrentDisplayCacheEntries(storage, incomingKey)[0];
  if (!oldest) return;
  try {
    storage.removeItem(oldest.key);
  } catch {
    // A failed cache retry must not affect diagram rendering.
  }
};

export const readBaseReactFlowDisplayEdgesCacheEntry = (
  signature: string,
  inputGeometryDigest?: string,
): BaseReactFlowDisplayEdgesCacheEntry | null => {
  if (!isValidDisplayCacheInputSignature(signature)) return null;
  const memoryHit = displayEdgesMemoryCache.get(signature);
  if (memoryHit) {
    if (
      !memoryHit.hardClean
      || !isBaseReactFlowDisplayOutputRouteSignature(memoryHit.outputRouteSignature)
      || (
        inputGeometryDigest !== undefined
        && memoryHit.inputGeometryDigest !== inputGeometryDigest
      )
    ) {
      displayEdgesMemoryCache.delete(signature);
      return null;
    }
    rememberDisplayEdgesInMemory(signature, memoryHit);
    return {
      edges: cloneDisplayEdges(memoryHit.edges),
      hardClean: memoryHit.hardClean,
      inputGeometryDigest: memoryHit.inputGeometryDigest,
      outputRouteSignature: memoryHit.outputRouteSignature,
    };
  }
  const storage = readDisplayCacheStorage();
  if (!storage) return null;
  const key = `${BASE_DISPLAY_CACHE_PREFIX}${signature}`;
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > BASE_DISPLAY_CACHE_MAX_CHARS) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid edge display cache');
    const candidate = parseBaseReactFlowPersistedRoutingCandidate(parsed, {
      routingVersion: BASE_DISPLAY_CACHE_VERSION,
      inputSignature: signature,
      inputGeometryDigest,
    });
    if (!candidate) throw new Error('Invalid persisted routing candidate');
    const entry = {
      edges: cloneDisplayEdges(candidate.patches),
      hardClean: true,
      inputGeometryDigest: candidate.inputGeometryDigest,
      outputRouteSignature: candidate.outputRouteSignature,
    };
    rememberDisplayEdgesInMemory(signature, entry);
    return {
      edges: cloneDisplayEdges(entry.edges),
      hardClean: entry.hardClean,
      inputGeometryDigest: entry.inputGeometryDigest,
      outputRouteSignature: entry.outputRouteSignature,
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures; cache is only a render accelerator.
    }
    return null;
  }
};

export const readBaseReactFlowDisplayEdgesCache = (
  signature: string,
  inputGeometryDigest?: string,
): Edge[] | null => (
  readBaseReactFlowDisplayEdgesCacheEntry(signature, inputGeometryDigest)?.edges ?? null
);

export const writeBaseReactFlowDisplayEdgesCache = (
  signature: string,
  edges: Edge[],
  options: {
    hardClean?: boolean;
    inputGeometryDigest?: string;
    outputRouteSignature?: string;
  } = {},
): void => {
  // This cache is a final-render accelerator. Persisting a failed bounded candidate makes a
  // transient routing miss sticky across reloads and prevents the worker from retrying it.
  if (options.hardClean !== true) return;
  if (
    !isValidDisplayCacheInputSignature(signature)
    || !Array.isArray(edges)
    || edges.length === 0
    || edges.length > BASE_DISPLAY_CACHE_MAX_EDGES
  ) return;
  const outputRouteSignature = options.outputRouteSignature;
  if (!isBaseReactFlowDisplayOutputRouteSignature(outputRouteSignature)) return;
  const candidate = createBaseReactFlowPersistedRoutingCandidate({
    routingVersion: BASE_DISPLAY_CACHE_VERSION,
    inputSignature: signature,
    inputGeometryDigest: options.inputGeometryDigest ?? '',
    outputRouteSignature,
    patches: edges,
  });
  if (!candidate) return;
  const payload = JSON.stringify(candidate);
  if (payload.length > BASE_DISPLAY_CACHE_MAX_CHARS) return;
  rememberDisplayEdgesInMemory(signature, {
    edges: cloneDisplayEdges(candidate.patches),
    hardClean: true,
    inputGeometryDigest: candidate.inputGeometryDigest,
    outputRouteSignature,
  });
  const storage = readDisplayCacheStorage();
  if (!storage) return;
  const key = `${BASE_DISPLAY_CACHE_PREFIX}${signature}`;
  prepareDisplayCacheStorageForWrite(storage, key);
  try {
    storage.setItem(key, payload);
  } catch {
    removeOldestCurrentDisplayCacheEntry(storage, key);
    try {
      storage.setItem(key, payload);
    } catch {
      // Quota or privacy mode failures should not block diagram rendering.
    }
  }
};

export const isBaseDisplayFinalized = (edges: Edge[], signature: string): boolean => (
  edges.length > 0
  && edges.every((edge) => {
    const data = asRecord(edge.data);
    return data[BASE_DISPLAY_FINALIZED_SIGNATURE] === signature;
  })
);

export const markBaseDisplayFinalized = <T extends Edge[]>(edges: T, signature: string): T => (
  edges.map((edge) => {
    const data = asRecord(edge.data);
    const hasRenderableComputedPath = Array.isArray(data.computedPath)
      && data.computedPath.length >= 2
      && data.computedPath.every(isFinitePoint);
    const preservesDedicatedRenderer = String(edge.type || '').toLowerCase() === 'canvas-ref';
    const needsStablePath = hasRenderableComputedPath && !preservesDedicatedRenderer;
    const alreadyFinalized = data[BASE_DISPLAY_FINALIZED_SIGNATURE] === signature;
    const alreadyRenderLocked = !needsStablePath || (
      edge.type === 'stablePath'
      && data.layoutPathLocked === true
      && data._layoutPathLocked === true
    );
    if (alreadyFinalized && alreadyRenderLocked) return edge;
    return {
      ...edge,
      ...(needsStablePath ? { type: 'stablePath' } : {}),
      data: {
        ...data,
        ...(needsStablePath
          ? { layoutPathLocked: true, _layoutPathLocked: true }
          : {}),
        [BASE_DISPLAY_FINALIZED_SIGNATURE]: signature,
      },
    };
  }) as T
);
