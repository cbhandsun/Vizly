import type { Edge } from '@xyflow/react';

import { EDGE_ROUTING_CACHE_VERSION } from './routingVersion';
import { parseRoutingLineHops } from './routingLineHops';
import { ROUTING_IDENTIFIER_MAX_LENGTH } from './routingBoundaryLimits';

export const PERSISTED_ROUTING_CANDIDATE_SCHEMA = 'vizly-routing-only-candidate-v1';
export const ROUTING_ONLY_DOCUMENT_SNAPSHOT_SCHEMA = 'vizly-routing-only-document-v1';

const MAX_PATCHES = 300;
const MAX_TOKEN_LENGTH = 20_000;
const MAX_PATH_POINTS = 2_000;
const MAX_TOTAL_PATH_POINTS = 200_000;
const MAX_COORDINATE = 1_000_000_000;
const INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;
const OUTPUT_SIGNATURE_PATTERN = /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/;
const GEOMETRY_DIGEST_PATTERN = /^geometry-v1:[0-9a-f]{32}$/;
const PATCH_KEYS = new Set([
  'id',
  'source',
  'target',
  'type',
  'sourceHandle',
  'targetHandle',
  'data',
]);
const DATA_KEYS = new Set(['computedPath', 'elkPath', 'treeRouting', 'h']);
const TREE_KEYS = new Set(['effectiveSourceHandle', 'effectiveTargetHandle', 'points']);
const POINT_KEYS = new Set(['x', 'y']);
const CANDIDATE_KEYS = new Set([
  'schema',
  'routingVersion',
  'inputSignature',
  'inputGeometryDigest',
  'writtenAt',
  'hardClean',
  'outputRouteSignature',
  'patches',
]);
const DOCUMENT_KEYS = new Set(['schema', 'candidate']);

export type PersistedRoutingCandidate = Readonly<{
  schema: typeof PERSISTED_ROUTING_CANDIDATE_SCHEMA;
  routingVersion: string;
  inputSignature: string;
  inputGeometryDigest: string;
  writtenAt: number;
  hardClean: true;
  outputRouteSignature: string;
  patches: Edge[];
}>;

export type PersistedRoutingCandidateExpectation = Readonly<{
  routingVersion: string;
  inputSignature: string;
  inputGeometryDigest?: string;
}>;

export type RoutingOnlyDocumentSnapshot = Readonly<{
  schema: typeof ROUTING_ONLY_DOCUMENT_SNAPSHOT_SCHEMA;
  candidate: PersistedRoutingCandidate;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOnlyKeys = (value: Record<string, unknown>, keys: ReadonlySet<string>): boolean => (
  Object.keys(value).every(key => keys.has(key))
);

const isIdentifier = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= ROUTING_IDENTIFIER_MAX_LENGTH
);

const parseToken = (value: unknown): string | null | undefined => {
  if (typeof value === 'undefined') return undefined;
  if (value === null) return null;
  return typeof value === 'string' && value.length <= MAX_TOKEN_LENGTH ? value : undefined;
};

const parsePath = (value: unknown): Array<{ x: number; y: number }> | null => {
  if (!Array.isArray(value) || value.length > MAX_PATH_POINTS) return null;
  const path: Array<{ x: number; y: number }> = [];
  for (const point of value) {
    if (
      !isRecord(point)
      || Object.keys(point).length !== 2
      || !hasOnlyKeys(point, POINT_KEYS)
      || typeof point.x !== 'number'
      || !Number.isFinite(point.x)
      || Math.abs(point.x) > MAX_COORDINATE
      || typeof point.y !== 'number'
      || !Number.isFinite(point.y)
      || Math.abs(point.y) > MAX_COORDINATE
    ) return null;
    path.push({ x: point.x, y: point.y });
  }
  return path;
};

const parsePatch = (
  value: unknown,
  pointBudget: { total: number },
): Edge | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, PATCH_KEYS)) return null;
  if (!isIdentifier(value.id) || !isIdentifier(value.source) || !isIdentifier(value.target)) {
    return null;
  }
  const patch: Record<string, unknown> = {
    id: value.id,
    source: value.source,
    target: value.target,
  };
  for (const key of ['type', 'sourceHandle', 'targetHandle'] as const) {
    if (!(key in value)) continue;
    const token = parseToken(value[key]);
    if (typeof token === 'undefined') return null;
    patch[key] = token;
  }
  if ('data' in value) {
    if (!isRecord(value.data) || !hasOnlyKeys(value.data, DATA_KEYS)) return null;
    const data: Record<string, unknown> = {};
    for (const key of ['computedPath', 'elkPath'] as const) {
      if (!(key in value.data)) continue;
      const path = parsePath(value.data[key]);
      if (!path || (key === 'computedPath' && path.length < 2)) return null;
      pointBudget.total += path.length;
      if (pointBudget.total > MAX_TOTAL_PATH_POINTS) return null;
      data[key] = path;
    }
    if ('h' in value.data) {
      const lineHops = parseRoutingLineHops(value.data.h);
      if (!lineHops) return null;
      data.h = lineHops;
    }
    if ('treeRouting' in value.data) {
      if (!isRecord(value.data.treeRouting) || !hasOnlyKeys(value.data.treeRouting, TREE_KEYS)) {
        return null;
      }
      const tree: Record<string, unknown> = {};
      for (const key of ['effectiveSourceHandle', 'effectiveTargetHandle'] as const) {
        if (!(key in value.data.treeRouting)) continue;
        const token = parseToken(value.data.treeRouting[key]);
        if (typeof token === 'undefined') return null;
        tree[key] = token;
      }
      if ('points' in value.data.treeRouting) {
        const points = parsePath(value.data.treeRouting.points);
        if (!points) return null;
        pointBudget.total += points.length;
        if (pointBudget.total > MAX_TOTAL_PATH_POINTS) return null;
        tree.points = points;
      }
      data.treeRouting = tree;
    }
    patch.data = data;
  }
  return patch as unknown as Edge;
};

const parseStructurallyValidCandidate = (
  value: unknown,
  routingVersion: string,
): PersistedRoutingCandidate | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, CANDIDATE_KEYS)) return null;
  if (
    value.schema !== PERSISTED_ROUTING_CANDIDATE_SCHEMA
    || value.routingVersion !== routingVersion
    || typeof value.inputSignature !== 'string'
    || !INPUT_SIGNATURE_PATTERN.test(value.inputSignature)
    || typeof value.inputGeometryDigest !== 'string'
    || !GEOMETRY_DIGEST_PATTERN.test(value.inputGeometryDigest)
    || !Number.isSafeInteger(value.writtenAt)
    || (value.writtenAt as number) < 0
    || value.hardClean !== true
    || typeof value.outputRouteSignature !== 'string'
    || !OUTPUT_SIGNATURE_PATTERN.test(value.outputRouteSignature)
    || !Array.isArray(value.patches)
    || value.patches.length === 0
    || value.patches.length > MAX_PATCHES
  ) return null;
  const pointBudget = { total: 0 };
  const patches = value.patches.map(patch => parsePatch(patch, pointBudget));
  if (patches.some(patch => patch === null)) return null;
  return {
    schema: PERSISTED_ROUTING_CANDIDATE_SCHEMA,
    routingVersion,
    inputSignature: value.inputSignature,
    inputGeometryDigest: value.inputGeometryDigest,
    writtenAt: value.writtenAt as number,
    hardClean: true,
    outputRouteSignature: value.outputRouteSignature,
    patches: patches as Edge[],
  };
};

export const parsePersistedRoutingCandidate = (
  value: unknown,
  expectation: PersistedRoutingCandidateExpectation,
): PersistedRoutingCandidate | null => {
  const candidate = parseStructurallyValidCandidate(value, expectation.routingVersion);
  if (
    !candidate
    || candidate.inputSignature !== expectation.inputSignature
    || (
      expectation.inputGeometryDigest !== undefined
      && candidate.inputGeometryDigest !== expectation.inputGeometryDigest
    )
  ) return null;
  return candidate;
};

export const createPersistedRoutingCandidate = ({
  routingVersion,
  inputSignature,
  inputGeometryDigest,
  outputRouteSignature,
  patches,
  writtenAt = Date.now(),
}: {
  routingVersion: string;
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  patches: Edge[];
  writtenAt?: number;
}): PersistedRoutingCandidate | null => parsePersistedRoutingCandidate({
  schema: PERSISTED_ROUTING_CANDIDATE_SCHEMA,
  routingVersion,
  inputSignature,
  inputGeometryDigest,
  writtenAt,
  hardClean: true,
  outputRouteSignature,
  patches,
}, { routingVersion, inputSignature, inputGeometryDigest });

export const parseRoutingOnlyDocumentSnapshot = (
  value: unknown,
): RoutingOnlyDocumentSnapshot | null => {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, DOCUMENT_KEYS)
    || value.schema !== ROUTING_ONLY_DOCUMENT_SNAPSHOT_SCHEMA
  ) return null;
  const candidate = parseStructurallyValidCandidate(
    value.candidate,
    EDGE_ROUTING_CACHE_VERSION,
  );
  return candidate
    ? { schema: ROUTING_ONLY_DOCUMENT_SNAPSHOT_SCHEMA, candidate }
    : null;
};

export const createRoutingOnlyDocumentSnapshot = (
  candidate: PersistedRoutingCandidate,
): RoutingOnlyDocumentSnapshot | null => parseRoutingOnlyDocumentSnapshot({
  schema: ROUTING_ONLY_DOCUMENT_SNAPSHOT_SCHEMA,
  candidate,
});
