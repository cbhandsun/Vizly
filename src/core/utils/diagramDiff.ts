/**
 * diagramDiff — 纯函数：比较两个图表快照，生成差异报告
 *
 * 按 node.id / edge.id 做双向查找，比较关键属性。
 * 输出 DiffResult 供 DiffOverlay 消费。
 */

/** 单个属性的差异 */
export interface PropertyDiff {
  key: string;
  oldValue: any;
  newValue: any;
}

/** 节点/边快照（用于显示已删除的元素） */
export interface ElementSnapshot {
  id: string;
  label?: string;
  position?: { x: number; y: number };
  [key: string]: any;
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

/**
 * 深度比较两个值
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every(key => deepEqual(a[key], b[key]));
}

/**
 * 比较两个对象，返回差异属性列表
 */
function diffObject(
  before: Record<string, any>,
  after: Record<string, any>,
  ignoredKeys: Set<string>
): PropertyDiff[] {
  const diffs: PropertyDiff[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (ignoredKeys.has(key)) continue;

    const oldVal = before[key];
    const newVal = after[key];

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
  before: { nodes: any[]; edges: any[] },
  after: { nodes: any[]; edges: any[] }
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
        label: node.data?.label,
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
          label: node.data?.label,
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
        label: edge.label,
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
export function diffSummary(result: DiffResult): string {
  const parts: string[] = [];
  if (result.addedNodes.length > 0) parts.push(`+${result.addedNodes.length} 节点`);
  if (result.removedNodes.length > 0) parts.push(`-${result.removedNodes.length} 节点`);
  if (result.modifiedNodes.length > 0) parts.push(`~${result.modifiedNodes.length} 节点`);
  if (result.addedEdges.length > 0) parts.push(`+${result.addedEdges.length} 连线`);
  if (result.removedEdges.length > 0) parts.push(`-${result.removedEdges.length} 连线`);
  if (result.modifiedEdges.length > 0) parts.push(`~${result.modifiedEdges.length} 连线`);
  return parts.length > 0 ? parts.join('  ') : '无变化';
}
