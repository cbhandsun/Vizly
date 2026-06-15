 
/**
 * @file 语义管线共享辅助函数
 * @description 从 DomainVerticalLayoutStrategy / DomainHorizontalLayoutStrategy 中提取的
 *   域/子域语义注入与归一化逻辑，消除跨策略重复代码。
 */
import type { Node as ReactFlowNode } from '@xyflow/react';

const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));

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
  const out = list.map(n => ({ ...n, data: { ...(n.data as any) } }));
  const byDomainKeys = new Map<string, Set<string>>();
  const existingKeys = new Map<string, Set<string>>();
  for (const n of out) {
    const dt: any = (n as any).data || {};
    const d = String((dt?.domain || '')).trim();
    if (!d) continue;
    if (!byDomainKeys.has(d)) byDomainKeys.set(d, new Set<string>());
    if (String(n.type || '') === 'subGroup') {
      const sRaw = String((dt?.subDomain || '')).trim();
      const set = existingKeys.get(d) || new Set<string>();
      set.add(norm(sRaw)); existingKeys.set(d, set);
    } else if (!isGroupType(n.type)) {
      const k = norm(String(((dt?.subDomain ?? dt?.subdomain) ?? dt?.metadata?.subDomain) || '').trim());
      if (k) (byDomainKeys.get(d) as Set<string>).add(k);
    }
  }
  for (const [d, keys] of Array.from(byDomainKeys.entries())) {
    const exists = existingKeys.get(d) || new Set<string>();
    for (const k of Array.from(keys.values())) {
      if (exists.has(k)) continue;
      const sgId = `subGroup__${norm(d)}__${k}`;
      const sgNode: any = {
        id: sgId,
        type: 'subGroup',
        position: { x: 0, y: 0 },
        data: { domain: d, subDomain: k, description: k, children: [] },
        style: { width: 0, height: 0 },
        measured: { width: 0, height: 0 },
        draggable: false,
      };
      out.push(sgNode as ReactFlowNode);
    }
  }
  return out as ReactFlowNode[];
};

/**
 * 按规范化语义键重建 children（通用归一化）
 * - 解决中文/英文括号、标点、空白等差异导致的子域归属遗漏
 * - 对 sg.description 与 node.subDomain 做统一规范化后重建 children
 * - 规则：仅匹配同域
 */
export const rebindChildrenNormalized = (list: ReactFlowNode[]): ReactFlowNode[] => {
  const out = list.map(n => ({ ...n, data: { ...(n.data as any) } }));
  const domainsArr = out
    .map(n => String(((n as any)?.data?.domain ?? '')).trim())
    .filter(Boolean);
  const domainKeys = Array.from(new Set(domainsArr));
  const idMapLocal = new Map<string, ReactFlowNode>(out.map(n => [n.id, n] as const));
  for (const d of domainKeys) {
    const sgList = out.filter(n => String(n.type || '') === 'subGroup' && (String(((n as any)?.data?.domain || ''))).trim() === d);
    const biz = out.filter(n => !isGroupType(n.type) && (String(((n as any)?.data?.domain || ''))).trim() === d);
    const bucket: Record<string, string[]> = {};
    for (const n of biz) {
      const nd: any = (n as any).data || {};
      const subRaw = String(((nd?.subDomain ?? nd?.subdomain) ?? nd?.metadata?.subDomain) || '').trim();
      const key = normFull(subRaw);
      const k = key || normFull(d);
      (bucket[k] || (bucket[k] = [])).push(n.id);
    }
    for (const sg of sgList) {
      const dt: any = (sg as any).data || {};
      const sKeyRaw = String((dt?.subDomain || '')).trim();
      const k = normFull(sKeyRaw || d);
      const nextChildren = Array.from(new Set((bucket[k] || []).filter(id => !!idMapLocal.get(id)))) as string[];
      ((sg as any).data || ((sg as any).data = {})).children = nextChildren;
      const d1 = String(((dt?.domain || '') || '')).trim(); if (d1 !== d) ((sg as any).data).domain = d;
    }
  }
  return out as ReactFlowNode[];
};
