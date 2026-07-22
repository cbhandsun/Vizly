 
/**
 * @file 语义管线共享辅助函数
 * @description 从 DomainVerticalLayoutStrategy / DomainHorizontalLayoutStrategy 中提取的
 *   域/子域语义注入与归一化逻辑，消除跨策略重复代码。
 */
import type { Node as ReactFlowNode } from '@xyflow/react';

const GROUP_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

const isGroupType = (type: unknown): boolean => GROUP_TYPES.has(String(type || ''));

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  )
);

const dataOf = (node: ReactFlowNode): Record<string, unknown> => (
  isRecord(node.data) ? node.data : {}
);

const textOf = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const domainOf = (node: ReactFlowNode): string => textOf(dataOf(node).domain);

const subDomainOf = (node: ReactFlowNode): string => {
  const data = dataOf(node);
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  return textOf(data.subDomain ?? data.subdomain ?? metadata.subDomain);
};

const cloneWithSafeData = (node: ReactFlowNode): ReactFlowNode => ({
  ...node,
  data: { ...dataOf(node) },
});

/** 统一规范化键：移除空白、标点、特殊字符 */
const norm = (s: string) => String(s || '').toLowerCase()
  .replace(/\u3000|\u00A0/g, '')
  .replace(/\s+/g, '')
  .replace(/[+_-]/g, '');

/** 增强版规范化（含中文标点） */
const normFull = (s: string) => String(s || '')
  .toLowerCase()
  .replace(/[\u3000\u00A0\s]+/g, '')
  .replace(/[+_-]/g, '')
  .replace(/[()（）【】[\]{}〈〉<>，、。：:；;．。！!？?]/g, '');

/**
 * 语义键缺失子域注入（按 domain+subDomain 建立容器）
 * - 当某域存在业务节点的 subDomain 键，但没有对应子域容器时，自动创建该子域容器
 * - 随后由分配/回收流程完善 children 与尺寸
 */
export const injectSemanticSubGroupsForMissingKeys = (list: ReactFlowNode[]): ReactFlowNode[] => {
  const out = list.map(cloneWithSafeData);
  const byDomainKeys = new Map<string, Set<string>>();
  const existingKeys = new Map<string, Set<string>>();
  for (const n of out) {
    const d = domainOf(n);
    if (!d) continue;
    if (!byDomainKeys.has(d)) byDomainKeys.set(d, new Set<string>());
    if (String(n.type || '') === 'subGroup') {
      const sRaw = textOf(dataOf(n).subDomain);
      const set = existingKeys.get(d) || new Set<string>();
      set.add(norm(sRaw)); existingKeys.set(d, set);
    } else if (!isGroupType(n.type)) {
      const k = norm(subDomainOf(n));
      if (k) (byDomainKeys.get(d) as Set<string>).add(k);
    }
  }
  for (const [d, keys] of Array.from(byDomainKeys.entries())) {
    const exists = existingKeys.get(d) || new Set<string>();
    for (const k of Array.from(keys.values())) {
      if (exists.has(k)) continue;
      const sgId = `subGroup__${norm(d)}__${k}`;
      const sgNode: ReactFlowNode = {
        id: sgId,
        type: 'subGroup',
        position: { x: 0, y: 0 },
        data: { domain: d, subDomain: k, description: k, children: [] },
        style: { width: 0, height: 0 },
        measured: { width: 0, height: 0 },
        draggable: false,
      };
      out.push(sgNode);
    }
  }
  return out;
};

/**
 * 按规范化语义键重建 children（通用归一化）
 * - 解决中文/英文括号、标点、空白等差异导致的子域归属遗漏
 * - 对 sg.description 与 node.subDomain 做统一规范化后重建 children
 * - 规则：仅匹配同域
 */
export const rebindChildrenNormalized = (list: ReactFlowNode[]): ReactFlowNode[] => {
  const out = list.map(cloneWithSafeData);
  const domainsArr = out
    .map(domainOf)
    .filter(Boolean);
  const domainKeys = Array.from(new Set(domainsArr));
  const idMapLocal = new Map<string, ReactFlowNode>(out.map(n => [n.id, n] as const));
  for (const d of domainKeys) {
    const sgList = out.filter(n => String(n.type || '') === 'subGroup' && domainOf(n) === d);
    const biz = out.filter(n => !isGroupType(n.type) && domainOf(n) === d);
    const bucket = new Map<string, string[]>();
    for (const n of biz) {
      const key = normFull(subDomainOf(n));
      const k = key || normFull(d);
      const ids = bucket.get(k) ?? [];
      ids.push(n.id);
      bucket.set(k, ids);
    }
    for (const sg of sgList) {
      const data = dataOf(sg);
      const sKeyRaw = textOf(data.subDomain);
      const k = normFull(sKeyRaw || d);
      const nextChildren = Array.from(new Set((bucket.get(k) ?? []).filter(id => idMapLocal.has(id))));
      sg.data = {
        ...data,
        children: nextChildren,
        ...(domainOf(sg) !== d ? { domain: d } : {}),
      };
    }
  }
  return out;
};
