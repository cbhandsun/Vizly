import type {
  GroupNodeData,
  LayoutMetadata,
  StandardDiagramData,
  StandardEdgeData,
  StandardNodeData,
  ThemeMetadata,
} from '../models/DiagramModels';
import { parseRoutingOnlyDocumentSnapshot } from '../routing/persistedRoutingCandidate';

export type CoerceIssueLevel = 'warn' | 'error';

export interface CoerceIssue {
  level: CoerceIssueLevel;
  message: string;
}

export interface CoerceReport {
  diagram: StandardDiagramData;
  issues: CoerceIssue[];
}

const coerceDescription = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.title === 'string' && typeof v.details === 'string') {
      return `${v.title}\n${v.details}`;
    }
  }
  return '';
};

const MAX_STANDARD_DIAGRAM_NODES = 5_000;
const MAX_STANDARD_DIAGRAM_EDGES = 10_000;
export const MAX_STANDARD_DIAGRAM_GROUPS = 2_000;
const MAX_STANDARD_DIAGRAM_ID_CHARS = 256;
const MAX_STANDARD_DIAGRAM_TEXT_CHARS = 20_000;
const MAX_STANDARD_DIAGRAM_DEPTH = 10;
const MAX_STANDARD_DIAGRAM_OBJECT_KEYS = 200;
const MAX_STANDARD_DIAGRAM_ARRAY_ITEMS = 10_000;
const BLOCKED_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const BLOCKED_IDENTIFIER_VALUES = new Set(['__proto__', 'prototype', 'constructor']);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );

const sanitizeJsonValue = (value: unknown, depth = 0): unknown => {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.slice(0, MAX_STANDARD_DIAGRAM_TEXT_CHARS);

  if (Array.isArray(value)) {
    if (depth >= MAX_STANDARD_DIAGRAM_DEPTH) return [];
    return value
      .slice(0, MAX_STANDARD_DIAGRAM_ARRAY_ITEMS)
      .map(item => sanitizeJsonValue(item, depth + 1))
      .filter(item => item !== undefined);
  }

  if (!isPlainRecord(value) || depth >= MAX_STANDARD_DIAGRAM_DEPTH) return {};

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_STANDARD_DIAGRAM_OBJECT_KEYS)) {
    if (!key || BLOCKED_JSON_KEYS.has(key)) continue;
    const safeValue = sanitizeJsonValue(nestedValue, depth + 1);
    if (safeValue !== undefined) sanitized[key] = safeValue;
  }

  return sanitized;
};

const sanitizeRecord = (value: unknown): Record<string, unknown> | null => {
  const sanitized = sanitizeJsonValue(value);
  return isPlainRecord(sanitized) ? sanitized : null;
};

const coerceBoundedString = (value: unknown, fallback: string, maxChars = MAX_STANDARD_DIAGRAM_ID_CHARS): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, maxChars);
  return trimmed || fallback;
};

const coerceSafeIdentifier = (value: unknown, fallback: string): string => {
  const identifier = coerceBoundedString(value, fallback);
  return BLOCKED_IDENTIFIER_VALUES.has(identifier) ? fallback : identifier;
};

const coerceNode = (
  node: unknown,
  index: number,
  diagramType: StandardDiagramData['type'],
): StandardNodeData | null => {
  const safeNode = sanitizeRecord(node);
  if (!safeNode) return null;

  const nodeData = sanitizeRecord(safeNode.data) ?? {};
  const id = coerceSafeIdentifier(safeNode.id, `node-${index}`);
  // 支持 ReactFlow Node 格式：data.label / data.description
  const desc = coerceDescription(
    safeNode.description ?? safeNode.label ?? safeNode.text ??
    nodeData.description ?? nodeData.label ?? nodeData.text
  ).slice(0, MAX_STANDARD_DIAGRAM_TEXT_CHARS);
  const domain = coerceBoundedString(safeNode.domain ?? nodeData.domain, 'default');
  const rawType = coerceBoundedString(safeNode.type, 'flowchart');
  // Early workspace timeline seeds used the diagram-level `timeline` type for
  // React Flow nodes. The registered renderer and timeline editor use
  // `timelineNode`, so migrate that bounded legacy shape at the input boundary.
  const type = diagramType === 'timeline' && rawType === 'timeline'
    ? 'timelineNode'
    : rawType;
  return { ...safeNode, id, description: desc, domain, type, data: nodeData } as StandardNodeData;
};

const coerceFiniteNumber = (value: unknown, fallback: number, min: number, max: number): number => (
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
);

const coerceGroup = (group: unknown, index: number): GroupNodeData | null => {
  const safeGroup = sanitizeRecord(group);
  if (!safeGroup) return null;

  const id = coerceSafeIdentifier(safeGroup.id, `group-${index}`);
  const data = sanitizeRecord(safeGroup.data) ?? {};
  const metadata = sanitizeRecord(safeGroup.metadata) ?? {};
  const rawPosition = sanitizeRecord(safeGroup.position);
  const rawCanvasPosition = sanitizeRecord(metadata.canvasPosition) ?? rawPosition;
  const position = {
    x: coerceFiniteNumber(rawPosition?.x, 0, -10_000_000, 10_000_000),
    y: coerceFiniteNumber(rawPosition?.y, 0, -10_000_000, 10_000_000),
  };
  const canvasPosition = {
    x: coerceFiniteNumber(rawCanvasPosition?.x, position.x, -10_000_000, 10_000_000),
    y: coerceFiniteNumber(rawCanvasPosition?.y, position.y, -10_000_000, 10_000_000),
  };
  const rawMeasured = sanitizeRecord(safeGroup.measured);
  const measured = {
    width: coerceFiniteNumber(rawMeasured?.width, 400, 1, 1_000_000),
    height: coerceFiniteNumber(rawMeasured?.height, 300, 1, 1_000_000),
  };

  return {
    ...safeGroup,
    id,
    description: coerceDescription(
      safeGroup.description ?? safeGroup.label ?? data.description ?? data.label
    ).slice(0, MAX_STANDARD_DIAGRAM_TEXT_CHARS),
    domain: coerceBoundedString(safeGroup.domain ?? data.domain, 'default'),
    type: coerceBoundedString(safeGroup.type, 'group'),
    data,
    metadata: { ...metadata, canvasPosition },
    position,
    measured,
  } as GroupNodeData;
};

const coerceEdge = (edge: unknown, index: number, nodeIds: Set<string>): StandardEdgeData | null => {
  const safeEdge = sanitizeRecord(edge);
  if (!safeEdge) return null;
  const id = coerceSafeIdentifier(safeEdge.id, `edge-${index}`);
  const source = coerceSafeIdentifier(safeEdge.source, '');
  const target = coerceSafeIdentifier(safeEdge.target, '');
  if (!source || !target) return null;
  if (!nodeIds.has(source) || !nodeIds.has(target)) return null;
  return { ...safeEdge, id, source, target } as StandardEdgeData;
};

const defaultLayout = (): LayoutMetadata => ({
  type: 'custom',
  direction: 'LR',
  spacing: { horizontal: 180, vertical: 120 },
  padding: { horizontal: 24, vertical: 24 }
});

const defaultTheme = (): ThemeMetadata => ({
  name: 'default',
  displayName: 'Default',
  domains: {}
});

export const coerceToStandardDiagramDataWithReport = (
  input: unknown,
  fallback: { id: string; title?: string }
): CoerceReport => {
  const issues: CoerceIssue[] = [];
  const isObject = isPlainRecord(input);
  const raw = sanitizeRecord(input) ?? {};
  const rawMetadata = sanitizeRecord(raw.metadata);

  if (!isObject) {
    issues.push({ level: 'error', message: 'content is not an object' });
  }

  const id = coerceSafeIdentifier(raw.id, fallback.id);
  const name =
    coerceBoundedString(raw.name, '', 160) ||
    coerceBoundedString(raw.title, '', 160) ||
    coerceBoundedString(rawMetadata?.title, '', 160) ||
    fallback.title ||
    id;
  const type = coerceBoundedString(raw.type, 'custom') as StandardDiagramData['type'];

  const nodesRaw = Array.isArray(raw.nodes) ? raw.nodes.slice(0, MAX_STANDARD_DIAGRAM_NODES) : [];
  const edgesRaw = Array.isArray(raw.edges) ? raw.edges.slice(0, MAX_STANDARD_DIAGRAM_EDGES) : [];
  const groupsRaw = Array.isArray(raw.groups) ? raw.groups.slice(0, MAX_STANDARD_DIAGRAM_GROUPS) : [];

  const nodes = nodesRaw
    .map((node, index) => coerceNode(node, index, type))
    .filter(Boolean) as StandardNodeData[];
  const nodeIds = new Set(nodes.map(node => node.id));
  const edges = edgesRaw.map((edge, index) => coerceEdge(edge, index, nodeIds)).filter(Boolean) as StandardEdgeData[];
  const groups = groupsRaw.map(coerceGroup).filter(Boolean) as GroupNodeData[];

  if (!(typeof raw.name === 'string' && raw.name) && !(typeof raw.title === 'string' && raw.title) && !(typeof rawMetadata?.title === 'string' && rawMetadata.title)) {
    issues.push({ level: 'warn', message: 'missing name/title' });
  }
  if (!(typeof raw.type === 'string' && raw.type)) {
    issues.push({ level: 'warn', message: 'missing type' });
  }
  if (!(typeof raw.version === 'string' && raw.version)) {
    issues.push({ level: 'warn', message: 'missing version' });
  }
  if (!(raw.layout && typeof raw.layout === 'object')) {
    issues.push({ level: 'warn', message: 'missing layout' });
  }
  if (!(raw.theme && typeof raw.theme === 'object')) {
    issues.push({ level: 'warn', message: 'missing theme' });
  }

  if (!Array.isArray(raw.nodes)) {
    issues.push({ level: 'error', message: 'nodes is not an array' });
  } else if (raw.nodes.length > MAX_STANDARD_DIAGRAM_NODES) {
    issues.push({ level: 'warn', message: `nodes truncated to ${MAX_STANDARD_DIAGRAM_NODES}` });
  }
  if (nodes.length === 0) {
    issues.push({ level: 'warn', message: 'no valid nodes' });
  } else {
    const emptyDesc = nodes.filter(n => !String(n.description || '').trim()).length;
    if (emptyDesc > 0) issues.push({ level: 'warn', message: `nodes missing description: ${emptyDesc}` });
    const defaultDomain = nodes.filter(n => String(n.domain) === 'default').length;
    if (defaultDomain > 0) issues.push({ level: 'warn', message: `nodes missing domain: ${defaultDomain}` });
  }

  if (!Array.isArray(raw.edges)) {
    issues.push({ level: 'warn', message: 'edges is not an array' });
  } else {
    if (raw.edges.length > MAX_STANDARD_DIAGRAM_EDGES) {
      issues.push({ level: 'warn', message: `edges truncated to ${MAX_STANDARD_DIAGRAM_EDGES}` });
    }
    const dropped = edgesRaw.length - edges.length;
    if (dropped > 0) issues.push({ level: 'warn', message: `edges dropped (missing or unknown source/target): ${dropped}` });
  }

  if (raw.groups !== undefined && !Array.isArray(raw.groups)) {
    issues.push({ level: 'warn', message: 'groups is not an array' });
  } else if (Array.isArray(raw.groups) && raw.groups.length > MAX_STANDARD_DIAGRAM_GROUPS) {
    issues.push({ level: 'warn', message: `groups truncated to ${MAX_STANDARD_DIAGRAM_GROUPS}` });
  }

  const version = coerceBoundedString(raw.version, '1.0.0');
  const layout = isPlainRecord(raw.layout) ? ({ ...defaultLayout(), ...raw.layout } as LayoutMetadata) : defaultLayout();
  const theme = isPlainRecord(raw.theme) ? ({ ...defaultTheme(), ...raw.theme } as ThemeMetadata) : defaultTheme();
  const metadata = rawMetadata;
  const config = sanitizeRecord(raw.config);
  const routingSnapshot = parseRoutingOnlyDocumentSnapshot(raw.routingSnapshot);

  const diagram = {
    id,
    name,
    type,
    version,
    nodes,
    edges,
    ...(Array.isArray(raw.groups) ? { groups } : {}),
    layout,
    theme,
    ...(routingSnapshot ? { routingSnapshot } : {}),
    ...(metadata ? { metadata } : {}),
    ...(config ? { config } : {})
  } as StandardDiagramData;

  return { diagram, issues };
};

export const coerceToStandardDiagramData = (input: unknown, fallback: { id: string; title?: string }): StandardDiagramData => {
  return coerceToStandardDiagramDataWithReport(input, fallback).diagram;
};
