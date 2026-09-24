const MAX_DOCUMENT_ID_LENGTH = 180;
const MAX_DOCUMENT_TITLE_LENGTH = 240;
const MAX_ELEMENT_ID_LENGTH = 180;
const MAX_TYPE_LENGTH = 80;
const MAX_NODES = 10_000;
const MAX_EDGES = 20_000;
const MAX_DATA_DEPTH = 10;
const MAX_DATA_KEYS = 200;
const MAX_DATA_ARRAY_ITEMS = 2_000;
const MAX_DATA_STRING_LENGTH = 20_000;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface VizlyPoint {
  x: number;
  y: number;
}

export interface VizlyDocumentNode {
  id: string;
  type?: string;
  position: VizlyPoint;
  parentId?: string;
  data: Record<string, unknown>;
}

export interface VizlyDocumentEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
}

export interface VizlyDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  nodes: VizlyDocumentNode[];
  edges: VizlyDocumentEdge[];
  metadata?: Record<string, unknown>;
}

export type VizlyDocumentParseErrorCode =
  | 'invalid-document'
  | 'invalid-id'
  | 'invalid-title'
  | 'too-many-nodes'
  | 'too-many-edges'
  | 'invalid-node'
  | 'invalid-edge'
  | 'duplicate-node-id'
  | 'duplicate-edge-id'
  | 'missing-edge-endpoint';

export type VizlyDocumentParseResult =
  | { ok: true; value: VizlyDocument }
  | { ok: false; code: VizlyDocumentParseErrorCode; path: string };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null),
);

const boundedString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined;
};

const safeId = (value: unknown): string | undefined => {
  const candidate = boundedString(value, MAX_ELEMENT_ID_LENGTH);
  return candidate && SAFE_ID_PATTERN.test(candidate) ? candidate : undefined;
};

const finiteCoordinate = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10_000_000
    ? value
    : undefined
);

const sanitizeData = (value: unknown, depth = 0): unknown => {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.slice(0, MAX_DATA_STRING_LENGTH);
  if (depth >= MAX_DATA_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_DATA_ARRAY_ITEMS)
      .map(item => sanitizeData(item, depth + 1))
      .filter(item => item !== undefined);
  }
  if (!isRecord(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value).slice(0, MAX_DATA_KEYS)) {
    if (!key || BLOCKED_KEYS.has(key)) continue;
    const safeValue = sanitizeData(nested, depth + 1);
    if (safeValue !== undefined) result[key] = safeValue;
  }
  return result;
};

const parseNode = (value: unknown): VizlyDocumentNode | null => {
  if (!isRecord(value) || !isRecord(value.position)) return null;
  const id = safeId(value.id);
  const x = finiteCoordinate(value.position.x);
  const y = finiteCoordinate(value.position.y);
  if (!id || x === undefined || y === undefined) return null;
  const type = value.type === undefined ? undefined : boundedString(value.type, MAX_TYPE_LENGTH);
  const parentId = value.parentId === undefined ? undefined : safeId(value.parentId);
  if ((value.type !== undefined && !type) || (value.parentId !== undefined && !parentId)) return null;
  const data = sanitizeData(value.data ?? {});
  if (!isRecord(data)) return null;
  return { id, position: { x, y }, data, ...(type ? { type } : {}), ...(parentId ? { parentId } : {}) };
};

const optionalHandle = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return boundedString(value, MAX_ELEMENT_ID_LENGTH);
};

const parseEdge = (value: unknown): VizlyDocumentEdge | null => {
  if (!isRecord(value)) return null;
  const id = safeId(value.id);
  const source = safeId(value.source);
  const target = safeId(value.target);
  const type = value.type === undefined ? undefined : boundedString(value.type, MAX_TYPE_LENGTH);
  const sourceHandle = optionalHandle(value.sourceHandle);
  const targetHandle = optionalHandle(value.targetHandle);
  if (!id || !source || !target) return null;
  if (value.type !== undefined && !type) return null;
  if (value.sourceHandle !== undefined && sourceHandle === undefined) return null;
  if (value.targetHandle !== undefined && targetHandle === undefined) return null;
  const data = value.data === undefined ? undefined : sanitizeData(value.data);
  if (data !== undefined && !isRecord(data)) return null;
  return {
    id,
    source,
    target,
    ...(type ? { type } : {}),
    ...(sourceHandle !== undefined ? { sourceHandle } : {}),
    ...(targetHandle !== undefined ? { targetHandle } : {}),
    ...(data ? { data } : {}),
  };
};

export const parseVizlyDocument = (value: unknown): VizlyDocumentParseResult => {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return { ok: false, code: 'invalid-document', path: '$' };
  }
  const id = boundedString(value.id, MAX_DOCUMENT_ID_LENGTH);
  if (!id || !SAFE_ID_PATTERN.test(id)) return { ok: false, code: 'invalid-id', path: '$.id' };
  const title = boundedString(value.title, MAX_DOCUMENT_TITLE_LENGTH);
  if (!title) return { ok: false, code: 'invalid-title', path: '$.title' };
  if (value.nodes.length > MAX_NODES) return { ok: false, code: 'too-many-nodes', path: '$.nodes' };
  if (value.edges.length > MAX_EDGES) return { ok: false, code: 'too-many-edges', path: '$.edges' };

  const nodes: VizlyDocumentNode[] = [];
  const nodeIds = new Set<string>();
  for (let index = 0; index < value.nodes.length; index += 1) {
    const node = parseNode(value.nodes[index]);
    if (!node) return { ok: false, code: 'invalid-node', path: `$.nodes[${index}]` };
    if (nodeIds.has(node.id)) return { ok: false, code: 'duplicate-node-id', path: `$.nodes[${index}].id` };
    nodeIds.add(node.id);
    nodes.push(node);
  }

  const edges: VizlyDocumentEdge[] = [];
  const edgeIds = new Set<string>();
  for (let index = 0; index < value.edges.length; index += 1) {
    const edge = parseEdge(value.edges[index]);
    if (!edge) return { ok: false, code: 'invalid-edge', path: `$.edges[${index}]` };
    if (edgeIds.has(edge.id)) return { ok: false, code: 'duplicate-edge-id', path: `$.edges[${index}].id` };
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return { ok: false, code: 'missing-edge-endpoint', path: `$.edges[${index}]` };
    }
    edgeIds.add(edge.id);
    edges.push(edge);
  }

  const metadata = value.metadata === undefined ? undefined : sanitizeData(value.metadata);
  if (metadata !== undefined && !isRecord(metadata)) {
    return { ok: false, code: 'invalid-document', path: '$.metadata' };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      id,
      title,
      nodes,
      edges,
      ...(metadata ? { metadata } : {}),
    },
  };
};
