import type { StandardDiagramData, StandardEdgeData, StandardNodeData, ThemeMetadata, LayoutMetadata } from '../models/DiagramModels';

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
    const v = value as any;
    if (typeof v.title === 'string' && typeof v.details === 'string') {
      return `${v.title}\n${v.details}`;
    }
  }
  return '';
};

const coerceNode = (node: any, index: number): StandardNodeData | null => {
  if (!node || typeof node !== 'object') return null;
  const id = typeof node.id === 'string' && node.id ? node.id : `node-${index}`;
  // 支持 ReactFlow Node 格式：data.label / data.description
  const desc = coerceDescription(
    node.description ?? node.label ?? node.text ??
    node.data?.description ?? node.data?.label ?? node.data?.text
  );
  const domain = typeof node.domain === 'string' && node.domain ? node.domain
    : (typeof node.data?.domain === 'string' && node.data.domain ? node.data.domain : 'default');
  const type = typeof node.type === 'string' && node.type ? node.type : 'flowchart';
  return { ...node, id, description: desc, domain, type } as StandardNodeData;
};

const coerceEdge = (edge: any, index: number): StandardEdgeData | null => {
  if (!edge || typeof edge !== 'object') return null;
  const id = typeof edge.id === 'string' && edge.id ? edge.id : `edge-${index}`;
  const source = typeof edge.source === 'string' ? edge.source : '';
  const target = typeof edge.target === 'string' ? edge.target : '';
  if (!source || !target) return null;
  return { ...edge, id, source, target } as StandardEdgeData;
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
  const isObject = Boolean(input && typeof input === 'object');
  const raw: any = isObject ? input : {};

  if (!isObject) {
    issues.push({ level: 'error', message: 'content is not an object' });
  }

  const id = typeof raw.id === 'string' && raw.id ? raw.id : fallback.id;
  const name =
    (typeof raw.name === 'string' && raw.name) ||
    (typeof raw.title === 'string' && raw.title) ||
    (typeof raw.metadata?.title === 'string' && raw.metadata.title) ||
    fallback.title ||
    id;
  const type = (typeof raw.type === 'string' && raw.type) ? raw.type : 'custom';

  const nodesRaw = Array.isArray(raw.nodes) ? raw.nodes : [];
  const edgesRaw = Array.isArray(raw.edges) ? raw.edges : [];

  const nodes = nodesRaw.map(coerceNode).filter(Boolean) as StandardNodeData[];
  const edges = edgesRaw.map(coerceEdge).filter(Boolean) as StandardEdgeData[];

  if (!(typeof raw.name === 'string' && raw.name) && !(typeof raw.title === 'string' && raw.title) && !(typeof raw.metadata?.title === 'string' && raw.metadata.title)) {
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
  }
  if (nodes.length === 0) {
    issues.push({ level: 'warn', message: 'no valid nodes' });
  } else {
    const emptyDesc = nodes.filter(n => !String(n.description || '').trim()).length;
    if (emptyDesc > 0) issues.push({ level: 'warn', message: `nodes missing description: ${emptyDesc}` });
    const defaultDomain = nodes.filter(n => String((n as any).domain) === 'default').length;
    if (defaultDomain > 0) issues.push({ level: 'warn', message: `nodes missing domain: ${defaultDomain}` });
  }

  if (!Array.isArray(raw.edges)) {
    issues.push({ level: 'warn', message: 'edges is not an array' });
  } else {
    const dropped = edgesRaw.length - edges.length;
    if (dropped > 0) issues.push({ level: 'warn', message: `edges dropped (missing source/target): ${dropped}` });
  }

  const version = typeof raw.version === 'string' && raw.version ? raw.version : '1.0.0';
  const layout = raw.layout && typeof raw.layout === 'object' ? (raw.layout as LayoutMetadata) : defaultLayout();
  const theme = raw.theme && typeof raw.theme === 'object' ? (raw.theme as ThemeMetadata) : defaultTheme();

  const diagram = {
    ...raw,
    id,
    name,
    type,
    version,
    nodes,
    edges,
    layout,
    theme
  } as StandardDiagramData;

  return { diagram, issues };
};

export const coerceToStandardDiagramData = (input: unknown, fallback: { id: string; title?: string }): StandardDiagramData => {
  return coerceToStandardDiagramDataWithReport(input, fallback).diagram;
};
