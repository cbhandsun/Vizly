/**
 * diagramDiff — 纯函数：比较两个图表快照，生成差异报告
 *
 * 按 node.id / edge.id 做双向查找，比较关键属性。
 * 输出 DiffResult 供 DiffOverlay 消费。
 */

import type { Edge, Node } from '@xyflow/react';

/** 单个属性的差异 */
export interface PropertyDiff {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

/** 节点/边快照（用于显示已删除的元素） */
export interface ElementSnapshot {
  id: string;
  label?: string;
  position?: { x: number; y: number };
  [key: string]: unknown;
}

/** Diff 结果 */
export interface DiffResult {
  addedNodes: string[];
  removedNodes: ElementSnapshot[];
  modifiedNodes: { id: string; label?: string; changes: PropertyDiff[] }[];
  addedEdges: string[];
  removedEdges: ElementSnapshot[];
  modifiedEdges: { id: string; changes: PropertyDiff[] }[];
  /** 是否有任何差异 */
  hasDiff: boolean;
}

export interface DiffSummaryFormatter {
  node: (count: number) => string;
  edge: (count: number) => string;
  noChanges: string;
}

/** 运行时字段 — 这些字段在 diff 比较中应被忽略 */
const IGNORED_NODE_KEYS = new Set([
  'measured', 'positionAbsolute', '__rel', 'selected', 'dragging',
  'resizing', 'width', 'height', 'sourcePosition', 'targetPosition',
  'hidden', 'internals',
]);

const IGNORED_EDGE_KEYS = new Set([
  'selected', 'hidden', 'interactionWidth', 'markerEnd', 'markerStart',
  'style', 'className', 'animated',
]);

const DIFF_LABEL_MAX_LENGTH = 120;

function normalizeDiffLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const boldTitle = value.match(/<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>/i)?.[1];
  const candidate = boldTitle ?? value;
  const plainText = candidate
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return plainText ? plainText.slice(0, DIFF_LABEL_MAX_LENGTH) : undefined;
}

function resolveNodeDiffLabel(node: Node): string | undefined {
  return normalizeDiffLabel(node.data?.label)
    ?? normalizeDiffLabel(node.data?.title)
    ?? normalizeDiffLabel(node.data?.description);
}

/**
 * 深度比较两个值
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);
  if (keysA.length !== keysB.length) return false;

  return keysA.every(key => deepEqual(recordA[key], recordB[key]));
}

/**
 * 比较两个对象，返回差异属性列表
 */
function diffObject(
  before: object,
  after: object,
  ignoredKeys: Set<string>
): PropertyDiff[] {
  const diffs: PropertyDiff[] = [];
  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);

  for (const key of allKeys) {
    if (ignoredKeys.has(key)) continue;

    const oldVal = beforeRecord[key];
    const newVal = afterRecord[key];

    if (!deepEqual(oldVal, newVal)) {
      diffs.push({ key, oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs;
}

/**
 * 主函数：比较两个图表快照
 */
export function diffDiagrams(
  before: { nodes: Node[]; edges: Edge[] },
  after: { nodes: Node[]; edges: Edge[] }
): DiffResult {
  const result: DiffResult = {
    addedNodes: [],
    removedNodes: [],
    modifiedNodes: [],
    addedEdges: [],
    removedEdges: [],
    modifiedEdges: [],
    hasDiff: false,
  };

  // --- 节点 Diff ---
  const beforeNodeMap = new Map(before.nodes.map(n => [n.id, n]));
  const afterNodeMap = new Map(after.nodes.map(n => [n.id, n]));

  // 新增节点
  for (const node of after.nodes) {
    if (!beforeNodeMap.has(node.id)) {
      result.addedNodes.push(node.id);
    }
  }

  // 删除节点
  for (const node of before.nodes) {
    if (!afterNodeMap.has(node.id)) {
      result.removedNodes.push({
        id: node.id,
        label: resolveNodeDiffLabel(node),
        position: node.position,
      });
    }
  }

  // 修改节点
  for (const node of after.nodes) {
    const prev = beforeNodeMap.get(node.id);
    if (prev) {
      const changes = diffObject(prev, node, IGNORED_NODE_KEYS);
      if (changes.length > 0) {
        result.modifiedNodes.push({
          id: node.id,
          label: resolveNodeDiffLabel(node) ?? resolveNodeDiffLabel(prev),
          changes,
        });
      }
    }
  }

  // --- 边 Diff ---
  const beforeEdgeMap = new Map(before.edges.map(e => [e.id, e]));
  const afterEdgeMap = new Map(after.edges.map(e => [e.id, e]));

  for (const edge of after.edges) {
    if (!beforeEdgeMap.has(edge.id)) {
      result.addedEdges.push(edge.id);
    }
  }

  for (const edge of before.edges) {
    if (!afterEdgeMap.has(edge.id)) {
      result.removedEdges.push({
        id: edge.id,
        label: typeof edge.label === 'string' ? edge.label : undefined,
      });
    }
  }

  for (const edge of after.edges) {
    const prev = beforeEdgeMap.get(edge.id);
    if (prev) {
      const changes = diffObject(prev, edge, IGNORED_EDGE_KEYS);
      if (changes.length > 0) {
        result.modifiedEdges.push({ id: edge.id, changes });
      }
    }
  }

  result.hasDiff =
    result.addedNodes.length > 0 ||
    result.removedNodes.length > 0 ||
    result.modifiedNodes.length > 0 ||
    result.addedEdges.length > 0 ||
    result.removedEdges.length > 0 ||
    result.modifiedEdges.length > 0;

  return result;
}

/**
 * 生成 Diff 摘要文本
 */
export function diffSummary(result: DiffResult, formatter: DiffSummaryFormatter): string {
  const parts: string[] = [];
  if (result.addedNodes.length > 0) parts.push(`+${formatter.node(result.addedNodes.length)}`);
  if (result.removedNodes.length > 0) parts.push(`-${formatter.node(result.removedNodes.length)}`);
  if (result.modifiedNodes.length > 0) parts.push(`~${formatter.node(result.modifiedNodes.length)}`);
  if (result.addedEdges.length > 0) parts.push(`+${formatter.edge(result.addedEdges.length)}`);
  if (result.removedEdges.length > 0) parts.push(`-${formatter.edge(result.removedEdges.length)}`);
  if (result.modifiedEdges.length > 0) parts.push(`~${formatter.edge(result.modifiedEdges.length)}`);
  return parts.length > 0 ? parts.join('  ') : formatter.noChanges;
}
