import type { Edge } from '@xyflow/react';

import { parseRoutingLineHops } from '../../routing/routingLineHops';
import type { RoutingPatch } from '../../routing/routingPatch';
import { edgeRoutingQualityIntentToken } from '../../strategies/shared/edgeRoutingQualityIntent';
import {
  baseReactFlowDisplayOutputRouteSignatureMatches,
  computeBaseReactFlowDisplayOutputRouteSignature,
  type BaseReactFlowDisplayEdgesCacheEntry,
} from './baseReactFlowDisplayCache';
import {
  DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE,
  DISPLAY_WORKER_MAX_GRAPH_ITEMS,
  DISPLAY_WORKER_MAX_PATH_POINTS,
  DISPLAY_WORKER_MAX_TOTAL_PATH_POINTS,
} from './baseReactFlowDisplayWorkerProtocol';
import { displayTerminalHandleChangeIsAllowed } from './baseReactFlowDisplayTerminalPolicy';

const ROUTING_PATCH_NO_CHANGE = Symbol('routing-patch-no-change');

const isRoutingRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isRoutingPatchObject = (value: unknown): value is Record<string, unknown> => (
  isRoutingRecord(value)
);

const isRoutingPatchKeySafe = (key: string): boolean => (
  key !== '__proto__' && key !== 'prototype' && key !== 'constructor'
);

const hasOwnRoutingProperty = (value: object, key: PropertyKey): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
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
): RoutingPatch[] | null => {
  if (sourceEdges.length !== routedEdges.length) return null;
  const patches: RoutingPatch[] = [];
  for (let index = 0; index < routedEdges.length; index += 1) {
    const routedEdge = routedEdges[index];
    const sourceEdge = sourceEdges[index];
    if (
      routedEdge?.id !== sourceEdge?.id
      || routedEdge.source !== sourceEdge.source
      || routedEdge.target !== sourceEdge.target
    ) return null;
    const valuePatch = buildRoutingValuePatch(sourceEdge, routedEdge);
    const patch = valuePatch === ROUTING_PATCH_NO_CHANGE || !isRoutingPatchObject(valuePatch)
      ? {}
      : valuePatch;
    // Missing automatic terminal/type tokens are semantically different from
    // retaining the source value. Trusted routing patches support explicit
    // undefined, so encode these bounded deletions instead of silently
    // replaying a stale manual handle into the route signature.
    for (const key of ['sourceHandle', 'targetHandle', 'type'] as const) {
      if (
        hasOwnRoutingProperty(sourceEdge, key)
        && !hasOwnRoutingProperty(routedEdge, key)
      ) patch[key] = undefined;
    }
    patches.push({
      id: routedEdge.id,
      source: routedEdge.source,
      target: routedEdge.target,
      ...patch,
    } as RoutingPatch);
  }
  return patches;
};

export const mergeBaseReactFlowDisplayEdgePatches = (
  sourceEdges: Edge[],
  patches: RoutingPatch[],
): Edge[] | null => {
  if (!Array.isArray(patches) || sourceEdges.length !== patches.length) return null;
  const merged: Edge[] = [];
  for (let index = 0; index < sourceEdges.length; index += 1) {
    const sourceEdge = sourceEdges[index];
    const patch = patches[index];
    if (
      patch?.id !== sourceEdge?.id
      || patch.source !== sourceEdge.source
      || patch.target !== sourceEdge.target
    ) return null;
    merged.push(applyRoutingValuePatch(sourceEdge, patch) as Edge);
  }
  return merged;
};

const hasOwn = (value: object, key: PropertyKey): boolean => (
  hasOwnRoutingProperty(value, key)
);

const sanitizeCacheRoutingPath = (value: unknown): Array<{ x: number; y: number }> | null => {
  if (!Array.isArray(value) || value.length > DISPLAY_WORKER_MAX_PATH_POINTS) return null;
  const path: Array<{ x: number; y: number }> = [];
  for (const point of value) {
    if (!isRoutingRecord(point) || !Object.keys(point).every(key => key === 'x' || key === 'y')) return null;
    if (
      typeof point.x !== 'number'
      || !Number.isFinite(point.x)
      || Math.abs(point.x) > DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE
      || typeof point.y !== 'number'
      || !Number.isFinite(point.y)
      || Math.abs(point.y) > DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE
    ) return null;
    path.push({ x: point.x, y: point.y });
  }
  return path;
};

const copyCacheRoutingToken = (
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  key: string,
): boolean => {
  if (!hasOwn(source, key)) return true;
  const value = source[key];
  if (value != null && (typeof value !== 'string' || value.length > 20_000)) return false;
  target[key] = value;
  return true;
};

type DisplayRoutingPatchSanitizerOptions = {
  allowRuntimeHandleChange: boolean;
  allowRouterIntent: boolean;
  allowNewTreeRouting: boolean;
  allowUndefinedRoutingValues: boolean;
};

const sanitizeBaseReactFlowRoutingPatches = (
  sourceEdges: Edge[],
  patches: RoutingPatch[],
  options: DisplayRoutingPatchSanitizerOptions,
): RoutingPatch[] | null => {
  if (
    sourceEdges.length !== patches.length
    || sourceEdges.length > DISPLAY_WORKER_MAX_GRAPH_ITEMS
  ) return null;
  const safePatches: RoutingPatch[] = [];
  let totalPoints = 0;
  for (let index = 0; index < patches.length; index += 1) {
    const sourceEdge = sourceEdges[index];
    const patch = patches[index];
    if (
      !sourceEdge
      || !patch
      || patch.id !== sourceEdge.id
      || patch.source !== sourceEdge.source
      || patch.target !== sourceEdge.target
    ) return null;
    const safePatch: Record<string, unknown> = {
      id: patch.id,
      source: patch.source,
      target: patch.target,
    };
    if (hasOwn(patch, 'type')) {
      const patchType = patch.type;
      if (
        patchType != null
        && (
          typeof patchType !== 'string'
          || patchType.length > 20_000
          || (patchType !== sourceEdge.type && patchType !== 'stablePath')
        )
      ) return null;
      safePatch.type = patchType;
    }
    if (
      !copyCacheRoutingToken(patch as unknown as Record<string, unknown>, safePatch, 'sourceHandle')
      || !copyCacheRoutingToken(patch as unknown as Record<string, unknown>, safePatch, 'targetHandle')
    ) return null;
    if (
      (hasOwn(safePatch, 'sourceHandle')
        && !displayTerminalHandleChangeIsAllowed(
          sourceEdge,
          'source',
          safePatch.sourceHandle,
          { allowRuntimeHandleChange: options.allowRuntimeHandleChange },
        ))
      || (hasOwn(safePatch, 'targetHandle')
        && !displayTerminalHandleChangeIsAllowed(
          sourceEdge,
          'target',
          safePatch.targetHandle,
          { allowRuntimeHandleChange: options.allowRuntimeHandleChange },
        ))
    ) return null;

    if (hasOwn(patch, 'data')) {
      if (!isRoutingRecord(patch.data)) return null;
      const safeData: Record<string, unknown> = {};
      for (const key of ['computedPath', 'elkPath'] as const) {
        if (!hasOwn(patch.data, key)) continue;
        if (typeof patch.data[key] === 'undefined' && options.allowUndefinedRoutingValues) {
          safeData[key] = undefined;
          continue;
        }
        const path = sanitizeCacheRoutingPath(patch.data[key]);
        if (!path) return null;
        totalPoints += path.length;
        if (totalPoints > DISPLAY_WORKER_MAX_TOTAL_PATH_POINTS) return null;
        safeData[key] = path;
      }
      if (hasOwn(patch.data, 'treeRouting')) {
        if (
          typeof patch.data.treeRouting === 'undefined'
          && options.allowUndefinedRoutingValues
        ) {
          safeData.treeRouting = undefined;
        } else {
          const sourceData = isRoutingRecord(sourceEdge.data) ? sourceEdge.data : null;
          const sourceTree = sourceData && isRoutingRecord(sourceData.treeRouting)
            ? sourceData.treeRouting
            : null;
          if (sourceTree || options.allowNewTreeRouting) {
            if (!isRoutingRecord(patch.data.treeRouting)) return null;
            const treePatch = patch.data.treeRouting;
            const safeTree: Record<string, unknown> = {};
            if (hasOwn(treePatch, 'points')) {
              if (typeof treePatch.points === 'undefined' && options.allowUndefinedRoutingValues) {
                safeTree.points = undefined;
              } else {
                const points = sanitizeCacheRoutingPath(treePatch.points);
                if (!points) return null;
                totalPoints += points.length;
                if (totalPoints > DISPLAY_WORKER_MAX_TOTAL_PATH_POINTS) return null;
                safeTree.points = points;
              }
            }
            if (
              !copyCacheRoutingToken(treePatch, safeTree, 'effectiveSourceHandle')
              || !copyCacheRoutingToken(treePatch, safeTree, 'effectiveTargetHandle')
            ) return null;
            if (
              (hasOwn(safeTree, 'effectiveSourceHandle')
                && !displayTerminalHandleChangeIsAllowed(
                  sourceEdge,
                  'source',
                  safeTree.effectiveSourceHandle,
                  { allowRuntimeHandleChange: options.allowRuntimeHandleChange },
                ))
              || (hasOwn(safeTree, 'effectiveTargetHandle')
                && !displayTerminalHandleChangeIsAllowed(
                  sourceEdge,
                  'target',
                  safeTree.effectiveTargetHandle,
                  { allowRuntimeHandleChange: options.allowRuntimeHandleChange },
                ))
            ) return null;
            if (Object.keys(safeTree).length > 0 || options.allowNewTreeRouting) {
              safeData.treeRouting = safeTree;
            }
          }
        }
      }
      if (hasOwn(patch.data, 'h')) {
        const lineHops = patch.data.h;
        if (typeof lineHops === 'undefined' && options.allowUndefinedRoutingValues) {
          safeData.h = undefined;
        } else {
          const safeLineHops = parseRoutingLineHops(lineHops);
          if (!safeLineHops) return null;
          safeData.h = safeLineHops;
        }
      }
      if (options.allowRouterIntent) {
        for (const key of [
          'sharedTrunkAware',
          'sharedTrunkSynthesized',
          'isTreeBus',
          'overextendedTargetTrunkCorridorReclaimed',
        ] as const) {
          if (!hasOwn(patch.data, key)) continue;
          const intent = patch.data[key];
          if (typeof intent === 'undefined' && options.allowUndefinedRoutingValues) {
            safeData[key] = undefined;
          } else if (typeof intent === 'boolean') {
            safeData[key] = intent;
          } else {
            return null;
          }
        }
      }
      if (Object.keys(safeData).length > 0) safePatch.data = safeData;
    }
    safePatches.push(safePatch as RoutingPatch);
  }
  return safePatches;
};

/**
 * Projects untrusted persistent-cache patches onto geometry-only routing DTOs.
 * Intent flags and tree-bus identity remain owned by the current source graph;
 * cache data can update an existing tree's geometry but cannot create one.
 */
export const sanitizeBaseReactFlowDisplayCachePatches = (
  sourceEdges: Edge[],
  patches: RoutingPatch[],
): RoutingPatch[] | null => sanitizeBaseReactFlowRoutingPatches(sourceEdges, patches, {
  allowRuntimeHandleChange: false,
  allowRouterIntent: false,
  allowNewTreeRouting: false,
  allowUndefinedRoutingValues: false,
});

/**
 * Projects a parsed routing-only document candidate onto the current graph.
 * Unlike the browser cache boundary, a document snapshot may restore bounded
 * router intent because it is still revalidated by the Worker before commit.
 */
export const sanitizeBaseReactFlowDocumentCandidatePatches = (
  sourceEdges: Edge[],
  patches: RoutingPatch[],
): RoutingPatch[] | null => sanitizeBaseReactFlowRoutingPatches(sourceEdges, patches, {
  allowRuntimeHandleChange: false,
  allowRouterIntent: true,
  allowNewTreeRouting: true,
  allowUndefinedRoutingValues: false,
});

/**
 * Internal worker output may carry the router-owned trunk intent and may clear
 * stale optional route carriers. It is still projected through a routing-only
 * schema before being retained across React renders.
 */
export const sanitizeBaseReactFlowTrustedDisplayPatches = (
  sourceEdges: Edge[],
  patches: RoutingPatch[],
): RoutingPatch[] | null => sanitizeBaseReactFlowRoutingPatches(sourceEdges, patches, {
  allowRuntimeHandleChange: true,
  allowRouterIntent: true,
  allowNewTreeRouting: true,
  allowUndefinedRoutingValues: true,
});

export const mergeBaseReactFlowDisplayRoutingTransactions = ({
  latestSourceEdges,
  workerRoutingPatches,
  repairRoutingPatches,
}: {
  latestSourceEdges: Edge[];
  workerRoutingPatches: RoutingPatch[];
  repairRoutingPatches?: RoutingPatch[];
}): {
  edges: Edge[];
  displayPatches: RoutingPatch[];
  cachePatches: RoutingPatch[] | null;
} | null => {
  const workerMergedEdges = mergeBaseReactFlowDisplayEdgePatches(
    latestSourceEdges,
    workerRoutingPatches,
  );
  if (!workerMergedEdges) return null;
  const edges = repairRoutingPatches
    ? mergeBaseReactFlowDisplayEdgePatches(workerMergedEdges, repairRoutingPatches)
    : workerMergedEdges;
  if (!edges) return null;
  const rawDisplayPatches = createBaseReactFlowDisplayEdgePatches(latestSourceEdges, edges);
  if (!rawDisplayPatches) return null;
  const displayPatches = sanitizeBaseReactFlowTrustedDisplayPatches(
    latestSourceEdges,
    rawDisplayPatches,
  );
  if (!displayPatches) return null;
  const cachePatches = sanitizeBaseReactFlowDisplayCachePatches(
    latestSourceEdges,
    displayPatches,
  );
  return { edges, displayPatches, cachePatches };
};

/**
 * Proves that routing-only persisted patches replay the exact final route.
 * Sanitization may intentionally drop unauthorized tree/quality intent, so a
 * hard-clean final result is not automatically cacheable.
 */
export const resolveBaseReactFlowDisplayCacheReplaySignature = ({
  sourceEdges,
  finalEdges,
  cachePatches,
  finalOutputRouteSignature,
}: {
  sourceEdges: Edge[];
  finalEdges: Edge[];
  cachePatches: RoutingPatch[];
  finalOutputRouteSignature: string | null;
}): string | null => {
  if (finalOutputRouteSignature === null) return null;
  const replayedEdges = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, cachePatches);
  if (
    !replayedEdges
    || !doBaseReactFlowDisplayRoutesMatchExactly(finalEdges, replayedEdges)
  ) return null;
  const replaySignature = computeBaseReactFlowDisplayOutputRouteSignature(replayedEdges);
  return replaySignature === finalOutputRouteSignature ? replaySignature : null;
};

const routingToken = (value: unknown): string | null => {
  if (value == null) return '';
  return typeof value === 'string' && value.length <= 20_000 ? value : null;
};

const routingData = (edge: Edge): Record<string, unknown> | null => {
  return isRoutingRecord(edge.data) ? edge.data : null;
};

const routesHaveExactPath = (
  first: unknown,
  second: unknown,
  required: boolean,
  pointBudget: { first: number; second: number },
): boolean => {
  if (typeof first === 'undefined' || typeof second === 'undefined') {
    return !required && typeof first === 'undefined' && typeof second === 'undefined';
  }
  if (
    !Array.isArray(first)
    || !Array.isArray(second)
    || first.length !== second.length
    || first.length > DISPLAY_WORKER_MAX_PATH_POINTS
    || (required && first.length < 2)
  ) return false;
  pointBudget.first += first.length;
  pointBudget.second += second.length;
  if (
    pointBudget.first > DISPLAY_WORKER_MAX_TOTAL_PATH_POINTS
    || pointBudget.second > DISPLAY_WORKER_MAX_TOTAL_PATH_POINTS
  ) return false;
  for (let index = 0; index < first.length; index += 1) {
    const firstPoint = first[index];
    const secondPoint = second[index];
    if (
      !firstPoint
      || typeof firstPoint !== 'object'
      || Array.isArray(firstPoint)
      || !secondPoint
      || typeof secondPoint !== 'object'
      || Array.isArray(secondPoint)
    ) return false;
    const firstRecord = firstPoint as Record<string, unknown>;
    const secondRecord = secondPoint as Record<string, unknown>;
    if (
      !isRoutingRecord(firstRecord)
      || !isRoutingRecord(secondRecord)
      || !Object.keys(firstRecord).every(key => key === 'x' || key === 'y')
      || !Object.keys(secondRecord).every(key => key === 'x' || key === 'y')
      || typeof firstRecord.x !== 'number'
      || !Number.isFinite(firstRecord.x)
      || Math.abs(firstRecord.x) > DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE
      || typeof firstRecord.y !== 'number'
      || !Number.isFinite(firstRecord.y)
      || Math.abs(firstRecord.y) > DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE
      || typeof secondRecord.x !== 'number'
      || !Number.isFinite(secondRecord.x)
      || Math.abs(secondRecord.x) > DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE
      || typeof secondRecord.y !== 'number'
      || !Number.isFinite(secondRecord.y)
      || Math.abs(secondRecord.y) > DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE
      || firstRecord.x !== secondRecord.x
      || firstRecord.y !== secondRecord.y
    ) return false;
  }
  return true;
};

/** Checks routing-owned geometry directly, independently of cache size limits. */
export const doBaseReactFlowDisplayRoutesMatchExactly = (
  workerEdges: readonly Edge[],
  mergedEdges: readonly Edge[],
): boolean => {
  if (
    !Array.isArray(workerEdges)
    || !Array.isArray(mergedEdges)
    || workerEdges.length === 0
    || workerEdges.length !== mergedEdges.length
    || workerEdges.length > DISPLAY_WORKER_MAX_GRAPH_ITEMS
  ) return false;
  const pointBudget = { first: 0, second: 0 };
  for (let index = 0; index < workerEdges.length; index += 1) {
    const workerEdge = workerEdges[index];
    const mergedEdge = mergedEdges[index];
    if (!workerEdge || !mergedEdge) return false;
    const identityValues = [
      workerEdge.id,
      workerEdge.source,
      workerEdge.target,
      mergedEdge.id,
      mergedEdge.source,
      mergedEdge.target,
    ];
    if (identityValues.some(value => (
      typeof value !== 'string' || value.length === 0 || value.length > 20_000
    ))) return false;
    if (
      workerEdge.id !== mergedEdge.id
      || workerEdge.source !== mergedEdge.source
      || workerEdge.target !== mergedEdge.target
    ) return false;
    const workerSourceHandle = routingToken(workerEdge.sourceHandle);
    const workerTargetHandle = routingToken(workerEdge.targetHandle);
    const workerType = routingToken(workerEdge.type);
    const mergedSourceHandle = routingToken(mergedEdge.sourceHandle);
    const mergedTargetHandle = routingToken(mergedEdge.targetHandle);
    const mergedType = routingToken(mergedEdge.type);
    if (
      workerSourceHandle === null
      || workerTargetHandle === null
      || workerType === null
      || mergedSourceHandle === null
      || mergedTargetHandle === null
      || mergedType === null
      || workerSourceHandle !== mergedSourceHandle
      || workerTargetHandle !== mergedTargetHandle
      || workerType !== mergedType
      || edgeRoutingQualityIntentToken(workerEdge) !== edgeRoutingQualityIntentToken(mergedEdge)
    ) return false;
    const workerData = routingData(workerEdge);
    const mergedData = routingData(mergedEdge);
    if (!workerData || !mergedData) return false;
    for (const flag of ['sharedTrunkSynthesized', 'sharedTrunkAware', 'isTreeBus'] as const) {
      if (
        (typeof workerData[flag] !== 'undefined' && typeof workerData[flag] !== 'boolean')
        || (typeof mergedData[flag] !== 'undefined' && typeof mergedData[flag] !== 'boolean')
      ) return false;
    }
    const workerTree = typeof workerData.treeRouting === 'undefined'
      ? {}
      : (isRoutingRecord(workerData.treeRouting)
        ? workerData.treeRouting
        : null);
    const mergedTree = typeof mergedData.treeRouting === 'undefined'
      ? {}
      : (isRoutingRecord(mergedData.treeRouting)
        ? mergedData.treeRouting
        : null);
    if (!workerTree || !mergedTree) return false;
    const workerEffectiveSource = routingToken(workerTree.effectiveSourceHandle);
    const workerEffectiveTarget = routingToken(workerTree.effectiveTargetHandle);
    const mergedEffectiveSource = routingToken(mergedTree.effectiveSourceHandle);
    const mergedEffectiveTarget = routingToken(mergedTree.effectiveTargetHandle);
    if (
      workerEffectiveSource === null
      || workerEffectiveTarget === null
      || mergedEffectiveSource === null
      || mergedEffectiveTarget === null
      || workerEffectiveSource !== mergedEffectiveSource
      || workerEffectiveTarget !== mergedEffectiveTarget
      || !routesHaveExactPath(workerData.computedPath, mergedData.computedPath, true, pointBudget)
      || !routesHaveExactPath(workerData.elkPath, mergedData.elkPath, false, pointBudget)
      || !routesHaveExactPath(workerTree.points, mergedTree.points, false, pointBudget)
    ) return false;
  }
  return true;
};

const mergeBaseReactFlowDisplayCandidateEntry = (
  sourceEdges: Edge[],
  cacheEntry: BaseReactFlowDisplayEdgesCacheEntry,
  sanitizePatches: (sourceEdges: Edge[], patches: RoutingPatch[]) => RoutingPatch[] | null,
): Edge[] | null => {
  if (cacheEntry.hardClean !== true) return null;
  const safePatches = sanitizePatches(sourceEdges, cacheEntry.edges);
  if (!safePatches) return null;
  const merged = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, safePatches);
  if (!merged) return null;
  return baseReactFlowDisplayOutputRouteSignatureMatches(
    merged,
    cacheEntry.outputRouteSignature,
  ) ? merged : null;
};

export const mergeTrustedBaseReactFlowDisplayCacheEntry = (
  sourceEdges: Edge[],
  cacheEntry: BaseReactFlowDisplayEdgesCacheEntry,
): Edge[] | null => mergeBaseReactFlowDisplayCandidateEntry(
  sourceEdges,
  cacheEntry,
  sanitizeBaseReactFlowDisplayCachePatches,
);

export const mergeBaseReactFlowDocumentCandidateEntry = (
  sourceEdges: Edge[],
  candidate: BaseReactFlowDisplayEdgesCacheEntry,
): Edge[] | null => mergeBaseReactFlowDisplayCandidateEntry(
  sourceEdges,
  candidate,
  sanitizeBaseReactFlowDocumentCandidatePatches,
);
