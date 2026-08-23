import type { Edge } from '@xyflow/react';

import { edgeRoutingQualityIntentToken } from './edgeRoutingQualityIntent';
import { getEdgePath } from './edgeDisplayMicroCleanupGeometry';

const DEFAULT_MAX_ENTRIES = 128;
const MAX_ENTRIES = 512;
const MAX_EDGES = 300;
const MAX_TOTAL_POINTS = 200_000;
const MAX_STRING_LENGTH = 500;

const isBoundedString = (value: unknown): value is string => (
  typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING_LENGTH
);

export const createDisplayMicroCleanupInputSignature = (
  edges: readonly Edge[],
): string | null => {
  if (!Array.isArray(edges) || edges.length === 0 || edges.length > MAX_EDGES) return null;
  const parts: string[] = [];
  let totalPoints = 0;
  for (const edge of edges) {
    if (
      !edge
      || !isBoundedString(edge.id)
      || !isBoundedString(edge.source)
      || !isBoundedString(edge.target)
      || (edge.sourceHandle != null && typeof edge.sourceHandle !== 'string')
      || (edge.targetHandle != null && typeof edge.targetHandle !== 'string')
    ) return null;
    const path = getEdgePath(edge);
    if (path.length < 2) return null;
    totalPoints += path.length;
    if (totalPoints > MAX_TOTAL_POINTS) return null;
    const pathTokens: string[] = [];
    for (const point of path) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      pathTokens.push(`${Object.is(point.x, -0) ? 0 : point.x},${Object.is(point.y, -0) ? 0 : point.y}`);
    }
    parts.push(JSON.stringify([
      edge.id,
      edge.source,
      edge.target,
      edge.sourceHandle ?? '',
      edge.targetHandle ?? '',
      edgeRoutingQualityIntentToken(edge),
      pathTokens,
    ]));
  }
  return parts.join('\u001e');
};

export const createDisplayMicroCleanupNoopCacheKey = (
  edges: readonly Edge[],
  candidateEdgeIndexes: readonly number[] | null,
  allowCompoundRepairs: boolean,
): string | null => {
  const inputSignature = createDisplayMicroCleanupInputSignature(edges);
  if (!inputSignature) return null;
  const normalizedIndexes = candidateEdgeIndexes === null
    ? null
    : [...new Set(candidateEdgeIndexes)]
      .filter(index => Number.isSafeInteger(index) && index >= 0 && index < edges.length)
      .sort((first, second) => first - second);
  const scope = normalizedIndexes && normalizedIndexes.length < edges.length
    ? normalizedIndexes
    : null;
  return JSON.stringify([
    allowCompoundRepairs,
    scope,
    inputSignature,
  ]);
};

export type DisplayMicroCleanupNoopCache = Readonly<{
  has: (signature: string) => boolean;
  remember: (signature: string) => void;
  size: () => number;
}>;

export const createDisplayMicroCleanupNoopCache = (
  requestedMaxEntries = DEFAULT_MAX_ENTRIES,
): DisplayMicroCleanupNoopCache => {
  const maxEntries = Number.isSafeInteger(requestedMaxEntries) && requestedMaxEntries > 0
    ? Math.min(requestedMaxEntries, MAX_ENTRIES)
    : DEFAULT_MAX_ENTRIES;
  const entries = new Map<string, true>();
  return {
    has(signature) {
      if (!entries.has(signature)) return false;
      entries.delete(signature);
      entries.set(signature, true);
      return true;
    },
    remember(signature) {
      if (entries.has(signature)) entries.delete(signature);
      entries.set(signature, true);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (typeof oldest !== 'string') break;
        entries.delete(oldest);
      }
    },
    size: () => entries.size,
  };
};
