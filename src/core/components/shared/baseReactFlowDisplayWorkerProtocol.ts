import type { Edge, Node } from '@xyflow/react';

import { ROUTING_IDENTIFIER_MAX_LENGTH } from '../../routing/routingBoundaryLimits';
import type { RoutingPatch } from '../../routing/routingPatch';
import { isDisplayWorkerBoundedCandidateReport } from './baseReactFlowDisplayWorkerQualityProtocol';
import {
  isDisplayRoutingPhaseTrace,
  parseDisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayWorkerTraceProtocol';
import type { BaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';
import {
  parseDisplayRoutingChangeSet,
  parseDisplayRoutingIdentifierList,
} from './baseReactFlowDisplayRoutingChangeProtocol';
import {
  displayRoutingIdentitiesMatch,
  isDisplayRoutingIdentity,
  isDisplayRoutingWorkerSessionRef,
  type RoutingIdentity,
  type RoutingWorkerSessionRef,
} from './baseReactFlowDisplayRoutingSession';
import type {
  DisplayEdgesWorkerResponse,
  DisplayRoutingFallbackLevel,
} from './baseReactFlowDisplayWorkerResponseProtocol';
import { parseDisplayRoutingWorkerCommitReceipt } from './baseReactFlowDisplayWorkerCommitReceipt';
import { computeDisplayRoutingHardReportDigest } from './baseReactFlowDisplayHardReportDigest';
import {
  parseDisplayWorkerLayoutRepairRequest,
  type DisplayEdgesWorkerRepairRequest,
  type DisplayEdgesWorkerRepairValidateOrRouteRequest,
  type DisplayEdgesWorkerValidatedRepairRequest,
  type DisplayEdgesWorkerValidatedRepairValidateRequest,
} from './baseReactFlowDisplayWorkerLayoutProtocol';

export type {
  DisplayEdgesWorkerRepairRequest,
  DisplayEdgesWorkerRepairValidateOrRouteRequest,
} from './baseReactFlowDisplayWorkerLayoutProtocol';

export type {
  DisplayEdgesWorkerResponse,
  DisplayEdgesWorkerRouteResolution,
  DisplayRoutingFallbackLevel,
} from './baseReactFlowDisplayWorkerResponseProtocol';

const MAX_REQUEST_ID_LENGTH = 4_096;
export const DISPLAY_WORKER_MAX_GRAPH_ITEMS = 10_000;
const MAX_SMART_EDGE_PADDING = 10_000;
export const DISPLAY_WORKER_MAX_PATH_POINTS = 2_000;
export const DISPLAY_WORKER_MAX_TOTAL_PATH_POINTS = 200_000;
export const DISPLAY_WORKER_MAX_COORDINATE_MAGNITUDE = 1_000_000_000;
const MAX_VALUE_DEPTH = 8;
const MAX_ARRAY_ITEMS = 2_000;
const MAX_OBJECT_KEYS = 120;
const MAX_TOTAL_DATA_VALUES = 1_000_000;
const MAX_STRING_LENGTH = 20_000;
const INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;
const GEOMETRY_DIGEST_PATTERN = /^geometry-v1:[0-9a-f]{32}$/;
const OUTPUT_ROUTE_SIGNATURE_PATTERN = /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/;

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
  'hidden',
  'position',
  'positionAbsolute',
  'width',
  'height',
  'measured',
  'style',
  'data',
]);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export type DisplayQualityMode = 'full' | 'interactive';
export type DisplayEdgesWorkerCandidateSource = 'document' | 'persistent' | 'precompiled';
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
  inputIdentity?: RoutingIdentity;
};

export type DisplayEdgesWorkerValidateOrRouteRequest = Omit<
  DisplayEdgesWorkerRouteRequest,
  'operation'
> & {
  operation: 'validate-or-route';
  /** Legacy full candidate. New clients send routing-only patches instead. */
  candidateEdges?: Edge[] | null;
  /** Null means the routing-only candidate failed protocol validation. */
  candidatePatches?: RoutingPatch[] | null;
  candidateSource: DisplayEdgesWorkerCandidateSource;
};

export type DisplayEdgesWorkerIncrementalRouteRequest = Omit<
  DisplayEdgesWorkerRouteRequest,
  'operation'
> & {
  operation: 'incremental-route';
  baselineSessionRef?: RoutingWorkerSessionRef;
  baselineInputSignature: string;
  baselineInputGeometryDigest: string;
  baselineNodes?: Node[];
  baselineSourceEdges?: Edge[];
  baselinePatches?: RoutingPatch[];
  baselineOutputRouteSignature: string;
  nextInputSignature: string;
  nextInputGeometryDigest: string;
  changeSet: BaseReactFlowRoutingChangeSet;
  mutableEdgeIds: string[];
  contextEdgeIds: string[];
};

export type DisplayEdgesWorkerResolvedIncrementalRouteRequest =
  DisplayEdgesWorkerIncrementalRouteRequest & Required<Pick<
    DisplayEdgesWorkerIncrementalRouteRequest,
    'baselineNodes' | 'baselineSourceEdges' | 'baselinePatches'
  >>;

export type DisplayEdgesWorkerRequest =
  | DisplayEdgesWorkerRouteRequest
  | DisplayEdgesWorkerValidateOrRouteRequest
  | DisplayEdgesWorkerRepairValidateOrRouteRequest
  | DisplayEdgesWorkerIncrementalRouteRequest
  | DisplayEdgesWorkerRepairRequest;

/**
 * A request that has crossed the Worker protocol boundary. Pure routing tests
 * may omit identity when they do not publish a session, but production
 * transport only exposes this validated form to the Worker computation.
 */
type DisplayEdgesWorkerValidatedRouteRequest = Omit<
  DisplayEdgesWorkerRouteRequest,
  'inputIdentity'
> & { inputIdentity: RoutingIdentity };
type DisplayEdgesWorkerValidatedValidateRequest = Omit<
  DisplayEdgesWorkerValidateOrRouteRequest,
  'inputIdentity'
> & { inputIdentity: RoutingIdentity };
type DisplayEdgesWorkerValidatedIncrementalRequest = Omit<
  DisplayEdgesWorkerIncrementalRouteRequest,
  'inputIdentity'
> & { inputIdentity: RoutingIdentity };
export type DisplayEdgesWorkerValidatedRequest =
  | DisplayEdgesWorkerValidatedRouteRequest
  | DisplayEdgesWorkerValidatedValidateRequest
  | DisplayEdgesWorkerValidatedRepairValidateRequest
  | DisplayEdgesWorkerValidatedIncrementalRequest
  | DisplayEdgesWorkerValidatedRepairRequest;

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
  for (const flag of [
    'sharedTrunkSynthesized',
    'sharedTrunkAware',
    'isTreeBus',
    'overextendedTargetTrunkCorridorReclaimed',
  ] as const) {
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
  value == null || (
    typeof value === 'string'
    && value.length <= ROUTING_IDENTIFIER_MAX_LENGTH
  )
);

const isDisplayEdge = (value: unknown, budget: DisplayValueBudget): value is Edge => {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every(key => DISPLAY_EDGE_KEYS.has(key))) return false;
  if (
    !isBoundedString(value.id, ROUTING_IDENTIFIER_MAX_LENGTH)
    || !isBoundedString(value.source, ROUTING_IDENTIFIER_MAX_LENGTH)
    || !isBoundedString(value.target, ROUTING_IDENTIFIER_MAX_LENGTH)
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
  if (
    !isRecord(value)
    || !isBoundedString(value.id, ROUTING_IDENTIFIER_MAX_LENGTH)
  ) return false;
  if (!Object.keys(value).every(key => DISPLAY_NODE_KEYS.has(key))) return false;
  if (!isOptionalBoundedString(value.type) || !isOptionalBoundedString(value.parentId)) return false;
  if (typeof value.hidden !== 'undefined' && typeof value.hidden !== 'boolean') return false;
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

/**
 * Treats worker messages as an external boundary. The main thread already
 * projects graph values before posting; this parser rejects malformed roots,
 * oversized graphs, non-finite geometry, and invalid protocol variants before
 * routing code can observe them.
 */
export const parseDisplayEdgesWorkerRequest = (
  value: unknown,
): DisplayEdgesWorkerValidatedRequest | null => {
  if (!isRecord(value)) return null;
  const requestId = readDisplayEdgesWorkerRequestId(value);
  if (!requestId || !isDisplayGraph(value.edges, value.nodes)) return null;
  const edges = value.edges as Edge[];
  const nodes = value.nodes as Node[];
  if (value.operation === 'repair') {
    if (
      (value.repairMode !== 'bounded' && value.repairMode !== 'finalized')
      || (
        value.stopAfterObstacleFailure !== undefined
        && typeof value.stopAfterObstacleFailure !== 'boolean'
      )
      || (value.stopAfterObstacleFailure === true && value.repairMode !== 'bounded')
      || !isDisplayRoutingIdentity(value.inputIdentity)
    ) return null;
    return {
      operation: 'repair',
      requestId,
      edges,
      nodes,
      inputIdentity: value.inputIdentity,
      repairMode: value.repairMode,
      stopAfterObstacleFailure: value.stopAfterObstacleFailure === true,
    };
  }
  if (
    value.operation !== 'route'
    && value.operation !== 'validate-or-route'
    && value.operation !== 'repair-validate-or-route'
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
  if (!isDisplayRoutingIdentity(value.inputIdentity)) return null;
  const routeRequest: Omit<DisplayEdgesWorkerValidatedRouteRequest, 'operation'> = {
    requestId,
    edges,
    nodes,
    enableSmartEdges: value.enableSmartEdges,
    smartEdgePadding: value.smartEdgePadding,
    isLargeGraph: value.isLargeGraph,
    displayEdgeEpoch: value.displayEdgeEpoch as number,
    qualityMode: value.qualityMode,
    inputIdentity: value.inputIdentity,
  };
  if (value.operation === 'repair-validate-or-route') {
    return parseDisplayWorkerLayoutRepairRequest({
      value,
      routeFields: routeRequest,
      isEdgeList: isDisplayEdgesWorkerEdgeList,
    });
  }
  if (value.operation === 'incremental-route') {
    const changeSet = parseDisplayRoutingChangeSet(value.changeSet);
    const mutableEdgeIds = parseDisplayRoutingIdentifierList(value.mutableEdgeIds);
    const contextEdgeIds = parseDisplayRoutingIdentifierList(value.contextEdgeIds);
    const baselineSessionRef = typeof value.baselineSessionRef === 'undefined'
      ? undefined
      : (isDisplayRoutingWorkerSessionRef(value.baselineSessionRef)
        ? value.baselineSessionRef
        : null);
    const baselineFieldPresence = [
      value.baselineNodes,
      value.baselineSourceEdges,
      value.baselinePatches,
    ].map(field => typeof field !== 'undefined');
    const hasCompleteBootstrap = baselineFieldPresence.every(Boolean)
      && isDisplayGraph(value.baselineSourceEdges, value.baselineNodes)
      && isDisplayEdgesWorkerEdgeList(value.baselinePatches);
    const hasPartialBootstrap = baselineFieldPresence.some(Boolean)
      && !baselineFieldPresence.every(Boolean);
    if (
      !INPUT_SIGNATURE_PATTERN.test(String(value.baselineInputSignature ?? ''))
      || !GEOMETRY_DIGEST_PATTERN.test(String(value.baselineInputGeometryDigest ?? ''))
      || !OUTPUT_ROUTE_SIGNATURE_PATTERN.test(String(value.baselineOutputRouteSignature ?? ''))
      || !INPUT_SIGNATURE_PATTERN.test(String(value.nextInputSignature ?? ''))
      || !GEOMETRY_DIGEST_PATTERN.test(String(value.nextInputGeometryDigest ?? ''))
      || baselineSessionRef === null
      || hasPartialBootstrap
      || (!baselineSessionRef && !hasCompleteBootstrap)
      || !changeSet
      || !mutableEdgeIds
      || !contextEdgeIds
    ) return null;
    return {
      ...routeRequest,
      operation: 'incremental-route',
      ...(baselineSessionRef ? { baselineSessionRef } : {}),
      baselineInputSignature: value.baselineInputSignature as string,
      baselineInputGeometryDigest: value.baselineInputGeometryDigest as string,
      ...(hasCompleteBootstrap ? {
        baselineNodes: value.baselineNodes as Node[],
        baselineSourceEdges: value.baselineSourceEdges as Edge[],
        baselinePatches: value.baselinePatches as RoutingPatch[],
      } : {}),
      baselineOutputRouteSignature: value.baselineOutputRouteSignature as string,
      nextInputSignature: value.nextInputSignature as string,
      nextInputGeometryDigest: value.nextInputGeometryDigest as string,
      changeSet,
      mutableEdgeIds,
      contextEdgeIds,
    };
  }
  if (value.operation === 'validate-or-route') {
    if (value.candidateSource !== 'document' && value.candidateSource !== 'persistent' && value.candidateSource !== 'precompiled') {
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

/** Validates a response before the main thread merges worker-owned geometry. */
export const parseDisplayEdgesWorkerResponse = (
  value: unknown,
  expectedRequestId: string,
): DisplayEdgesWorkerResponse | null => {
  if (!isRecord(value) || value.requestId !== expectedRequestId) return null;
  const hasError = typeof value.error !== 'undefined';
  const hasBoundedCandidate = typeof value.boundedCandidate !== 'undefined';
  const hasEdges = typeof value.edges !== 'undefined';
  const hasRoutingPatches = typeof value.routingPatches !== 'undefined';
  const hasPhaseProgress = typeof value.phaseProgress !== 'undefined';
  if (
    Number(hasError)
    + Number(hasBoundedCandidate)
    + Number(hasEdges)
    + Number(hasRoutingPatches)
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
      || typeof value.nextIdentity !== 'undefined'
      || typeof value.outputRouteSignature !== 'undefined'
      || typeof value.sessionRef !== 'undefined'
      || typeof value.commitReceipt !== 'undefined'
      || typeof value.workerDurationMs !== 'undefined'
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
      || typeof value.nextIdentity !== 'undefined'
      || typeof value.outputRouteSignature !== 'undefined'
      || typeof value.sessionRef !== 'undefined'
      || typeof value.commitReceipt !== 'undefined'
      || typeof value.workerDurationMs !== 'undefined'
    ) return null;
    return isDisplayWorkerBoundedCandidateReport(value.boundedCandidate)
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
      || typeof value.nextIdentity !== 'undefined'
      || typeof value.outputRouteSignature !== 'undefined'
      || typeof value.sessionRef !== 'undefined'
      || typeof value.commitReceipt !== 'undefined'
      || typeof value.workerDurationMs !== 'undefined'
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
    : (isDisplayWorkerBoundedCandidateReport(value.hardReport) ? value.hardReport : null);
  const workerDurationMs = typeof value.workerDurationMs === 'undefined'
    ? undefined
    : value.workerDurationMs;
  const hasIncrementalMetadata = typeof value.affectedEdgeCount !== 'undefined'
    || typeof value.fallbackLevel !== 'undefined';
  const incrementalMetadataIsValid = !hasIncrementalMetadata || (
    Number.isSafeInteger(value.affectedEdgeCount)
    && (value.affectedEdgeCount as number) >= 0
    && (value.affectedEdgeCount as number) <= DISPLAY_WORKER_MAX_GRAPH_ITEMS
    && (value.fallbackLevel === 'none' || value.fallbackLevel === 'full')
  );
  const hasSessionMetadata = typeof value.nextIdentity !== 'undefined'
    || typeof value.outputRouteSignature !== 'undefined'
    || typeof value.sessionRef !== 'undefined'
    || typeof value.commitReceipt !== 'undefined';
  const commitReceipt = typeof value.commitReceipt === 'undefined'
    ? undefined
    : parseDisplayRoutingWorkerCommitReceipt(value.commitReceipt);
  const sessionMetadataIsValid = !hasSessionMetadata || (
    isDisplayRoutingIdentity(value.nextIdentity)
    && OUTPUT_ROUTE_SIGNATURE_PATTERN.test(String(value.outputRouteSignature ?? ''))
    && isDisplayRoutingWorkerSessionRef(value.sessionRef)
    && displayRoutingIdentitiesMatch(value.sessionRef.identity, value.nextIdentity)
    && value.sessionRef.outputRouteSignature === value.outputRouteSignature
    && commitReceipt !== null
    && (
      typeof commitReceipt === 'undefined'
      || (
        displayRoutingIdentitiesMatch(commitReceipt.identity, value.nextIdentity)
        && commitReceipt.outputRouteSignature === value.outputRouteSignature
        && commitReceipt.sessionRef.sessionId === value.sessionRef.sessionId
        && commitReceipt.hardReportDigest
          === computeDisplayRoutingHardReportDigest(hardReport ?? commitReceipt.hardReport)
      )
    )
  );
  if (
    !(hasEdges
      ? isDisplayEdgesWorkerEdgeList(value.edges)
      : isDisplayEdgesWorkerEdgeList(value.routingPatches))
    || !phaseTrace
    || hardReport === null
    || hardReport === undefined
    || (workerDurationMs !== undefined && (
      !isFiniteNumber(workerDurationMs)
      || workerDurationMs < 0
      || workerDurationMs > 600_000
    ))
    || !incrementalMetadataIsValid
    || !sessionMetadataIsValid
    || typeof value.hardClean !== 'boolean'
    || hardReport.hardClean !== value.hardClean
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
    edges: hasEdges ? value.edges as Edge[] : undefined,
    routingPatches: hasRoutingPatches ? value.routingPatches as RoutingPatch[] : undefined,
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
    nextIdentity: hasSessionMetadata ? value.nextIdentity as RoutingIdentity : undefined,
    outputRouteSignature: hasSessionMetadata ? value.outputRouteSignature as string : undefined,
    sessionRef: hasSessionMetadata ? value.sessionRef as RoutingWorkerSessionRef : undefined,
    commitReceipt: commitReceipt ?? undefined,
    workerDurationMs,
  };
};

/**
 * Main-thread commit boundary. Progress, error, and rejected final responses
 * remain parseable, while a hard-clean geometry result must carry the complete
 * current-version receipt issued by the Worker session.
 */
export const parseDisplayEdgesWorkerCommitResponse = (
  value: unknown,
  expectedRequestId: string,
): DisplayEdgesWorkerResponse | null => {
  const response = parseDisplayEdgesWorkerResponse(value, expectedRequestId);
  if (!response || response.hardClean !== true) return response;
  return response.commitReceipt ? response : null;
};
