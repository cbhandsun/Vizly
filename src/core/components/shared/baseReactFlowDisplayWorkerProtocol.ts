import type { Edge, Node } from '@xyflow/react';

import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  DISPLAY_ROUTING_PHASE_NAMES,
  DISPLAY_ROUTING_PHASE_RESOLUTIONS,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import type { BaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';

const MAX_REQUEST_ID_LENGTH = 4_096;
export const DISPLAY_WORKER_MAX_GRAPH_ITEMS = 10_000;
const MAX_IDENTIFIER_LENGTH = 20_000;
const MAX_SMART_EDGE_PADDING = 10_000;
export const DISPLAY_WORKER_MAX_PATH_POINTS = 2_000;
export const DISPLAY_WORKER_MAX_TOTAL_PATH_POINTS = 200_000;
export const DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE = 1_000_000_000;
const MAX_VALUE_DEPTH = 8;
const MAX_ARRAY_ITEMS = 2_000;
const MAX_OBJECT_KEYS = 120;
const MAX_TOTAL_DATA_VALUES = 1_000_000;
const MAX_STRING_LENGTH = 20_000;
const MAX_QUALITY_METRIC = 1_000_000_000_000_000;
const INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;
const GEOMETRY_DIGEST_PATTERN = /^geometry-v1:[0-9a-f]{32}$/;
const OUTPUT_ROUTE_SIGNATURE_PATTERN = /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/;
const ROUTING_CHANGE_REASONS = new Set([
  'node-drag',
  'node-resize',
  'node-add',
  'node-remove',
  'edge-add',
  'edge-remove',
  'port-policy',
  'container-change',
  'layout',
  'unknown',
]);

const DISPLAY_EDGE_KEYS = new Set([
  'id',
  'source',
  'target',
  'sourceHandle',
  'targetHandle',
  'type',
  'label',
  'animated',
  'style',
  'markerStart',
  'markerEnd',
  'data',
]);
const DISPLAY_NODE_KEYS = new Set([
  'id',
  'type',
  'parentId',
  'position',
  'positionAbsolute',
  'width',
  'height',
  'measured',
  'style',
  'data',
]);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const QUALITY_KEYS = [
  'nonOrthogonalSegments',
  'strictCrossings',
  'reverseOverlap',
  'unrelatedOverlap',
  'relatedOverlap',
  'unexplainedRelatedOverlap',
  'shortEndpointStubs',
  'tinyInteriorDoglegs',
  'hairpins',
  'backtrackPenalty',
  'detourPenalty',
  'bends',
  'totalLength',
] as const;

export type DisplayQualityMode = 'full' | 'interactive';
export type DisplayEdgesWorkerCandidateSource = 'persistent' | 'precompiled';
export type DisplayEdgesWorkerRouteResolution =
  | 'validated-candidate'
  | 'repaired-candidate'
  | 'incremental-route'
  | 'full-route'
  | 'full-route-repaired'
  | 'repair';

export type DisplayEdgesWorkerRouteRequest = {
  operation: 'route';
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  qualityMode: DisplayQualityMode;
};

export type DisplayEdgesWorkerValidateOrRouteRequest = Omit<
  DisplayEdgesWorkerRouteRequest,
  'operation'
> & {
  operation: 'validate-or-route';
  /** Legacy full candidate. New clients send routing-only patches instead. */
  candidateEdges?: Edge[] | null;
  /** Null means the routing-only candidate failed protocol validation. */
  candidatePatches?: Edge[] | null;
  candidateSource: DisplayEdgesWorkerCandidateSource;
};

export type DisplayEdgesWorkerRepairRequest = {
  operation: 'repair';
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  /**
   * Bounded repair performs only the measured, local repair pass. Finalized
   * repair additionally runs the commercial safety closure and is reserved for
   * callers that have not already paid for a full route/finalization pass.
   */
  repairMode: 'bounded' | 'finalized';
};

export type DisplayEdgesWorkerIncrementalRouteRequest = Omit<
  DisplayEdgesWorkerRouteRequest,
  'operation'
> & {
  operation: 'incremental-route';
  baselineInputSignature: string;
  baselineInputGeometryDigest: string;
  baselineNodes: Node[];
  baselineSourceEdges: Edge[];
  baselinePatches: Edge[];
  baselineOutputRouteSignature: string;
  nextInputSignature: string;
  nextInputGeometryDigest: string;
  changeSet: BaseReactFlowRoutingChangeSet;
  mutableEdgeIds: string[];
  contextEdgeIds: string[];
};

export type DisplayEdgesWorkerRequest =
  | DisplayEdgesWorkerRouteRequest
  | DisplayEdgesWorkerValidateOrRouteRequest
  | DisplayEdgesWorkerIncrementalRouteRequest
  | DisplayEdgesWorkerRepairRequest;

export type DisplayRoutingFallbackLevel = 'none' | 'full';

export type DisplayEdgesWorkerResponse = {
  requestId: string;
  edges?: Edge[];
  hardClean?: boolean;
  hardReport?: BaseDisplayBoundedCandidateReport;
  routeResolution?: DisplayEdgesWorkerRouteResolution;
  error?: string;
  boundedCandidate?: BaseDisplayBoundedCandidateReport;
  phaseTrace?: DisplayRoutingPhaseTrace[];
  phaseProgress?: DisplayRoutingPhaseTrace;
  affectedEdgeCount?: number;
  fallbackLevel?: DisplayRoutingFallbackLevel;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isBoundedString = (value: unknown, maximumLength: number): value is string => (
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength
);

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const isFiniteCoordinate = (value: unknown): value is number => (
  isFiniteNumber(value) && Math.abs(value) <= DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE
);

const isFinitePoint = (value: unknown): boolean => (
  isRecord(value)
  && Object.keys(value).every(key => key === 'x' || key === 'y')
  && isFiniteCoordinate(value.x)
  && isFiniteCoordinate(value.y)
);

type DisplayValueBudget = {
  dataValues: number;
  pathPoints: number;
  ancestors: WeakSet<object>;
};

const createDisplayValueBudget = (): DisplayValueBudget => ({
  dataValues: 0,
  pathPoints: 0,
  ancestors: new WeakSet<object>(),
});

const isSafeDisplayValue = (
  value: unknown,
  budget: DisplayValueBudget,
  depth = 0,
): boolean => {
  budget.dataValues += 1;
  if (budget.dataValues > MAX_TOTAL_DATA_VALUES) return false;
  if (value == null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= MAX_STRING_LENGTH;
  if (typeof value !== 'object' || depth >= MAX_VALUE_DEPTH) return false;
  if (!Array.isArray(value) && !isRecord(value)) return false;
  if (budget.ancestors.has(value)) return false;
  budget.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.length <= MAX_ARRAY_ITEMS
        && value.every(item => isSafeDisplayValue(item, budget, depth + 1));
    }
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length <= MAX_OBJECT_KEYS
      && entries.every(([key, item]) => (
        !UNSAFE_OBJECT_KEYS.has(key)
        && isSafeDisplayValue(item, budget, depth + 1)
      ));
  } finally {
    budget.ancestors.delete(value);
  }
};

const isBoundedPath = (value: unknown, budget: DisplayValueBudget): boolean => {
  if (!Array.isArray(value) || value.length > DISPLAY_WORKER_MAX_PATH_POINTS) return false;
  budget.pathPoints += value.length;
  return budget.pathPoints <= DISPLAY_WORKER_MAX_TOTAL_PATH_POINTS
    && value.every(isFinitePoint);
};

const hasSafeDisplayEdgePaths = (
  value: Record<string, unknown>,
  budget: DisplayValueBudget,
): boolean => {
  for (const flag of ['sharedTrunkSynthesized', 'sharedTrunkAware', 'isTreeBus'] as const) {
    if (typeof value[flag] !== 'undefined' && typeof value[flag] !== 'boolean') return false;
  }
  if (typeof value.computedPath !== 'undefined' && !isBoundedPath(value.computedPath, budget)) return false;
  if (typeof value.elkPath !== 'undefined' && !isBoundedPath(value.elkPath, budget)) return false;
  if (typeof value.treeRouting !== 'undefined') {
    if (!isRecord(value.treeRouting)) return false;
    if (
      !isOptionalBoundedString(value.treeRouting.effectiveSourceHandle)
      || !isOptionalBoundedString(value.treeRouting.effectiveTargetHandle)
    ) return false;
    if (
      typeof value.treeRouting.points !== 'undefined'
      && !isBoundedPath(value.treeRouting.points, budget)
    ) return false;
  }
  return true;
};

const isOptionalBoundedString = (value: unknown): boolean => (
  value == null || (typeof value === 'string' && value.length <= MAX_IDENTIFIER_LENGTH)
);

const isDisplayEdge = (value: unknown, budget: DisplayValueBudget): value is Edge => {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every(key => DISPLAY_EDGE_KEYS.has(key))) return false;
  if (
    !isBoundedString(value.id, MAX_IDENTIFIER_LENGTH)
    || !isBoundedString(value.source, MAX_IDENTIFIER_LENGTH)
    || !isBoundedString(value.target, MAX_IDENTIFIER_LENGTH)
  ) return false;
  if (
    !isOptionalBoundedString(value.sourceHandle)
    || !isOptionalBoundedString(value.targetHandle)
    || !isOptionalBoundedString(value.type)
  ) return false;
  if (typeof value.animated !== 'undefined' && typeof value.animated !== 'boolean') return false;
  for (const field of ['label', 'style', 'markerStart', 'markerEnd'] as const) {
    if (typeof value[field] !== 'undefined' && !isSafeDisplayValue(value[field], budget)) return false;
  }
  if (typeof value.data === 'undefined' || value.data === null) return true;
  return isRecord(value.data)
    && isSafeDisplayValue(value.data, budget)
    && hasSafeDisplayEdgePaths(value.data, budget);
};

const isSafeDimensionNumber = (value: unknown): value is number => (
  isFiniteNumber(value)
  && value >= 0
  && value <= DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE
);

const isSafeStyleDimension = (value: unknown): boolean => {
  if (typeof value === 'undefined') return true;
  if (isSafeDimensionNumber(value)) return true;
  if (typeof value !== 'string' || value.length === 0 || value.length > 100) return false;
  const match = value.trim().match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)?$/i);
  return Boolean(match) && Number.parseFloat(value) <= DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE;
};

const hasSafeDimensions = (
  value: unknown,
  allowCssString: boolean,
): boolean => {
  if (typeof value === 'undefined') return true;
  if (!isRecord(value) || !Object.keys(value).every(key => key === 'width' || key === 'height')) return false;
  return ['width', 'height'].every((key) => {
    const dimension = value[key];
    return typeof dimension === 'undefined'
      || (allowCssString ? isSafeStyleDimension(dimension) : isSafeDimensionNumber(dimension));
  });
};

const isDisplayNode = (value: unknown, budget: DisplayValueBudget): value is Node => {
  if (!isRecord(value) || !isBoundedString(value.id, MAX_IDENTIFIER_LENGTH)) return false;
  if (!Object.keys(value).every(key => DISPLAY_NODE_KEYS.has(key))) return false;
  if (!isOptionalBoundedString(value.type) || !isOptionalBoundedString(value.parentId)) return false;
  if (!isFinitePoint(value.position)) return false;
  if (typeof value.positionAbsolute !== 'undefined' && !isFinitePoint(value.positionAbsolute)) return false;
  if (typeof value.width !== 'undefined' && !isSafeDimensionNumber(value.width)) return false;
  if (typeof value.height !== 'undefined' && !isSafeDimensionNumber(value.height)) return false;
  if (!hasSafeDimensions(value.measured, false) || !hasSafeDimensions(value.style, true)) return false;
  if (typeof value.data !== 'undefined') {
    if (!isRecord(value.data) || !isSafeDisplayValue(value.data, budget)) return false;
  }
  return true;
};

export const isDisplayEdgesWorkerEdgeList = (value: unknown): value is Edge[] => {
  if (!Array.isArray(value) || value.length > DISPLAY_WORKER_MAX_GRAPH_ITEMS) return false;
  const budget = createDisplayValueBudget();
  return value.every(edge => isDisplayEdge(edge, budget));
};

const isDisplayGraph = (
  edges: unknown,
  nodes: unknown,
): edges is Edge[] => (
  Array.isArray(edges)
  && Array.isArray(nodes)
  && edges.length <= DISPLAY_WORKER_MAX_GRAPH_ITEMS
  && nodes.length <= DISPLAY_WORKER_MAX_GRAPH_ITEMS
  && (() => {
    const budget = createDisplayValueBudget();
    return edges.every(edge => isDisplayEdge(edge, budget))
      && nodes.every(node => isDisplayNode(node, budget));
  })()
);

export const readDisplayEdgesWorkerRequestId = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  return isBoundedString(value.requestId, MAX_REQUEST_ID_LENGTH) ? value.requestId : null;
};

const parseBoundedIdentifierList = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.length > DISPLAY_WORKER_MAX_GRAPH_ITEMS) return null;
  const identifiers = new Set<string>();
  for (const item of value) {
    if (!isBoundedString(item, MAX_IDENTIFIER_LENGTH) || identifiers.has(item)) return null;
    identifiers.add(item);
  }
  return [...identifiers];
};

const parseRoutingChangeSet = (value: unknown): BaseReactFlowRoutingChangeSet | null => {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== 5
    || !keys.every(key => (
      key === 'reason'
      || key === 'changedNodeIds'
      || key === 'changedEdgeIds'
      || key === 'topologyChanged'
      || key === 'geometryChanged'
    ))
    || typeof value.reason !== 'string'
    || !ROUTING_CHANGE_REASONS.has(value.reason)
    || typeof value.topologyChanged !== 'boolean'
    || typeof value.geometryChanged !== 'boolean'
  ) return null;
  const changedNodeIds = parseBoundedIdentifierList(value.changedNodeIds);
  const changedEdgeIds = parseBoundedIdentifierList(value.changedEdgeIds);
  if (!changedNodeIds || !changedEdgeIds) return null;
  return {
    reason: value.reason as BaseReactFlowRoutingChangeSet['reason'],
    changedNodeIds,
    changedEdgeIds,
    topologyChanged: value.topologyChanged,
    geometryChanged: value.geometryChanged,
  };
};

/**
 * Treats worker messages as an external boundary. The main thread already
 * projects graph values before posting; this parser rejects malformed roots,
 * oversized graphs, non-finite geometry, and invalid protocol variants before
 * routing code can observe them.
 */
export const parseDisplayEdgesWorkerRequest = (
  value: unknown,
): DisplayEdgesWorkerRequest | null => {
  if (!isRecord(value)) return null;
  const requestId = readDisplayEdgesWorkerRequestId(value);
  if (!requestId || !isDisplayGraph(value.edges, value.nodes)) return null;
  const edges = value.edges as Edge[];
  const nodes = value.nodes as Node[];
  if (value.operation === 'repair') {
    if (value.repairMode !== 'bounded' && value.repairMode !== 'finalized') return null;
    return {
      operation: 'repair',
      requestId,
      edges,
      nodes,
      repairMode: value.repairMode,
    };
  }
  if (
    value.operation !== 'route'
    && value.operation !== 'validate-or-route'
    && value.operation !== 'incremental-route'
  ) return null;
  if (typeof value.enableSmartEdges !== 'boolean') return null;
  if (typeof value.isLargeGraph !== 'boolean') return null;
  if (
    !isFiniteNumber(value.smartEdgePadding)
    || value.smartEdgePadding < 0
    || value.smartEdgePadding > MAX_SMART_EDGE_PADDING
  ) return null;
  if (
    !Number.isSafeInteger(value.displayEdgeEpoch)
    || (value.displayEdgeEpoch as number) < 0
  ) return null;
  if (value.qualityMode !== 'full' && value.qualityMode !== 'interactive') return null;
  const routeRequest: Omit<DisplayEdgesWorkerRouteRequest, 'operation'> = {
    requestId,
    edges,
    nodes,
    enableSmartEdges: value.enableSmartEdges,
    smartEdgePadding: value.smartEdgePadding,
    isLargeGraph: value.isLargeGraph,
    displayEdgeEpoch: value.displayEdgeEpoch as number,
    qualityMode: value.qualityMode,
  };
  if (value.operation === 'incremental-route') {
    const changeSet = parseRoutingChangeSet(value.changeSet);
    const mutableEdgeIds = parseBoundedIdentifierList(value.mutableEdgeIds);
    const contextEdgeIds = parseBoundedIdentifierList(value.contextEdgeIds);
    if (
      !INPUT_SIGNATURE_PATTERN.test(String(value.baselineInputSignature ?? ''))
      || !GEOMETRY_DIGEST_PATTERN.test(String(value.baselineInputGeometryDigest ?? ''))
      || !OUTPUT_ROUTE_SIGNATURE_PATTERN.test(String(value.baselineOutputRouteSignature ?? ''))
      || !INPUT_SIGNATURE_PATTERN.test(String(value.nextInputSignature ?? ''))
      || !GEOMETRY_DIGEST_PATTERN.test(String(value.nextInputGeometryDigest ?? ''))
      || !isDisplayGraph(value.baselineSourceEdges, value.baselineNodes)
      || !isDisplayEdgesWorkerEdgeList(value.baselinePatches)
      || !changeSet
      || !mutableEdgeIds
      || !contextEdgeIds
    ) return null;
    return {
      ...routeRequest,
      operation: 'incremental-route',
      baselineInputSignature: value.baselineInputSignature as string,
      baselineInputGeometryDigest: value.baselineInputGeometryDigest as string,
      baselineNodes: value.baselineNodes as Node[],
      baselineSourceEdges: value.baselineSourceEdges as Edge[],
      baselinePatches: value.baselinePatches,
      baselineOutputRouteSignature: value.baselineOutputRouteSignature as string,
      nextInputSignature: value.nextInputSignature as string,
      nextInputGeometryDigest: value.nextInputGeometryDigest as string,
      changeSet,
      mutableEdgeIds,
      contextEdgeIds,
    };
  }
  if (value.operation === 'validate-or-route') {
    if (value.candidateSource !== 'persistent' && value.candidateSource !== 'precompiled') {
      return null;
    }
    if (
      typeof value.candidateEdges !== 'undefined'
      && typeof value.candidatePatches !== 'undefined'
    ) return null;
    return {
      ...routeRequest,
      operation: 'validate-or-route',
      candidateSource: value.candidateSource,
      candidateEdges: isDisplayEdgesWorkerEdgeList(value.candidateEdges)
        ? value.candidateEdges
        : null,
      candidatePatches: isDisplayEdgesWorkerEdgeList(value.candidatePatches)
        ? value.candidatePatches
        : null,
    };
  }
  return { ...routeRequest, operation: 'route' };
};

const isBoundedCandidate = (value: unknown): value is BaseDisplayBoundedCandidateReport => {
  if (!isRecord(value)) return false;
  const quality = value.quality;
  if (!((value.candidate === 'terminal-lane' || value.candidate === 'polished')
    && typeof value.hardClean === 'boolean'
    && typeof value.terminalsAttached === 'boolean'
    && typeof value.terminalsAnchored === 'boolean'
    && isFiniteNumber(value.obstacleHits)
    && value.obstacleHits >= 0
    && value.obstacleHits <= MAX_QUALITY_METRIC
    && isRecord(quality))) return false;
  const qualityKeys = Object.keys(quality);
  if (
    qualityKeys.length !== QUALITY_KEYS.length
    || !qualityKeys.every(key => (QUALITY_KEYS as readonly string[]).includes(key))
    || !QUALITY_KEYS.every((key) => {
      const metric = quality[key];
      return isFiniteNumber(metric) && metric >= 0 && metric <= MAX_QUALITY_METRIC;
    })
  ) return false;
  const clearanceViolations = value.minimumClearanceViolations;
  if (
    typeof clearanceViolations !== 'undefined'
    && (
      !Number.isSafeInteger(clearanceViolations)
      || (clearanceViolations as number) < 0
      || (clearanceViolations as number) > DISPLAY_WORKER_MAX_GRAPH_ITEMS
    )
  ) return false;
  const clearanceEdgeIds = value.minimumClearanceViolationEdgeIds;
  if (
    typeof clearanceEdgeIds !== 'undefined'
    && (
      !Array.isArray(clearanceEdgeIds)
      || clearanceEdgeIds.length > 32
      || !clearanceEdgeIds.every(edgeId => isBoundedString(edgeId, MAX_IDENTIFIER_LENGTH))
    )
  ) return false;
  const pairs = value.unrelatedOverlapPairs;
  if (typeof pairs === 'undefined') return true;
  return Array.isArray(pairs)
    && pairs.length <= DISPLAY_WORKER_MAX_GRAPH_ITEMS
    && pairs.every(pair => (
      isRecord(pair)
      && isBoundedString(pair.firstId, MAX_IDENTIFIER_LENGTH)
      && isBoundedString(pair.secondId, MAX_IDENTIFIER_LENGTH)
      && isFiniteNumber(pair.overlap)
      && pair.overlap >= 0
      && pair.overlap <= MAX_QUALITY_METRIC
    ));
};

const isDisplayRoutingPhaseTrace = (value: unknown): value is DisplayRoutingPhaseTrace => {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 5
    && keys.every(key => (
      key === 'phase'
      || key === 'durationMs'
      || key === 'candidateCount'
      || key === 'changedEdgeCount'
      || key === 'resolution'
    ))
    && (DISPLAY_ROUTING_PHASE_NAMES as readonly unknown[]).includes(value.phase)
    && (DISPLAY_ROUTING_PHASE_RESOLUTIONS as readonly unknown[]).includes(value.resolution)
    && isFiniteNumber(value.durationMs)
    && value.durationMs >= 0
    && value.durationMs <= 600_000
    && Number.isSafeInteger(value.candidateCount)
    && (value.candidateCount as number) >= 0
    && (value.candidateCount as number) <= 1_000_000
    && Number.isSafeInteger(value.changedEdgeCount)
    && (value.changedEdgeCount as number) >= 0
    && (value.changedEdgeCount as number) <= 1_000_000;
};

const parseDisplayRoutingPhaseTrace = (
  value: unknown,
): DisplayRoutingPhaseTrace[] | null => (
  Array.isArray(value)
  && value.length <= 32
  && value.every(isDisplayRoutingPhaseTrace)
    ? value
    : null
);

/** Validates a response before the main thread merges worker-owned geometry. */
export const parseDisplayEdgesWorkerResponse = (
  value: unknown,
  expectedRequestId: string,
): DisplayEdgesWorkerResponse | null => {
  if (!isRecord(value) || value.requestId !== expectedRequestId) return null;
  const hasError = typeof value.error !== 'undefined';
  const hasBoundedCandidate = typeof value.boundedCandidate !== 'undefined';
  const hasEdges = typeof value.edges !== 'undefined';
  const hasPhaseProgress = typeof value.phaseProgress !== 'undefined';
  if (
    Number(hasError)
    + Number(hasBoundedCandidate)
    + Number(hasEdges)
    + Number(hasPhaseProgress) !== 1
  ) return null;
  if (hasError) {
    if (
      typeof value.routeResolution !== 'undefined'
      || typeof value.hardReport !== 'undefined'
      || typeof value.phaseTrace !== 'undefined'
      || typeof value.phaseProgress !== 'undefined'
      || typeof value.affectedEdgeCount !== 'undefined'
      || typeof value.fallbackLevel !== 'undefined'
    ) return null;
    if (typeof value.error !== 'string') return null;
    return value.error.length > 0 && value.error.length <= 256
      ? { requestId: expectedRequestId, error: value.error }
      : null;
  }
  if (hasBoundedCandidate) {
    if (
      typeof value.hardClean !== 'undefined'
      || typeof value.hardReport !== 'undefined'
      || typeof value.routeResolution !== 'undefined'
      || typeof value.phaseTrace !== 'undefined'
      || typeof value.phaseProgress !== 'undefined'
      || typeof value.affectedEdgeCount !== 'undefined'
      || typeof value.fallbackLevel !== 'undefined'
    ) return null;
    return isBoundedCandidate(value.boundedCandidate)
      ? { requestId: expectedRequestId, boundedCandidate: value.boundedCandidate }
      : null;
  }
  if (hasPhaseProgress) {
    if (
      typeof value.hardClean !== 'undefined'
      || typeof value.hardReport !== 'undefined'
      || typeof value.routeResolution !== 'undefined'
      || typeof value.phaseTrace !== 'undefined'
      || typeof value.affectedEdgeCount !== 'undefined'
      || typeof value.fallbackLevel !== 'undefined'
    ) return null;
    return isDisplayRoutingPhaseTrace(value.phaseProgress)
      ? { requestId: expectedRequestId, phaseProgress: value.phaseProgress }
      : null;
  }
  const phaseTrace = typeof value.phaseTrace === 'undefined'
    ? []
    : parseDisplayRoutingPhaseTrace(value.phaseTrace);
  const hardReport = typeof value.hardReport === 'undefined'
    ? undefined
    : (isBoundedCandidate(value.hardReport) ? value.hardReport : null);
  const hasIncrementalMetadata = typeof value.affectedEdgeCount !== 'undefined'
    || typeof value.fallbackLevel !== 'undefined';
  const incrementalMetadataIsValid = !hasIncrementalMetadata || (
    Number.isSafeInteger(value.affectedEdgeCount)
    && (value.affectedEdgeCount as number) >= 0
    && (value.affectedEdgeCount as number) <= DISPLAY_WORKER_MAX_GRAPH_ITEMS
    && (value.fallbackLevel === 'none' || value.fallbackLevel === 'full')
  );
  if (
    !isDisplayEdgesWorkerEdgeList(value.edges)
    || !phaseTrace
    || hardReport === null
    || !incrementalMetadataIsValid
    || typeof value.hardClean !== 'boolean'
    || (hardReport !== undefined && hardReport.hardClean !== value.hardClean)
    || (
      value.routeResolution !== 'validated-candidate'
      && value.routeResolution !== 'repaired-candidate'
      && value.routeResolution !== 'incremental-route'
      && value.routeResolution !== 'full-route'
      && value.routeResolution !== 'full-route-repaired'
      && value.routeResolution !== 'repair'
    )
  ) return null;
  return {
    requestId: expectedRequestId,
    edges: value.edges,
    hardClean: value.hardClean,
    hardReport,
    routeResolution: value.routeResolution,
    phaseTrace,
    affectedEdgeCount: hasIncrementalMetadata
      ? value.affectedEdgeCount as number
      : undefined,
    fallbackLevel: hasIncrementalMetadata
      ? value.fallbackLevel as DisplayRoutingFallbackLevel
      : undefined,
  };
};
