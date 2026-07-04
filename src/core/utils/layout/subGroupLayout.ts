import type { Edge, Node as ReactFlowNode, XYPosition } from '@xyflow/react';
import { diagramConfigManager } from '../../components/config/DiagramConfig';
import { LayeredConfigManager } from '../../config/LayeredConfigManager';
import { forceSimulation, forceCollide, forceX, forceY } from 'd3-force';
import dagre from 'dagre';
import { safeLog } from '../consoleCleanup';

/**
 * @file 统一布局工具函数
 * @description 整合所有图表的布局计算逻辑，避免重复代码
 */

import { countRectOverlaps, sortNodesInRow } from './geometryUtils';
import { enforceDomainContainerStrictContainment } from './domainContainers';

/**
 * 域内自由节点按行吸附与打包（函数级注释）
 * 目标：将同一域内的自由业务节点按 Y 位置聚类成若干行，并在行内进行水平打包与居中，确保行内不重叠；
 * 规则：
 * - 行容差 = `NODE_V_GAP * 0.35`，同一行内节点的 Y 中心偏差不超过容差；
 * - 行宽 = 节点宽度之和 + 间距；起点 = 域内部左侧 + max(0, (innerWidth - 行宽)/2)；
 * - 超出右侧边界时进行钳制；最终写回节点坐标。
 */
export const snapFreeNodesToRowsInDomain = (
  nodes: ReactFlowNode[],
  noClamp: boolean = false
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  const DOMAIN_PAD_H = num(cfgFull?.domain?.padding?.horizontal, 24);
  const updated = nodes.map(n => ({ ...n }));
  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
  const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), num(cfgFull?.node?.height, 80));
  const innerOfDomain = (tg: ReactFlowNode) => {
    const pos = (tg as any).position || { x: 0, y: 0 };
    const w = num((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 0);
    const h = num((((tg as any)?.measured?.height ?? (tg as any)?.style?.height)), 0);
    const innerLeft = num(pos.x, 0) + DOMAIN_PAD_H;
    const innerRight = num(pos.x, 0) + Math.max(1, w) - DOMAIN_PAD_H;
    const innerTop = num(pos.y, 0) + num(cfgFull?.domain?.title?.height, 40) + num(cfgFull?.domain?.title?.padding?.vertical, 12) + num(cfgFull?.domain?.title?.safeGap, 16);
    const innerBottom = num(pos.y, 0) + Math.max(1, h) - DOMAIN_PAD_H;
    return { innerLeft, innerRight, innerTop, innerBottom };
  };

  const tgs = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const tg of tgs) {
    const dKey = String((((tg as any)?.data?.domain || ''))).trim();
    if (!dKey) continue;
    const { innerLeft, innerRight, innerTop, innerBottom } = innerOfDomain(tg);
    const subChildren = new Set<string>();
    updated.filter(n => String(n.type || '') === 'subGroup' && String((((n as any)?.data?.domain || ''))).trim() === dKey).forEach(sg => {
      const ids = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
      ids.forEach(id => subChildren.add(id));
    });
    const free = updated.filter(n => {
      const t = String(n.type || '');
      const hidden = !!(((n as any)?.data || {}) as any)?.hidden;
      const belongs = String((((n as any)?.data || {}) as any)?.domain || '') === dKey;
      return belongs && !isGroupType(t) && !hidden && !subChildren.has(n.id);
    });
    if (free.length <= 1) continue;
    const rows: Array<ReactFlowNode[]> = [];
    const byCenterY = free.slice().sort((a, b) => (num(((a as any)?.position?.y), 0) + getH(a) / 2) - (num(((b as any)?.position?.y), 0) + getH(b) / 2));
    const tol = Math.max(8, Math.floor(V_GAP * 0.35));
    for (const n of byCenterY) {
      const cy = num(((n as any)?.position?.y), 0) + getH(n) / 2;
      let placed = false;
      for (const row of rows) {
        const avgY = row.reduce((s, m) => s + (num(((m as any)?.position?.y), 0) + getH(m) / 2), 0) / row.length;
        if (Math.abs(avgY - cy) <= tol) { row.push(n); placed = true; break; }
      }
      if (!placed) rows.push([n]);
    }
    for (const row of rows) {
      const widths = row.map(n => getW(n));
      const rowWidth = widths.reduce((s, w, idx) => s + w + (idx > 0 ? H_GAP : 0), 0);
      const innerWidth = Math.max(1, innerRight - innerLeft);
      const startX = innerLeft + Math.floor(Math.max(0, (innerWidth - rowWidth)) / 2);
      let cx = startX;
      const yBaseRaw = row.reduce((min, n) => Math.min(min, num(((n as any)?.position?.y), innerTop)), innerBottom);
      const yBase = noClamp ? Math.round(yBaseRaw) : Math.min(Math.max(yBaseRaw, innerTop), innerBottom);
      for (let i = 0; i < row.length; i++) {
        const n = row[i];
        const w = widths[i];
        const ix = noClamp ? Math.round(cx) : Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w));
        const idx = updated.findIndex(m => m.id === n.id);
        if (idx >= 0) (updated[idx] as any).position = { x: Math.round(ix), y: Math.round(yBase) } as any;
        cx = (noClamp ? ix : Math.round(ix)) + w + H_GAP;
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：子域 children 按行吸附与打包
 * 目标：在每个 `subGroup` 中，将 children 按 Y 中心聚类为若干行，行内按最小水平间距打包并居中到子域内容区，确保不重叠；
 * 规则：
 * - 行容差 = `NODE_V_GAP * 0.35`；
 * - 行宽 = 节点宽度之和 + 行内间距；起点 = 子域内容区左侧 + max(0, (innerWidth - 行宽)/2)；
 * - 行间距 = `NODE_V_GAP`；容器高度依此回收；越界时钳制。
 */

/**
 * 函数级注释：子域 children 按行吸附与打包
 * 目标：在每个 `subGroup` 中，将 children 按 Y 中心聚类为若干行，行内按最小水平间距打包并居中到子域内容区，确保不重叠；
 * 规则：
 * - 行容差 = `NODE_V_GAP * 0.35`；
 * - 行宽 = 节点宽度之和 + 行内间距；起点 = 子域内容区左侧 + max(0, (innerWidth - 行宽)/2)；
 * - 行间距 = `NODE_V_GAP`；容器高度依此回收；越界时钳制。
 */
export const snapSubGroupChildrenToRowsStrict = (
  nodes: ReactFlowNode[],
  noClamp: boolean = false
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  const SUB_H = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const titleH = num((cfgFull?.subDomain?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT), 28);
  const titleV = num((cfgFull?.subDomain?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP), 8);
  const TOP_PAD = Math.max(titleH + titleV, num((cfgFull?.subDomain?.padding?.top ?? layoutCfg?.SUB_GROUP_TITLE_CLEARANCE), titleH + titleV));
  const SUB_BOTTOM = num((cfgFull?.subDomain?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 20);
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
  const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), num(cfgFull?.node?.height, 80));

  const sgs = updated.filter(n => String(n.type || '') === 'subGroup');
  for (let i = 0; i < sgs.length; i++) {
    const sg = sgs[i];
    const pos = (sg as any).position || { x: 0, y: 0 };
    const w = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0);
    const innerLeft = num(pos.x, 0) + SUB_H;
    const innerRight = num(pos.x, 0) + Math.max(1, w) - SUB_H;
    const innerTop = num(pos.y, 0) + TOP_PAD;
    const innerWidth = Math.max(1, innerRight - innerLeft);
    const children = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
    const list = children
      .map(id => idMap.get(id))
      .filter((n): n is ReactFlowNode => !!n && !isGroupType(n.type) && !((n as any)?.data || {})?.hidden);
    if (list.length <= 1) continue;
    const rows: Array<ReactFlowNode[]> = [];
    const byCenterY = list.slice().sort((a, b) => (num(((a as any)?.position?.y), 0) + getH(a) / 2) - (num(((b as any)?.position?.y), 0) + getH(b) / 2));
    const tol = Math.max(8, Math.floor(V_GAP * 0.35));
    for (const n of byCenterY) {
      const cy = num(((n as any)?.position?.y), 0) + getH(n) / 2;
      let placed = false;
      for (const row of rows) {
        const avgY = row.reduce((s, m) => s + (num(((m as any)?.position?.y), 0) + getH(m) / 2), 0) / row.length;
        if (Math.abs(avgY - cy) <= tol) { row.push(n); placed = true; break; }
      }
      if (!placed) rows.push([n]);
    }
    let yCursor = innerTop;
    const colGap = Math.max(12, H_GAP);
    const rowGap = Math.max(8, V_GAP);
    let maxContentW = 0;
    let totalRowsH = 0;
    for (const row of rows) {
      sortNodesInRow(row);
      const widths = row.map(n => getW(n));
      const rowWidth = widths.reduce((s, w, idx) => s + w + (idx > 0 ? colGap : 0), 0);
      const startX = innerLeft + Math.floor(Math.max(0, (innerWidth - rowWidth)) / 2);
      let cx = startX;
      let rowMaxH = 0;
      for (let k = 0; k < row.length; k++) {
        const n = row[k];
        const w0 = widths[k];
        const idx = updated.findIndex(m => m.id === n.id);
        if (idx < 0) continue;
        const ix = noClamp ? Math.round(cx) : Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w0));
        const ih = getH(n);
        rowMaxH = Math.max(rowMaxH, ih);
        (updated[idx] as any).position = { x: Math.round(ix), y: Math.round(yCursor) } as any;
        cx = (noClamp ? ix : Math.round(ix)) + w0 + colGap;
      }
      yCursor += rowMaxH + rowGap;
      maxContentW = Math.max(maxContentW, rowWidth);
      totalRowsH += rowMaxH;
    }
    const interRowGaps = Math.max(0, rows.length - 1) * rowGap;
    const newW = Math.max(0, Math.min(innerWidth, maxContentW) + SUB_H * 2);
    const newH = Math.max(0, totalRowsH + interRowGaps + TOP_PAD + Math.max(8, Math.floor(SUB_BOTTOM * 0.6)));
    ((sg as any).style || ((sg as any).style = {})).width = Math.round(newW);
    ((sg as any).style || ((sg as any).style = {})).height = Math.round(newH);
    (sg as any).measured = { width: Math.round(newW), height: Math.round(newH) } as any;
    (sg as any).width = Math.round(newW);
    (sg as any).height = Math.round(newH);
  }
  return updated;
};

/**
 * 函数级注释：子域 children 分层对齐与正向打包
 * 目标：将子域内容区内的 children 的 Y 坐标对齐到若干层级基线（rank），每层内按水平等距打包并居中；层间距固定为 `NODE_V_GAP`。
 * 说明：
 * - 类 dagre 的 rankSep 思路：通过按 y 距离分层到基线，避免小幅度抖动造成的层次重叠；
 * - 每层高度取该层最大节点高度，层间距使用 `NODE_V_GAP`。
 */

/**
 * 函数级注释：子域 children 分层对齐与正向打包
 * 目标：将子域内容区内的 children 的 Y 坐标对齐到若干层级基线（rank），每层内按水平等距打包并居中；层间距固定为 `NODE_V_GAP`。
 * 说明：
 * - 类 dagre 的 rankSep 思路：通过按 y 距离分层到基线，避免小幅度抖动造成的层次重叠；
 * - 每层高度取该层最大节点高度，层间距使用 `NODE_V_GAP`。
 */
export const rankSnapSubGroupChildren = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  const SUB_H = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const titleH = num((cfgFull?.subDomain?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT), 28);
  const titleV = num((cfgFull?.subDomain?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP), 8);
  const TOP_PAD = Math.max(titleH + titleV, num((cfgFull?.subDomain?.padding?.top ?? layoutCfg?.SUB_GROUP_TITLE_CLEARANCE), titleH + titleV));
  const SUB_BOTTOM = num((cfgFull?.subDomain?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 20);
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
  const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), num(cfgFull?.node?.height, 80));

  const sgs = updated.filter(n => String(n.type || '') === 'subGroup');
  for (let i = 0; i < sgs.length; i++) {
    const sg = sgs[i];
    const pos = (sg as any).position || { x: 0, y: 0 };
    const w = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0);
    const _h = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height)), 0);
    const innerLeft = num(pos.x, 0) + SUB_H;
    const innerRight = num(pos.x, 0) + Math.max(1, w) - SUB_H;
    const innerTop = num(pos.y, 0) + TOP_PAD;
    const innerWidth = Math.max(1, innerRight - innerLeft);
    const children = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
    const list = children
      .map(id => idMap.get(id))
      .filter((n): n is ReactFlowNode => !!n && !isGroupType(n.type) && !((n as any)?.data || {})?.hidden);
    if (list.length <= 1) continue;
    // 根据 y 中心距离分组为 rank
    const byCenterY = list.slice().sort((a, b) => (num(((a as any)?.position?.y), 0) + getH(a) / 2) - (num(((b as any)?.position?.y), 0) + getH(b) / 2));
    const ranks: Array<ReactFlowNode[]> = [];
    const tol = Math.max(8, Math.floor(V_GAP * 0.35));
    for (const n of byCenterY) {
      const cy = num(((n as any)?.position?.y), 0) + getH(n) / 2;
      let placed = false;
      for (const r of ranks) {
        const avgY = r.reduce((s, m) => s + (num(((m as any)?.position?.y), 0) + getH(m) / 2), 0) / r.length;
        if (Math.abs(avgY - cy) <= tol) { r.push(n); placed = true; break; }
      }
      if (!placed) ranks.push([n]);
    }
    // 计算每层高度与起点，重新设置 y 到层级基线；行内居中打包
    let yCursor = innerTop;
    const colGap = Math.max(12, H_GAP);
    let maxContentW = 0;
    let totalRowsH = 0;
    for (const r of ranks) {
      sortNodesInRow(r);
      const widths = r.map(n => getW(n));
      const rowWidth = widths.reduce((s, w, idx) => s + w + (idx > 0 ? colGap : 0), 0);
      const startX = innerLeft + Math.floor(Math.max(0, (innerWidth - rowWidth)) / 2);
      let cx = startX;
      let rowMaxH = 0;
      for (let k = 0; k < r.length; k++) {
        const n = r[k];
        const w0 = widths[k];
        const idx = updated.findIndex(m => m.id === n.id);
        if (idx < 0) continue;
        const ix = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w0));
        const ih = getH(n);
        rowMaxH = Math.max(rowMaxH, ih);
        (updated[idx] as any).position = { x: Math.round(ix), y: Math.round(yCursor) } as any;
        cx = ix + w0 + colGap;
      }
      yCursor += rowMaxH + V_GAP;
      maxContentW = Math.max(maxContentW, rowWidth);
      totalRowsH += rowMaxH;
    }
    const interRowGaps = Math.max(0, ranks.length - 1) * V_GAP;
    const newW = Math.max(0, Math.min(innerWidth, maxContentW) + SUB_H * 2);
    const newH = Math.max(0, totalRowsH + interRowGaps + TOP_PAD + Math.max(8, Math.floor(SUB_BOTTOM * 0.6)));
    ((sg as any).style || ((sg as any).style = {})).width = Math.round(newW);
    ((sg as any).style || ((sg as any).style = {})).height = Math.round(newH);
    (sg as any).measured = { width: Math.round(newW), height: Math.round(newH) } as any;
    (sg as any).width = Math.round(newW);
    (sg as any).height = Math.round(newH);
  }
  return updated;
};

/**
 * 函数级注释：域内自由节点分层对齐
 * 目标：将同一域内的自由业务节点按 Y 中心对齐到若干层级基线（rank），每层内水平打包并居中，层间距固定。
 */

/**
 * 函数级注释：域内自由节点分层对齐
 * 目标：将同一域内的自由业务节点按 Y 中心对齐到若干层级基线（rank），每层内水平打包并居中，层间距固定。
 */
export const rankSnapDomainFreeNodes = (
  nodes: ReactFlowNode[],
  noClamp: boolean = false
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  const DOMAIN_PAD_H = num(cfgFull?.domain?.padding?.horizontal, 24);
  const updated = nodes.map(n => ({ ...n }));
  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
  const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), num(cfgFull?.node?.height, 80));
  const innerOfDomain = (tg: ReactFlowNode) => {
    const pos = (tg as any).position || { x: 0, y: 0 };
    const w = num((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 0);
    const h = num((((tg as any)?.measured?.height ?? (tg as any)?.style?.height)), 0);
    const innerLeft = num(pos.x, 0) + DOMAIN_PAD_H;
    const innerRight = num(pos.x, 0) + Math.max(1, w) - DOMAIN_PAD_H;
    const innerTop = num(pos.y, 0) + num(cfgFull?.domain?.title?.height, 40) + num(cfgFull?.domain?.title?.padding?.vertical, 12) + num(cfgFull?.domain?.title?.safeGap, 16);
    const innerBottom = num(pos.y, 0) + Math.max(1, h) - DOMAIN_PAD_H;
    return { innerLeft, innerRight, innerTop, innerBottom };
  };
  const tgs = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const tg of tgs) {
    const dKey = String((((tg as any)?.data?.domain || ''))).trim();
    if (!dKey) continue;
    const { innerLeft, innerRight, innerTop } = innerOfDomain(tg);
    const subChildren = new Set<string>();
    updated.filter(n => String(n.type || '') === 'subGroup' && String((((n as any)?.data?.domain || ''))).trim() === dKey).forEach(sg => {
      const ids = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
      ids.forEach(id => subChildren.add(id));
    });
    const free = updated.filter(n => {
      const t = String(n.type || '');
      const hidden = !!(((n as any)?.data || {}) as any)?.hidden;
      const belongs = String((((n as any)?.data || {}) as any)?.domain || '') === dKey;
      return belongs && !isGroupType(t) && !hidden && !subChildren.has(n.id);
    });
    if (free.length <= 1) continue;
    const ranks: Array<ReactFlowNode[]> = [];
    const byCenterY = free.slice().sort((a, b) => (num(((a as any)?.position?.y), 0) + getH(a) / 2) - (num(((b as any)?.position?.y), 0) + getH(b) / 2));
    const tol = Math.max(8, Math.floor(V_GAP * 0.35));
    for (const n of byCenterY) {
      const cy = num(((n as any)?.position?.y), 0) + getH(n) / 2;
      let placed = false;
      for (const r of ranks) {
        const avgY = r.reduce((s, m) => s + (num(((m as any)?.position?.y), 0) + getH(m) / 2), 0) / r.length;
        if (Math.abs(avgY - cy) <= tol) { r.push(n); placed = true; break; }
      }
      if (!placed) ranks.push([n]);
    }
    let yCursor = innerTop;
    const colGap = Math.max(12, H_GAP);
    for (const r of ranks) {
      sortNodesInRow(r);
      const widths = r.map(n => getW(n));
      const rowWidth = widths.reduce((s, w, idx) => s + w + (idx > 0 ? colGap : 0), 0);
      const innerWidth = Math.max(1, innerRight - innerLeft);
      const startX = innerLeft + Math.floor(Math.max(0, (innerWidth - rowWidth)) / 2);
      let cx = startX;
      let rowMaxH = 0;
      for (let k = 0; k < r.length; k++) {
        const n = r[k];
        const w0 = widths[k];
        const idx = updated.findIndex(m => m.id === n.id);
        if (idx < 0) continue;
        const ix = noClamp ? Math.round(cx) : Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w0));
        const ih = getH(n);
        rowMaxH = Math.max(rowMaxH, ih);
        (updated[idx] as any).position = { x: Math.round(ix), y: Math.round(yCursor) } as any;
        cx = (noClamp ? ix : Math.round(ix)) + w0 + colGap;
      }
      yCursor += rowMaxH + V_GAP;
    }
  }
  return updated;
};

/**
 * 函数级注释：全局业务节点重叠消解
 * 目标：在不显示域/子域容器的场景下，对全图范围内的普通业务节点执行两阶段避让，确保最小水平/垂直间距。
 * 策略：
 * - 排除分组类与 hidden 节点；
 * - 先按 Y 升序进行垂直避让，再按 X 升序进行水平避让；
 * - 间距使用 `NODE_V_GAP` / `NODE_H_GAP`，不对容器进行钳制。
 */

/**
 * 函数级注释：全局业务节点重叠消解
 * 目标：在不显示域/子域容器的场景下，对全图范围内的普通业务节点执行两阶段避让，确保最小水平/垂直间距。
 * 策略：
 * - 排除分组类与 hidden 节点；
 * - 先按 Y 升序进行垂直避让，再按 X 升序进行水平避让；
 * - 间距使用 `NODE_V_GAP` / `NODE_H_GAP`，不对容器进行钳制。
 */
export const resolveAllNodeOverlapsGlobal = (
  nodes: ReactFlowNode[],
  gapHOverride?: number,
  gapVOverride?: number
): ReactFlowNode[] => {
  const cfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const vGap = (typeof gapVOverride === 'number' && isFinite(gapVOverride)) ? (gapVOverride as number) : num(cfg?.NODE_V_GAP, 80);
  const hGap = (typeof gapHOverride === 'number' && isFinite(gapHOverride)) ? (gapHOverride as number) : num(cfg?.NODE_H_GAP, 120);
  const updated = nodes.map(n => ({ ...n }));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getRect = (n: ReactFlowNode) => {
    const w = num((n as any)?.measured?.width ?? (n.style as any)?.width ?? (n as any)?.width, 0);
    const h = num((n as any)?.measured?.height ?? (n.style as any)?.height ?? (n as any)?.height, 0);
    const x = num(n.position?.x, 0);
    const y = num(n.position?.y, 0);
    return { x, y, w, h };
  };
  const list = updated.filter(n => !EXCLUDE.has(String(n.type || '')) && !((n as any)?.data || {})?.hidden);
  if (list.length <= 1) return updated;
  // 垂直避让
  const byY = list.slice().sort((a, b) => getRect(a).y - getRect(b).y);
  const placedY: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
  for (const n of byY) {
    const r = getRect(n);
    let shiftY = 0;
    for (const p of placedY) {
      const horizOverlap = !(r.x + r.w <= p.rect.x || p.rect.x + p.rect.w <= r.x);
      if (!horizOverlap) continue;
      const requiredTop = p.rect.y + p.rect.h + vGap;
      if (r.y + shiftY < requiredTop) {
        shiftY = Math.max(shiftY, requiredTop - r.y);
      }
    }
    if (shiftY > 0) {
      const idx = updated.findIndex(nn => nn.id === n.id);
      const px = num((updated[idx] as any)?.position?.x, 0);
      const py = num((updated[idx] as any)?.position?.y, 0);
      (updated[idx] as any).position = { x: px, y: py + shiftY } as any;
    }
    placedY.push({ id: n.id, rect: { ...r, y: r.y + shiftY } });
  }
  // 水平避让
  const currentList = updated.filter(nn => list.some(f => f.id === nn.id));
  const byX = currentList.slice().sort((a, b) => getRect(a).x - getRect(b).x);
  const placedX: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
  for (const n of byX) {
    const r = getRect(n);
    let shiftX = 0;
    for (const p of placedX) {
      const vertOverlap = !(r.y + r.h <= p.rect.y || p.rect.y + p.rect.h <= r.y);
      if (!vertOverlap) continue;
      const requiredLeft = p.rect.x + p.rect.w + hGap;
      if (r.x + shiftX < requiredLeft) {
        shiftX = Math.max(shiftX, requiredLeft - r.x);
      }
    }
    if (shiftX > 0) {
      const idx = updated.findIndex(nn => nn.id === n.id);
      const px = num((updated[idx] as any)?.position?.x, 0);
      const py = num((updated[idx] as any)?.position?.y, 0);
      (updated[idx] as any).position = { x: px + shiftX, y: py } as any;
    }
    placedX.push({ id: n.id, rect: { ...r, x: r.x + shiftX } });
  }
  return updated;
};

/**
 * 函数级注释：容器缺失时的“幽灵车道”列布局
 * 目标：当域/子域容器不显示时，按 `data.domain` 对业务节点分组，将各域视作列进行垂直打包，降低跨域及域内重叠。
 * 规则：
 * - 列顺序：按域内节点的 x 均值排序；
 * - 列宽：最大节点宽度 + 左右内边距；列间距使用 `domain.gap` 或默认 40；
 * - 行打包：域内按 y 排序，自上而下，行距取 `NODE_V_GAP`；行内居中；
 * - 不创建域容器，仅写回节点坐标。
 */

/**
 * 函数级注释：容器缺失时的“幽灵车道”列布局
 * 目标：当域/子域容器不显示时，按 `data.domain` 对业务节点分组，将各域视作列进行垂直打包，降低跨域及域内重叠。
 * 规则：
 * - 列顺序：按域内节点的 x 均值排序；
 * - 列宽：最大节点宽度 + 左右内边距；列间距使用 `domain.gap` 或默认 40；
 * - 行打包：域内按 y 排序，自上而下，行距取 `NODE_V_GAP`；行内居中；
 * - 不创建域容器，仅写回节点坐标。
 */
export const layoutNodesByGhostDomainColumns = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const _H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  const COL_PAD = Math.max(12, num(cfgFull?.domain?.padding?.horizontal, 24));
  const COL_GAP = Math.max(24, num(cfgFull?.domain?.gap, 40));
  const LEFT = Math.max(40, num(cfgFull?.diagram?.padding?.left, 40));
  const updated = nodes.map(n => ({ ...n }));
  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
  const visibleBiz = updated.filter(n => !isGroupType(n.type) && !((n as any)?.data || {})?.hidden);
  if (visibleBiz.length <= 1) return updated;
  const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), num(cfgFull?.node?.height, 80));
  const domainOf = (n: ReactFlowNode) => String((((n as any)?.data || {}) as any)?.domain || '').trim();

  const groups = new Map<string, ReactFlowNode[]>();
  for (const n of visibleBiz) {
    const d = domainOf(n);
    const arr = groups.get(d) || [];
    arr.push(n);
    groups.set(d, arr);
  }
  const keys = Array.from(groups.keys());
  if (keys.length <= 1) return updated;

  const avgX = (arr: ReactFlowNode[]) => {
    if (!arr.length) return 0;
    const s = arr.reduce((t, n) => t + num(((n as any)?.position?.x), 0), 0);
    return s / arr.length;
  };
  const orderedKeys = keys.slice().sort((a, b) => avgX(groups.get(a) || []) - avgX(groups.get(b) || []));

  let cx = LEFT;
  const _halfIdx = Math.floor(orderedKeys.length / 2);
  for (let idxKey = 0; idxKey < orderedKeys.length; idxKey++) {
    const k = orderedKeys[idxKey];
    const arr = (groups.get(k) || []).slice().sort((a, b) => num(((a as any)?.position?.y), 0) - num(((b as any)?.position?.y), 0));
    const maxW = Math.max(...arr.map(getW));
    const colW = Math.max(1, maxW + COL_PAD * 2);
    let cy = Math.max(40, num(cfgFull?.diagram?.padding?.top, 40));
    const centerX = cx + Math.floor(colW / 2);
    for (const n of arr) {
      const w = getW(n);
      const ix = Math.round(centerX - Math.floor(w / 2));
      const idx = updated.findIndex(m => m.id === n.id);
      if (idx >= 0) (updated[idx] as any).position = { x: ix, y: Math.round(cy) } as any;
      cy += getH(n) + Math.max(8, V_GAP);
    }
    cx += colW + Math.max(24, COL_GAP);
  }
  return updated;
};


/**
 * @function enforceGlobalNoOverlapStrict
 * @description 全局严格不重叠打包
 * 目标：在全图范围对普通业务节点执行纵向与横向的严格打包，保证达到最小间距并在有限迭代内收敛到“无重叠”。
 * 策略：
 * - 迭代执行两阶段：纵向打包（按 y 升序）与横向打包（按 x 升序），每阶段对所有已放置节点计算需要的最小位移；
 * - 每轮结束统计交叉数量，如为 0 则提前退出；迭代上限默认 12。
 */

/**
 * @function enforceGlobalNoOverlapStrict
 * @description 全局严格不重叠打包
 * 目标：在全图范围对普通业务节点执行纵向与横向的严格打包，保证达到最小间距并在有限迭代内收敛到“无重叠”。
 * 策略：
 * - 迭代执行两阶段：纵向打包（按 y 升序）与横向打包（按 x 升序），每阶段对所有已放置节点计算需要的最小位移；
 * - 每轮结束统计交叉数量，如为 0 则提前退出；迭代上限默认 12。
 */
export const enforceGlobalNoOverlapStrict = (
  nodes: ReactFlowNode[],
  hGap: number,
  vGap: number,
  maxIterations: number = 12
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getRect = (n: ReactFlowNode) => {
    const w = num((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width, 0);
    const h = num((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height, 0);
    const x = num(n.position?.x, 0);
    const y = num(n.position?.y, 0);
    return { x, y, w, h };
  };
  const visible = updated.filter(n => !EXCLUDE.has(String(n.type || '')) && !((n as any)?.data || {})?.hidden);
  if (visible.length <= 1) return updated;

  const countOverlaps = (): number => {
    let o = 0;
    for (let i = 0; i < visible.length; i++) {
      const a = getRect(visible[i]);
      for (let j = i + 1; j < visible.length; j++) {
        const b = getRect(visible[j]);
        const disjoint = a.x >= b.x + b.w || a.x + a.w <= b.x || a.y >= b.y + b.h || a.y + a.h <= b.y;
        if (!disjoint) o++;
      }
    }
    return o;
  };

  for (let iter = 0; iter < Math.max(1, maxIterations); iter++) {
    const byY = visible.slice().sort((a, b) => getRect(a).y - getRect(b).y);
    const placedY: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const n of byY) {
      const r = getRect(n);
      let shiftY = 0;
      for (const p of placedY) {
        const horizOverlap = !(r.x >= p.rect.x + p.rect.w || r.x + r.w <= p.rect.x);
        if (!horizOverlap) continue;
        const needTop = p.rect.y + p.rect.h + Math.max(8, vGap);
        if (r.y + shiftY < needTop) shiftY = needTop - r.y;
      }
      if (shiftY > 0) {
        const idx = updated.findIndex(u => u.id === n.id);
        const px = num((updated[idx] as any)?.position?.x, r.x);
        const py = num((updated[idx] as any)?.position?.y, r.y);
        (updated[idx] as any).position = { x: Math.round(px), y: Math.round(py + shiftY) } as any;
      }
      placedY.push({ id: n.id, rect: { ...r, y: r.y + shiftY } });
    }

    const byX = visible.slice().sort((a, b) => getRect(a).x - getRect(b).x);
    const placedX: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const n of byX) {
      const r = getRect(n);
      let shiftX = 0;
      for (const p of placedX) {
        const vertOverlap = !(r.y >= p.rect.y + p.rect.h || r.y + r.h <= p.rect.y);
        if (!vertOverlap) continue;
        const needLeft = p.rect.x + p.rect.w + Math.max(12, hGap);
        if (r.x + shiftX < needLeft) shiftX = needLeft - r.x;
      }
      if (shiftX > 0) {
        const idx = updated.findIndex(u => u.id === n.id);
        const px = num((updated[idx] as any)?.position?.x, r.x);
        const py = num((updated[idx] as any)?.position?.y, r.y);
        (updated[idx] as any).position = { x: Math.round(px + shiftX), y: Math.round(py) } as any;
      }
      placedX.push({ id: n.id, rect: { ...r, x: r.x + shiftX } });
    }

    const ov = countOverlaps();
    if (ov <= 0) break;
  }
  return updated;
};

/**
 * 函数级注释：指定域的网格打包
 * 目标：对某个域（domainKey）内可见业务节点，使用自适应列数的网格打包，减少全局干扰并形成稳定的行列结构；
 * 规则：
 * - 列数 = ceil(sqrt(N))，行数自适应；
 * - 单元宽高取域内节点的最大宽/高并加上最小间距；
 * - 起点为该域节点的平均 x/y，水平垂直居中对齐。
 */

/**
 * 函数级注释：指定域的网格打包
 * 目标：对某个域（domainKey）内可见业务节点，使用自适应列数的网格打包，减少全局干扰并形成稳定的行列结构；
 * 规则：
 * - 列数 = ceil(sqrt(N))，行数自适应；
 * - 单元宽高取域内节点的最大宽/高并加上最小间距；
 * - 起点为该域节点的平均 x/y，水平垂直居中对齐。
 */
export const packDomainNodesGrid = (
  nodes: ReactFlowNode[],
  domainKey: string,
  hGap: number,
  vGap: number
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), 120);
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), 80);
  const updated = nodes.map(n => ({ ...n }));
  const list = updated.filter(n => String((((n as any)?.data || {}) as any)?.domain || '') === domainKey && !isGroupType(n.type) && !((n as any)?.data || {})?.hidden);
  if (list.length <= 1) return updated;
  const sorted = list.slice().sort((a, b) => num(((a as any)?.position?.y), 0) - num(((b as any)?.position?.y), 0));


  const maxW = Math.max(...list.map(getW));
  const maxH = Math.max(...list.map(getH));
  const cellW = Math.max(1, maxW + Math.max(12, hGap));
  const cellH = Math.max(1, maxH + Math.max(8, vGap));
  const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
  const rows = Math.max(1, Math.ceil(list.length / cols));
  const avgX = list.reduce((s, n) => s + num(((n as any)?.position?.x), 0), 0) / list.length;
  const avgY = list.reduce((s, n) => s + num(((n as any)?.position?.y), 0), 0) / list.length;
  const startX = Math.round(avgX - (cols * cellW) / 2);
  const startY = Math.round(Math.max(40, avgY - (rows * cellH) / 2));
  let i = 0;
  for (const n of sorted) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const nx = startX + c * cellW;
    const ny = startY + r * cellH;
    const idx = updated.findIndex(m => m.id === n.id);
    if (idx >= 0) (updated[idx] as any).position = { x: nx, y: ny } as any;
    i++;
  }
  return updated;
};

/**
 * 函数级注释：指定域的严格无重叠打包
 * 目标：在某个域内执行纵向优先的无重叠打包，确保域内节点达到最小间距并消除重叠。
 */

/**
 * 函数级注释：指定域的严格无重叠打包
 * 目标：在某个域内执行纵向优先的无重叠打包，确保域内节点达到最小间距并消除重叠。
 */
export const enforceDomainNoOverlapStrict = (
  nodes: ReactFlowNode[],
  domainKey: string,
  hGap: number,
  vGap: number,
  maxIterations: number = 12
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
  const updated = nodes.map(n => ({ ...n }));
  const domainNodes = updated.filter(n => String((((n as any)?.data || {}) as any)?.domain || '') === domainKey && !isGroupType(n.type) && !((n as any)?.data || {})?.hidden);
  const getRect = (n: ReactFlowNode) => ({
    x: num((n as any)?.position?.x, 0),
    y: num((n as any)?.position?.y, 0),
    w: num((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width, 0),
    h: num((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height, 0),
  });
  if (domainNodes.length <= 1) return updated;
  for (let iter = 0; iter < Math.max(1, maxIterations); iter++) {
    const byY = domainNodes.slice().sort((a, b) => getRect(a).y - getRect(b).y);
    const placedY: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const n of byY) {
      const r = getRect(n);
      let shiftY = 0;
      for (const p of placedY) {
        const horizOverlap = !(r.x >= p.rect.x + p.rect.w || r.x + r.w <= p.rect.x);
        if (!horizOverlap) continue;
        const needTop = p.rect.y + p.rect.h + Math.max(8, vGap);
        if (r.y + shiftY < needTop) shiftY = needTop - r.y;
      }
      if (shiftY > 0) {
        const idx = updated.findIndex(u => u.id === n.id);
        const px = num((updated[idx] as any)?.position?.x, r.x);
        const py = num((updated[idx] as any)?.position?.y, r.y);
        (updated[idx] as any).position = { x: Math.round(px), y: Math.round(py + shiftY) } as any;
      }
      placedY.push({ id: n.id, rect: { ...r, y: r.y + shiftY } });
    }
    const byX = domainNodes.slice().sort((a, b) => getRect(a).x - getRect(b).x);
    const placedX: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const n of byX) {
      const r = getRect(n);
      let shiftX = 0;
      for (const p of placedX) {
        const vertOverlap = !(r.y >= p.rect.y + p.rect.h || r.y + r.h <= p.rect.y);
        if (!vertOverlap) continue;
        const needLeft = p.rect.x + p.rect.w + Math.max(12, hGap);
        if (r.x + shiftX < needLeft) shiftX = needLeft - r.x;
      }
      if (shiftX > 0) {
        const idx = updated.findIndex(u => u.id === n.id);
        const px = num((updated[idx] as any)?.position?.x, r.x);
        const py = num((updated[idx] as any)?.position?.y, r.y);
        (updated[idx] as any).position = { x: Math.round(px + shiftX), y: Math.round(py) } as any;
      }
      placedX.push({ id: n.id, rect: { ...r, x: r.x + shiftX } });
    }
    // 简单交叉计数；若为 0 则提前退出
    let ov = 0;
    for (let i = 0; i < domainNodes.length; i++) {
      const a = getRect(domainNodes[i]);
      for (let j = i + 1; j < domainNodes.length; j++) {
        const b = getRect(domainNodes[j]);
        const disjoint = a.x >= b.x + b.w || a.x + a.w <= b.x || a.y >= b.y + b.h || a.y + a.h <= b.y;
        if (!disjoint) ov++;
      }
    }
    if (ov <= 0) break;
  }
  return updated;
};

/**
 * 函数级注释：域级激进布局组合
 * 目标：对指定域集合执行“网格打包 + 严格无重叠打包”的组合，以更大幅度地消除布局中的残余重叠与不均匀。
 */

/**
 * 函数级注释：域级激进布局组合
 * 目标：对指定域集合执行“网格打包 + 严格无重叠打包”的组合，以更大幅度地消除布局中的残余重叠与不均匀。
 */
export const strengthenDomainsAggressive = (
  nodes: ReactFlowNode[],
  domainKeys: string[],
  baseHGap: number,
  baseVGap: number
): ReactFlowNode[] => {
  const updated = nodes.map(n => ({ ...n }));
  for (const dk of domainKeys) {
    const hEff = Math.round(Math.max(12, baseHGap) * 1.2);
    const vEff = Math.round(Math.max(8, baseVGap) * 1.2);
    const afterGrid = packDomainNodesGrid(updated, dk, hEff, vEff);
    const afterStrict = enforceDomainNoOverlapStrict(afterGrid, dk, Math.round(hEff * 1.1), Math.round(vEff * 1.1), 14);
    for (let i = 0; i < updated.length; i++) {
      const a = updated[i];
      const b = (afterStrict as any[]).find((x: any) => x.id === a.id);
      if (b) (updated[i] as any).position = { ...(b as any).position } as any;
    }
  }
  return updated;
};

/**
 * 函数级注释：按域的车道网格打包（组合层级），函数级注释
 * 目标：先按域分列，再在每个域内按层级（rank）分行打包，列内行居中，减少宽度偏差造成的全局抖动。
 */

/**
 * 函数级注释：按域的车道网格打包（组合层级），函数级注释
 * 目标：先按域分列，再在每个域内按层级（rank）分行打包，列内行居中，减少宽度偏差造成的全局抖动。
 */
export const laneGridPackByDomain = (
  nodes: ReactFlowNode[],
  hGap?: number,
  vGap?: number,
  nodeLayoutName?: string
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const LEFT = Math.max(40, num(cfgFull?.diagram?.padding?.left, 40));
  const TOP = Math.max(40, num(cfgFull?.diagram?.padding?.top, 40));
  const COL_PAD = Math.max(12, num(cfgFull?.domain?.padding?.horizontal, 24));
  const COL_GAP = Math.max(24, num(cfgFull?.domain?.gap, 40));
  const nl = String(nodeLayoutName || '').trim().toLowerCase();
  const COL_GAP_MULT = nl.includes('vertical') ? 1.35 : (nl.includes('centered') ? 1.2 : (nl.includes('grid') ? 1.0 : 1.1));
  const COL_GAP_ADJ = Math.round(COL_GAP * COL_GAP_MULT);
  const updated = nodes.map(n => ({ ...n }));
  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
  const biz = updated.filter(n => !isGroupType(n.type) && !((n as any)?.data || {})?.hidden);
  if (biz.length <= 1) return updated;
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), num(cfgFull?.node?.height, 80));
  const domainOf = (n: ReactFlowNode) => String((((n as any)?.data || {}) as any)?.domain || '').trim();
  const groups = new Map<string, ReactFlowNode[]>();
  for (const n of biz) { const d = domainOf(n); const arr = groups.get(d) || []; arr.push(n); groups.set(d, arr); }
  const avgX = (arr: ReactFlowNode[]) => arr.length ? arr.reduce((s, n) => s + num(((n as any)?.position?.x), 0), 0) / arr.length : 0;
  const orderedKeys = Array.from(groups.keys()).sort((a, b) => avgX(groups.get(a) || []) - avgX(groups.get(b) || []));
  let cx = LEFT;
  const halfIdx = Math.floor(orderedKeys.length / 2);
  for (let idxKey = 0; idxKey < orderedKeys.length; idxKey++) {
    const k = orderedKeys[idxKey];
    const arr = (groups.get(k) || []).slice();
    if (arr.length <= 1) { const n = arr[0]; if (n) { const idx = updated.findIndex(m => m.id === n.id); if (idx >= 0) (updated[idx] as any).position = { x: cx, y: TOP } as any; } cx += Math.max(getW(arr[0]), 120) + COL_GAP; continue; }
    // 构建域内层级基线
    const byCy = arr.slice().sort((a, b) => (num(((a as any)?.position?.y), 0) + getH(a) / 2) - (num(((b as any)?.position?.y), 0) + getH(b) / 2));
    const tol = Math.max(8, Math.floor(num(vGap, num(layoutCfg?.NODE_V_GAP, 80)) * 0.35));
    const ranks: Array<ReactFlowNode[]> = [];
    for (const n of byCy) {
      const cy = num(((n as any)?.position?.y), 0) + getH(n) / 2; let placed = false;
      for (const r of ranks) { const avgY = r.reduce((s, m) => s + (num(((m as any)?.position?.y), 0) + getH(m) / 2), 0) / r.length; if (Math.abs(avgY - cy) <= tol) { r.push(n); placed = true; break; } }
      if (!placed) ranks.push([n]);
    }
    // 列宽取各层最大行宽；行内居中打包
    const colWParts: number[] = [];
    const layerWidths: number[] = [];
    for (const r of ranks) { const widths = r.map(getW); const rowW = widths.reduce((s, w, i) => s + w + (i > 0 ? Math.max(12, num(hGap, num(layoutCfg?.NODE_H_GAP, 120))) : 0), 0); layerWidths.push(rowW); }
    const colW = Math.max(...layerWidths, 1) + COL_PAD * 2;
    let cy = TOP;
    const centerX = cx + Math.floor(colW / 2);
    for (const r of ranks) {
      const widths = r.map(getW);
      const rowW = widths.reduce((s, w, i) => s + w + (i > 0 ? Math.max(12, num(hGap, num(layoutCfg?.NODE_H_GAP, 120))) : 0), 0);
      let rx = centerX - Math.floor(rowW / 2);
      let rowMaxH = 0;
      for (let i = 0; i < r.length; i++) { const n = r[i]; const w = widths[i]; const idx = updated.findIndex(m => m.id === n.id); if (idx >= 0) (updated[idx] as any).position = { x: Math.round(rx), y: Math.round(cy) } as any; rx += w + Math.max(12, num(hGap, num(layoutCfg?.NODE_H_GAP, 120))); rowMaxH = Math.max(rowMaxH, getH(n)); }
      cy += rowMaxH + Math.max(8, num(vGap, num(layoutCfg?.NODE_V_GAP, 80)));
      colWParts.push(rowW);
    }
    const gapLocal = Math.max(24, Math.round(COL_GAP_ADJ * (idxKey >= halfIdx ? 1.2 : 1.0)));
    cx += Math.max(colW, 120) + gapLocal;
  }
  return updated;
};

/**
 * 函数级注释：子域网格统一打包
 * 目标：在每个 `subGroup` 内按可用内宽执行网格打包，超出自动换行，行内居中。
 */

/**
 * 函数级注释：子域网格统一打包
 * 目标：在每个 `subGroup` 内按可用内宽执行网格打包，超出自动换行，行内居中。
 */
export const packSubGroupChildrenGridStrict = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  const SUB_H = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const titleH = num((cfgFull?.subDomain?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT), 28);
  const titleV = num((cfgFull?.subDomain?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP), 8);
  const DEFAULT_TOP_PAD = Math.max(titleH + titleV, num((cfgFull?.subDomain?.padding?.top ?? layoutCfg?.SUB_GROUP_TITLE_CLEARANCE), titleH + titleV));
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), num(cfgFull?.node?.height, 80));
  const sgs = updated.filter(n => String(n.type || '') === 'subGroup');
  for (const sg of sgs) {
    const pos = (sg as any).position || { x: 0, y: 0 };
    const w = num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width), 0);
    const innerLeft = num(pos.x, 0) + SUB_H;
    const innerRight = num(pos.x, 0) + Math.max(1, w) - SUB_H;
    const innerWidth = Math.max(1, innerRight - innerLeft);
    const isGhost = Boolean(((sg as any)?.data || {})?.ghost);
    const ghostTopPad = Math.max(8, num(layoutCfg?.SUB_GROUP_GHOST_TOP_PAD, 12));
    const innerTop = num(pos.y, 0) + (isGhost ? ghostTopPad : DEFAULT_TOP_PAD);
    const chIds = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
    const list = chIds.map(id => idMap.get(id)).filter((n): n is ReactFlowNode => !!n);
    if (list.length <= 1) continue;
    const items = list.slice().sort((a, b) => {
      const saRaw = (a.data as any)?.sequence ?? (a.data as any)?.order;
      const sbRaw = (b.data as any)?.sequence ?? (b.data as any)?.order;
      const sa = typeof saRaw === 'number' ? saRaw : parseFloat(saRaw);
      const sb = typeof sbRaw === 'number' ? sbRaw : parseFloat(sbRaw);
      const hasA = isFinite(sa);
      const hasB = isFinite(sb);
      if (hasA && hasB) return sa - sb;
      if (hasA) return -1;
      if (hasB) return 1;
      // Fallback to original order (chIds order) instead of width
      return 0;
    });
    const rows: ReactFlowNode[][] = [];
    let currentRow: ReactFlowNode[] = [];
    let currentWidth = 0;
    for (const n of items) {
      const w0 = getW(n);
      const need = currentRow.length ? (w0 + Math.max(12, H_GAP)) : w0;
      if (currentWidth + need <= innerWidth) {
        currentRow.push(n);
        currentWidth += need;
      } else {
        if (currentRow.length) rows.push(currentRow);
        currentRow = [n];
        currentWidth = w0;
      }
    }
    if (currentRow.length) rows.push(currentRow);
    let cy = innerTop;
    for (const row of rows) {
      const widths = row.map(getW);
      const rowW = widths.reduce((s, w, i) => s + w + (i > 0 ? Math.max(12, H_GAP) : 0), 0);
      let cx = innerLeft + Math.floor(Math.max(0, (innerWidth - rowW)) / 2);
      let rowMaxH = 0;
      for (let i = 0; i < row.length; i++) {
        const n = row[i];
        const w0 = widths[i];
        const ix = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w0));
        const idx = updated.findIndex(m => m.id === n.id);
        if (idx >= 0) (updated[idx] as any).position = { x: Math.round(ix), y: Math.round(cy) } as any;
        cx = ix + w0 + Math.max(12, H_GAP);
        rowMaxH = Math.max(rowMaxH, getH(n));
      }
      cy += rowMaxH + Math.max(8, V_GAP);
    }
  }
  return updated;
};

/**
 * 函数级注释：子域严格无重叠打包
 * 目标：在每个 subGroup 的内容区内，对 children 执行迭代式成对分离，确保达到最小水平/垂直间距；
 * 实现：沿位移更小的轴成对推开，每次迭代后钳制到子域内容边界；默认迭代 3 次。
 */

/**
 * 函数级注释：子域严格无重叠打包
 * 目标：在每个 subGroup 的内容区内，对 children 执行迭代式成对分离，确保达到最小水平/垂直间距；
 * 实现：沿位移更小的轴成对推开，每次迭代后钳制到子域内容边界；默认迭代 3 次。
 */
export const enforceSubGroupNoOverlapStrict = (
  nodes: ReactFlowNode[],
  hGap?: number,
  vGap?: number,
  iterations: number = 3
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const H_G = (typeof hGap === 'number' && isFinite(hGap)) ? (hGap as number) : num(layoutCfg?.NODE_H_GAP, 120);
  const V_G = (typeof vGap === 'number' && isFinite(vGap)) ? (vGap as number) : num(layoutCfg?.NODE_V_GAP, 80);
  const SUB_H = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const titleH = num((cfgFull?.subDomain?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT), 28);
  const titleV = num((cfgFull?.subDomain?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP), 8);
  const DEFAULT_TOP_PAD = Math.max(titleH + titleV, num((cfgFull?.subDomain?.padding?.top ?? layoutCfg?.SUB_GROUP_TITLE_CLEARANCE), titleH + titleV));
  const SUB_BOTTOM = num((cfgFull?.subDomain?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 20);
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), num(cfgFull?.node?.height, 80));
  const rect = (n: ReactFlowNode) => ({ x: num(((n as any)?.position?.x), 0), y: num(((n as any)?.position?.y), 0), w: getW(n), h: getH(n) });

  const sgs = updated.filter(n => String(n.type || '') === 'subGroup');
  for (const sg of sgs) {
    const pos = rect(sg);
    const isGhost = Boolean(((sg as any)?.data || {})?.ghost);
    const ghostTopPad = Math.max(8, num(layoutCfg?.SUB_GROUP_GHOST_TOP_PAD, 12));
    const inner = { left: pos.x + SUB_H, right: pos.x + Math.max(1, pos.w) - SUB_H, top: pos.y + (isGhost ? ghostTopPad : DEFAULT_TOP_PAD), bottom: pos.y + Math.max(1, pos.h) - SUB_BOTTOM };
    const chIds = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
    const list = chIds.map(id => idMap.get(id)).filter((n): n is ReactFlowNode => !!n);
    if (list.length <= 1) continue;
    for (let iter = 0; iter < Math.max(1, iterations); iter++) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]; const b = list[j];
          const ra = rect(a); const rb = rect(b);
          const overlapX = Math.max(0, Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x));
          const overlapY = Math.max(0, Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y));
          const needX = overlapX > 0 ? Math.max(overlapX, H_G) : (Math.max(ra.x, rb.x) - Math.min(ra.x, rb.x) < H_G ? (H_G - Math.abs(ra.x - rb.x)) : 0);
          const needY = overlapY > 0 ? Math.max(overlapY, V_G) : (Math.max(ra.y, rb.y) - Math.min(ra.y, rb.y) < V_G ? (V_G - Math.abs(ra.y - rb.y)) : 0);
          if (needX <= 0 && needY <= 0) continue;
          const axis: 'x' | 'y' = (needX <= needY) ? 'x' : 'y';
          const delta = Math.ceil((axis === 'x' ? needX : needY) / 2);
          const ax = ra.x; const ay = ra.y; const bx = rb.x; const by = rb.y;
          if (axis === 'x') {
            const na = Math.max(inner.left, Math.min(inner.right - ra.w, ax - delta));
            const nb = Math.max(inner.left, Math.min(inner.right - rb.w, bx + delta));
            (a as any).position = { x: Math.round(na), y: Math.round(ay) } as any;
            (b as any).position = { x: Math.round(nb), y: Math.round(by) } as any;
          } else {
            const na = Math.max(inner.top, Math.min(inner.bottom - ra.h, ay - delta));
            const nb = Math.max(inner.top, Math.min(inner.bottom - rb.h, by + delta));
            (a as any).position = { x: Math.round(ax), y: Math.round(na) } as any;
            (b as any).position = { x: Math.round(bx), y: Math.round(nb) } as any;
          }
        }
      }
      // 钳制
      for (const n of list) {
        const r = rect(n);
        const nx = Math.min(Math.max(r.x, inner.left), Math.max(inner.left, inner.right - r.w));
        const ny = Math.min(Math.max(r.y, inner.top), Math.max(inner.top, inner.bottom - r.h));
        (n as any).position = { x: Math.round(nx), y: Math.round(ny) } as any;
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：域内子域“网格+无重叠”强化
 * 目标：对指定域内的所有子域执行“网格打包→严格无重叠→容器回收→严格包含→最终投影”的组合流程，提升布局稳定性。
 */

/**
 * 函数级注释：域内子域“网格+无重叠”强化
 * 目标：对指定域内的所有子域执行“网格打包→严格无重叠→容器回收→严格包含→最终投影”的组合流程，提升布局稳定性。
 */
export const strengthenSubGroupsInDomainWithGridStrict = (
  nodes: ReactFlowNode[],
  domainKey: string,
  hGap: number,
  vGap: number,
  iterations: number = 6
): ReactFlowNode[] => {
  const _num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const belongsToDomain = (n: ReactFlowNode) => {
    const d = String((((n as any)?.data || {}) as any)?.domain || '');
    return d === domainKey;
  };
  // 浠呴噸鎺掕鍩熷唴鐨勫瓙鍩?
  const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && belongsToDomain(n));
  if (!sgs.length) return updated;
  let tmp = packSubGroupChildrenGridStrict(updated);
  tmp = enforceSubGroupNoOverlapStrict(tmp, hGap, vGap, Math.max(1, iterations));
  tmp = recomputeSubGroupContainersBasic(tmp) as any;
  tmp = enforceSubGroupStrictContainmentByChildren(tmp) as any;
  // After container size adjustments, synchronize child positions based on __dagreRel
  tmp = syncDagreChildPositions(tmp) as any;
  tmp = finalizeSubGroupWidthsByProjectionPreserveAnchor(tmp) as any;
  tmp = finalizeSubGroupHeightsByProjectionPreserveAnchor(tmp) as any;
  return tmp as any;
};

/**
 * 函数级注释：使用 d3-force 在子域内进行无重叠分离
 * - 将每个 subGroup 的 children 作为点参与 simulation，使用 forceCollide(radius) 分离；
 * - 通过 forceX/forceY 将节点约束在子域内容区中心，迭代后做边界钳制。
 */

/**
 * 函数级注释：使用 d3-force 在子域内进行无重叠分离
 * - 将每个 subGroup 的 children 作为点参与 simulation，使用 forceCollide(radius) 分离；
 * - 通过 forceX/forceY 将节点约束在子域内容区中心，迭代后做边界钳制。
 */
export const resolveSubGroupChildrenOverlapWithD3Force = (
  nodes: ReactFlowNode[],
  iterations: number = 160,
  strength: number = 0.6
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const SUB_H = num((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const titleH = num((cfgFull?.subDomain?.title?.height ?? cfgFull?.subGroup?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT), 28);
  const titleV = num((cfgFull?.subDomain?.title?.padding?.vertical ?? cfgFull?.subGroup?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP), 8);
  const TOP_PAD = Math.max(titleH + titleV, num((cfgFull?.subDomain?.padding?.top ?? cfgFull?.subGroup?.padding?.top ?? layoutCfg?.SUB_GROUP_TITLE_CLEARANCE), titleH + titleV));
  const SUB_BOTTOM = num((cfgFull?.subDomain?.padding?.bottom ?? cfgFull?.subGroup?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 20);
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), num(cfgFull?.node?.height, 80));
  const rect = (n: ReactFlowNode) => ({ x: num(((n as any)?.position?.x), 0), y: num(((n as any)?.position?.y), 0), w: getW(n), h: getH(n) });
  const sgs = updated.filter(n => String(n.type || '') === 'subGroup');
  const H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  for (const sg of sgs) {
    const R = rect(sg);
    const inner = { left: R.x + SUB_H, right: R.x + Math.max(1, R.w) - SUB_H, top: R.y + TOP_PAD, bottom: R.y + Math.max(1, R.h) - SUB_BOTTOM };
    const cx = Math.round((inner.left + inner.right) / 2);
    const cy = Math.round((inner.top + inner.bottom) / 2);
    const chIds = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
    const list = chIds.map(id => idMap.get(id)).filter((n): n is ReactFlowNode => !!n);
    if (list.length <= 1) continue;
    const particles = list.map(n => {
      const r = rect(n);
      const baseR = Math.sqrt(r.w * r.w + r.h * r.h) / 2;
      const margin = Math.max(H_GAP, V_GAP) / 2;
      return { id: n.id, x: r.x, y: r.y, w: r.w, h: r.h, r: Math.round(Math.max(12, baseR + margin)) } as any;
    });
    const sim = forceSimulation(particles as any)
      .alpha(1)
      .alphaDecay(1 - Math.pow(0.001, 1 / iterations))
      .force('collide', forceCollide<any>().radius(d => Math.max(12, d.r)).strength(Math.min(1.0, Math.max(0.2, strength))))
      .force('centerX', forceX(cx).strength(strength * 0.85))
      .force('centerY', forceY(cy).strength(strength * 0.85))
      .stop();
    for (let i = 0; i < iterations; i++) sim.tick();
    for (const p of particles) {
      const nx = Math.min(Math.max(Math.round(p.x), inner.left), Math.max(inner.left, inner.right - p.w));
      const ny = Math.min(Math.max(Math.round(p.y), inner.top), Math.max(inner.top, inner.bottom - p.h));
      const idx = updated.findIndex(m => m.id === p.id);
      if (idx >= 0) (updated[idx] as any).position = { x: nx, y: ny } as any;
    }
  }
  return updated;
};

/**
 * 函数级注释：使用 d3-force 处理同域内子域容器的重叠
 * - 将子域容器按包围盒近似为圆盘，使用 forceCollide 分离；
 * - 以域中心为引力进行轻度收敛，保持子域互不覆盖。
 */

/**
 * 函数级注释：使用 d3-force 处理同域内子域容器的重叠
 * - 将子域容器按包围盒近似为圆盘，使用 forceCollide 分离；
 * - 以域中心为引力进行轻度收敛，保持子域互不覆盖。
 */
export const resolveSubGroupsOverlapWithD3Force = (
  nodes: ReactFlowNode[],
  iterations: number = 100,
  strength: number = 0.5
): ReactFlowNode[] => {
  const _cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const domains = Array.from(new Set(
    updated
      .filter(n => String(n.type || '') === 'titleGroup')
      .map(n => String((((n as any)?.data || {}) as any)?.domain || ''))
  )).filter(d => !!d);
  const rect = (n: ReactFlowNode) => ({ x: num(((n as any)?.position?.x), 0), y: num(((n as any)?.position?.y), 0), w: num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), 0), h: num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), 0) });
  const H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  for (const dk of domains) {
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && (
      String((((n as any)?.data || {}) as any)?.domain || '')
    ) === dk);
    if (sgs.length <= 1) continue;
    const particles = sgs.map(sg => {
      const r = rect(sg);
      const baseR = Math.sqrt(r.w * r.w + r.h * r.h) / 2;
      const margin = Math.max(H_GAP, V_GAP) / 2;
      return { id: sg.id, x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, r: Math.round(Math.max(24, baseR + margin)) } as any;
    });
    const cx = Math.round(particles.reduce((s, p) => s + p.x, 0) / particles.length);
    const cy = Math.round(particles.reduce((s, p) => s + p.y, 0) / particles.length);
    const sim = forceSimulation(particles as any)
      .alpha(1)
      .alphaDecay(1 - Math.pow(0.001, 1 / iterations))
      .force('collide', forceCollide<any>().radius(d => Math.max(24, d.r)).strength(Math.min(1.0, Math.max(0.2, strength))))
      .force('centerX', forceX(cx).strength(strength * 0.6))
      .force('centerY', forceY(cy).strength(strength * 0.6))
      .stop();
    for (let i = 0; i < iterations; i++) sim.tick();
    for (const p of particles) {
      const idx = updated.findIndex(m => m.id === p.id);
      if (idx >= 0) {
        const r = rect(updated[idx]);
        const nx = Math.round(p.x - r.w / 2);
        const ny = Math.round(p.y - r.h / 2);
        (updated[idx] as any).position = { x: nx, y: ny } as any;
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：高密子域的行拆分与自适应打包
 * 目标：针对内容密度较高的子域，自动将过长或过多节点的行拆分为两行以上，并按增大行/列间距进行打包，减小重叠与拥挤。
 */

/**
 * 函数级注释：高密子域的行拆分与自适应打包
 * 目标：针对内容密度较高的子域，自动将过长或过多节点的行拆分为两行以上，并按增大行/列间距进行打包，减小重叠与拥挤。
 */
export const splitDenseRowsInSubGroupsAdaptive = (
  nodes: ReactFlowNode[],
  maxPerRow?: number
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const BASE_H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const BASE_V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  const SUB_H = num((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const titleH = num((cfgFull?.subDomain?.title?.height ?? cfgFull?.subGroup?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT), 28);
  const titleV = num((cfgFull?.subDomain?.title?.padding?.vertical ?? cfgFull?.subGroup?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP), 8);
  const TOP_PAD = Math.max(titleH + titleV, num((cfgFull?.subDomain?.padding?.top ?? cfgFull?.subGroup?.padding?.top ?? layoutCfg?.SUB_GROUP_TITLE_CLEARANCE), titleH + titleV));
  const SUB_BOTTOM = num((cfgFull?.subDomain?.padding?.bottom ?? cfgFull?.subGroup?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 20);
  const MAX_PER = Math.max(2, num((cfgFull?.layout as any)?.maxPerRow ?? maxPerRow ?? 4, 4));
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
  const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), num(cfgFull?.node?.height, 80));

  const sgs = updated.filter(n => String(n.type || '') === 'subGroup');
  for (let i = 0; i < sgs.length; i++) {
    const sg = sgs[i];
    const pos = (sg as any).position || { x: 0, y: 0 };
    const w = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0);
    const h = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height)), 0);
    const innerLeft = num(pos.x, 0) + SUB_H;
    const innerRight = num(pos.x, 0) + Math.max(1, w) - SUB_H;
    const innerTop = num(pos.y, 0) + TOP_PAD;
    const innerWidth = Math.max(1, innerRight - innerLeft);
    const children = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
    const list = children
      .map(id => idMap.get(id))
      .filter((n): n is ReactFlowNode => !!n && !isGroupType(n.type) && !((n as any)?.data || {})?.hidden);
    if (list.length <= 1) continue;

    // 密度估算：节点数 / 子域内容面积
    const area = Math.max(1, Math.max(1, w) * Math.max(1, h));
    const density = Math.min(1.0, Math.max(0.0, list.length / area * 50000)); // 缁忛獙缂╂斁
    const scale = 1.0 + Math.min(0.6, density * 0.6);
    const H_GAP = Math.max(12, Math.floor(BASE_H_GAP * scale));
    const V_GAP = Math.max(8, Math.floor(BASE_V_GAP * scale));

    // 初始化行结构（按 Y 中心聚类）
    const rows: Array<ReactFlowNode[]> = [];
    const byCenterY = list.slice().sort((a, b) => (num(((a as any)?.position?.y), 0) + getH(a) / 2) - (num(((b as any)?.position?.y), 0) + getH(b) / 2));
    const tol = Math.max(8, Math.floor(V_GAP * 0.35));
    for (const n of byCenterY) {
      const cy = num(((n as any)?.position?.y), 0) + getH(n) / 2;
      let placed = false;
      for (const row of rows) {
        const avgY = row.reduce((s, m) => s + (num(((m as any)?.position?.y), 0) + getH(m) / 2), 0) / row.length;
        if (Math.abs(avgY - cy) <= tol) { row.push(n); placed = true; break; }
      }
      if (!placed) rows.push([n]);
    }

    // 行拆分：超过行宽或超过最大列数则拆分
    const wrapped: Array<ReactFlowNode[]> = [];
    for (const row of rows) {
      sortNodesInRow(row);
      const widths = row.map(n => getW(n));
      const rowWidth = widths.reduce((s, w, idx) => s + w + (idx > 0 ? H_GAP : 0), 0);
      if (row.length > MAX_PER || rowWidth > innerWidth) {
        const half = Math.ceil(row.length / 2);
        wrapped.push(row.slice(0, half));
        wrapped.push(row.slice(half));
      } else {
        wrapped.push(row);
      }
    }

    // 写回：居中打包 + 行间距，并回收容器尺寸
    let yCursor = innerTop;
    let maxContentW = 0;
    let totalRowsH = 0;
    for (const row of wrapped) {
      const widths = row.map(n => getW(n));
      const rowWidth = widths.reduce((s, w, idx) => s + w + (idx > 0 ? H_GAP : 0), 0);
      const startX = innerLeft + Math.floor(Math.max(0, (innerWidth - rowWidth)) / 2);
      let cx = startX;
      let rowMaxH = 0;
      for (let k = 0; k < row.length; k++) {
        const n = row[k];
        const w0 = widths[k];
        const idx = updated.findIndex(m => m.id === n.id);
        if (idx < 0) continue;
        const ix = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w0));
        const ih = getH(n);
        rowMaxH = Math.max(rowMaxH, ih);
        (updated[idx] as any).position = { x: Math.round(ix), y: Math.round(yCursor) } as any;
        cx = ix + w0 + H_GAP;
      }
      yCursor += rowMaxH + V_GAP;
      maxContentW = Math.max(maxContentW, rowWidth);
      totalRowsH += rowMaxH;
    }
    const interRowGaps = Math.max(0, wrapped.length - 1) * V_GAP;
    const newW = Math.max(0, Math.min(innerWidth, maxContentW) + SUB_H * 2);
    const newH = Math.max(0, totalRowsH + interRowGaps + TOP_PAD + Math.max(8, Math.floor(SUB_BOTTOM * 0.6)));
    ((sg as any).style || ((sg as any).style = {})).width = Math.round(newW);
    ((sg as any).style || ((sg as any).style = {})).height = Math.round(newH);
    (sg as any).measured = { width: Math.round(newW), height: Math.round(newH) } as any;
    (sg as any).width = Math.round(newW);
    (sg as any).height = Math.round(newH);
  }
  return updated;
};

/**
 * 函数级注释：子域容器语义归一化扩展
 * 基于标准化的 `subDomain` 键，计算该子域的全部业务节点的包围盒，并按“只扩展不收缩”的原则更新子域容器尺寸与位置。
 */

/**
 * 函数级注释：子域容器语义归一化扩展
 * 基于标准化的 `subDomain` 键，计算该子域的全部业务节点的包围盒，并按“只扩展不收缩”的原则更新子域容器尺寸与位置。
 */
export const expandSubGroupContainersBySemantic = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getSize = (n: ReactFlowNode): { w: number; h: number } => {
    const defW = num((layoutCfg?.NODE_MIN_WIDTH), 120);
    const defH = num((cfgFull?.node as any)?.height, 80);
    const w = num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), defW);
    const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), defH);
    return { w, h };
  };
  const padH = num((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const padTopConf = num((cfgFull?.subDomain?.padding?.top ?? cfgFull?.subGroup?.padding?.top ?? layoutCfg?.SUB_GROUP_PADDING?.V_TOP), 35);
  const ensureTitleClearance = !!layoutCfg?.ENSURE_SUB_GROUP_TITLE_CLEARANCE;
  const titleH = num((cfgFull?.subDomain?.title?.height ?? cfgFull?.subGroup?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT), 28);
  const titleV = num((cfgFull?.subDomain?.title?.padding?.vertical ?? cfgFull?.subGroup?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP), 8);
  const titleClearance = num(layoutCfg?.SUB_GROUP_TITLE_CLEARANCE, titleH + titleV);
  const padTop = ensureTitleClearance ? Math.max(padTopConf, titleClearance) : padTopConf;
  const padBottom = num((cfgFull?.subDomain?.padding?.bottom ?? cfgFull?.subGroup?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 20);
  const hGap = num(layoutCfg?.NODE_H_GAP, 120);
  const vGap = num(layoutCfg?.NODE_V_GAP, 80);
  const rightSafe = Math.max(6, Math.floor(hGap * 0.25));

  updated.filter(n => String(n.type || '') === 'subGroup').forEach(sg => {
    const _keyRaw = String((((sg as any)?.data?.subDomain) || '')).trim();
    const childIds = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
    const members = childIds
      .map(id => updated.find(nn => nn.id === id))
      .filter((nn): nn is ReactFlowNode => !!nn && !EXCLUDE.has(String(nn.type || '')) && !(((nn as any)?.data) || {})?.hidden);
    if (!members.length) return;
    // 行划分并计算行宽/总高（与基础模型一致）
    const rows: ReactFlowNode[][] = [];
    const sorted = members.slice().sort((a, b) => {
      const pa = (a as any)?.position || { x: 0, y: 0 };
      const pb = (b as any)?.position || { x: 0, y: 0 };
      const sa = getSize(a); const sb = getSize(b);
      return (num((pa as any).y, 0) + sa.h / 2) - (num((pb as any).y, 0) + sb.h / 2);
    });
    const avgH = sorted.length ? (sorted.reduce((s, m) => s + getSize(m).h, 0) / sorted.length) : num((cfgFull?.node as any)?.height, 80);
    const ROW_TOL_DYNAMIC = Math.max(6, Math.floor(Math.min(vGap * 0.35, avgH * 0.5)));
    for (const n of sorted) {
      const pn = (n as any)?.position || { x: 0, y: 0 };
      const sn = getSize(n);
      const cy = num((pn as any).y, 0) + sn.h / 2;
      let placed = false;
      for (const row of rows) {
        const rCy = row.reduce((s, m) => {
          const pm = (m as any)?.position || { x: 0, y: 0 };
          const sm = getSize(m);
          return s + (num((pm as any).y, 0) + sm.h / 2);
        }, 0) / row.length;
        if (Math.abs(cy - rCy) <= ROW_TOL_DYNAMIC) { row.push(n); placed = true; break; }
      }
      if (!placed) rows.push([n]);
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const rowWidths: number[] = [];
    const rowHeights: number[] = [];
    for (const row of rows) {
      const r = sortNodesInRow(row.slice());
      let sumW = 0; let maxHRow = 0;
      for (let i = 0; i < r.length; i++) {
        const s = getSize(r[i]);
        const p = (r[i] as any)?.position || { x: 0, y: 0 };
        const x = num((p as any).x, 0); const y = num((p as any).y, 0);
        sumW += s.w; if (i < r.length - 1) sumW += hGap;
        maxHRow = Math.max(maxHRow, s.h);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + s.w); maxY = Math.max(maxY, y + s.h);
      }
      rowWidths.push(sumW);
      rowHeights.push(maxHRow);
    }
    const interRowGaps = Math.max(0, rows.length - 1) * Math.max(8, Math.min(vGap, Math.floor((rowHeights.reduce((s, h) => s + h, 0) / Math.max(1, rowHeights.length)) * 0.6)));
    const rowsMaxW = rowWidths.length ? Math.max(...rowWidths) : 0;
    const spanW = Math.max(0, maxX - minX);
    const computedW = Math.max(rowsMaxW, spanW) + padH * 2 + rightSafe;
    const computedH = (rowHeights.length ? rowHeights.reduce((s, h) => s + h, 0) + interRowGaps : Math.max(0, maxY - minY)) + padTop + padBottom;
    const curW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
    const curH = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0);
    const finalW = Math.max(curW, computedW);
    const finalH = Math.max(curH, computedH);
    (sg as any).position = { x: Math.round(minX - padH), y: Math.round(minY - padTop) } as any;
    ((sg as any).style || ((sg as any).style = {})).width = Math.round(finalW);
    ((sg as any).style || ((sg as any).style = {})).height = Math.round(finalH);
    (sg as any).measured = { width: Math.round(finalW), height: Math.round(finalH) } as any;

  });

  return updated;
};

/**
 * 函数级注释：子域容器最终非收缩包含（基于 children bbox）
 * 目标：以 children 的最小/最大投影为基准，确保子域容器至少包含成员的 bbox + 安全留白；只扩展不收缩。
 */

/**
 * 函数级注释：子域容器最终非收缩包含（基于 children bbox）
 * 目标：以 children 的最小/最大投影为基准，确保子域容器至少包含成员的 bbox + 安全留白；只扩展不收缩。
 */
export const enforceSubGroupStrictContainmentByChildren = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const padH = num((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const padTopConf = num((cfgFull?.subDomain?.padding?.top ?? cfgFull?.subGroup?.padding?.top ?? layoutCfg?.SUB_GROUP_PADDING?.V_TOP), 35);
  const ensureTitleClearance = !!layoutCfg?.ENSURE_SUB_GROUP_TITLE_CLEARANCE;
  const titleH = num((cfgFull?.subDomain?.title?.height ?? cfgFull?.subGroup?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT), 28);
  const titleV = num((cfgFull?.subDomain?.title?.padding?.vertical ?? cfgFull?.subGroup?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP), 8);
  const titleClearance = num(layoutCfg?.SUB_GROUP_TITLE_CLEARANCE, titleH + titleV);
  const padTop = ensureTitleClearance ? Math.max(padTopConf, titleClearance) : padTopConf;
  const padBottom = num(cfgFull?.subDomain?.padding?.bottom, num(layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM, 20));
  const hGap = num(layoutCfg?.NODE_H_GAP, 120);
  const _rightSafe = Math.max(6, Math.floor(hGap * 0.25));

  const getSize = (n: ReactFlowNode): { w: number; h: number } => {
    const defW = num((layoutCfg?.NODE_MIN_WIDTH), 120);
    const defH = num((cfgFull?.node as any)?.height, 80);
    const w = num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), defW);
    const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), defH);
    return { w, h };
  };

  // 计算标题区和 safeGap
  const safeGap = num(cfgFull?.subDomain?.title?.safeGap, 0);
  const contentAreaTop = titleH + titleV + padTop + safeGap;

  updated.filter(n => String(n.type || '') === 'subGroup').forEach(sg => {
    const children = Array.isArray(((sg as any)?.data || {})?.children) ? ((((sg as any).data).children as string[])) : [];
    const list = children
      .map(id => idMap.get(id))
      .filter((nn): nn is ReactFlowNode => !!nn && !EXCLUDE.has(String(nn.type || '')) && !(((nn as any)?.data) || {})?.hidden);
    if (list.length <= 0) return;

    // 获取容器当前位置
    const _sgX = num(((sg as any)?.position?.x), 0);
    const _sgY = num(((sg as any)?.position?.y), 0);

    // 直接使用绝对坐标计算内容边界（与 reflowSubGroupChildrenDagre 一致）
    let absMinX = Infinity, absMinY = Infinity, absMaxX = -Infinity, absMaxY = -Infinity;
    for (const m of list) {
      const p = (m as any)?.position || { x: 0, y: 0 };
      const s = getSize(m);
      const mx = num((p as any).x, 0);
      const my = num((p as any).y, 0);
      absMinX = Math.min(absMinX, mx);
      absMinY = Math.min(absMinY, my);
      absMaxX = Math.max(absMaxX, mx + s.w);
      absMaxY = Math.max(absMaxY, my + s.h);
    }
    if (!isFinite(absMinX) || !isFinite(absMinY) || !isFinite(absMaxX) || !isFinite(absMaxY)) return;

    // 内容边界宽高
    const contentWidth = absMaxX - absMinX;
    const contentHeight = absMaxY - absMinY;

    // 精准尺寸计算（与 reflowSubGroupChildrenDagre 保持一致）
    // 宽度 = 内容宽度 + 左右 padding
    const preciseW = contentWidth + padH * 2;
    // 高度 = 标题区 + 内容高度 + 底部 padding
    const preciseH = contentHeight + contentAreaTop + padBottom;

    // 最小尺寸限制
    const finalW = Math.max(Math.round(preciseW), 100);
    const finalH = Math.max(Math.round(preciseH), 60);

    // 写入最终尺寸
    ((sg as any).style || ((sg as any).style = {})).width = finalW;
    ((sg as any).style || ((sg as any).style = {})).height = finalH;
    (sg as any).measured = { width: finalW, height: finalH } as any;
  });

  return updated;
};

/**
 * 函数级注释：按语义分配子域 children
 * 依据节点的 `data.subDomain` 与容器的 `data.description/subDomain/id` 进行匹配；
 * 若容器声明了 `data.domain`，则要求节点的 `data.domain` 与之相同；
 * 不做任何几何包含判断，避免“容器误吸收自由节点”的问题。
 */

/**
 * 函数级注释：同域内子域容器重叠消解
 * 目标：在同一域内，确保所有 `subGroup` 容器互不重叠，并保持合理间距。
 * 策略：
 * - 垂直避让：按 y 升序，仅在水平投影有交叠时进行；行距取 `NODE_V_GAP`；
 * - 水平避让：按 x 升序，仅在垂直投影有交叠时进行；列距取 `NODE_H_GAP`；
 * - 发生位移时同步平移容器的 children，保持“语义包含”。
 */
export const resolveSubGroupOverlaps = (
  nodes: ReactFlowNode[],
  gapHOverride?: number,
  gapVOverride?: number
): ReactFlowNode[] => {
  const cfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const vGap = (typeof gapVOverride === 'number' && isFinite(gapVOverride)) ? gapVOverride : num(cfg?.NODE_V_GAP, 80);
  const hGap = (typeof gapHOverride === 'number' && isFinite(gapHOverride)) ? gapHOverride : num(cfg?.NODE_H_GAP, 120);

  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));

  const getRect = (n: ReactFlowNode) => {
    const w = num((n as any)?.measured?.width ?? (n.style as any)?.width, 0);
    const h = num((n as any)?.measured?.height ?? (n.style as any)?.height, 0);
    const x = num(n.position?.x, 0);
    const y = num(n.position?.y, 0);
    return { x, y, w, h };
  };
  const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };

  // 辅助：平移子域容器及其 children 节点
  const translateSubGroup = (sgId: string, dx: number, dy: number) => {
    const idx = updated.findIndex(n => n.id === sgId);
    if (idx < 0) return;
    const sg = updated[idx];
    const px = num(sg.position?.x, 0);
    const py = num(sg.position?.y, 0);
    const newPos = { x: px + dx, y: py + dy } as XYPosition;
    updated[idx] = { ...sg, position: newPos } as any;
    // 维护可能存在的 data.position（兼容旧逻辑）
    const nd: any = { ...(updated[idx].data || {}) };
    if (nd.position && typeof nd.position === 'object') {
      nd.position = { x: num(nd.position.x, 0) + dx, y: num(nd.position.y, 0) + dy };
      (updated[idx] as any).data = nd;
    }
    // 同步平移 children 节点
    const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
    for (const cid of children) {
      const cn = idMap.get(cid);
      if (!cn) continue;
      const cx = num(cn.position?.x, 0);
      const cy = num(cn.position?.y, 0);
      (idMap.get(cid) as any).position = { x: cx + dx, y: cy + dy } as XYPosition;
      const cIdx = updated.findIndex(n => n.id === cid);
      if (cIdx >= 0) {
        updated[cIdx] = { ...updated[cIdx], position: { x: cx + dx, y: cy + dy } as XYPosition } as any;
      }
    }
  };

  const subGroups = updated.filter(n => String(n.type || '') === 'subGroup');
  if (subGroups.length <= 1) return updated;

  // ========== 全局跨域子域重叠消解（优先处理）==========
  // 先对所有可见子域进行全局垂直重叠消解，无论它们属于哪个域
  {
    const allSgs = subGroups.filter(sg => !((sg as any)?.data)?.hidden);
    if (allSgs.length > 1) {
      // 按 y 坐标排序
      const byY = allSgs.slice().sort((a, b) => getRect(a).y - getRect(b).y);
      const placedGlobal: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];

      for (const sg of byY) {
        const r = getRect(sg);
        let shiftY = 0;
        for (const p of placedGlobal) {
          // 检查水平是否有重叠
          const horizOverlap = !(r.x + r.w <= p.rect.x || p.rect.x + p.rect.w <= r.x);
          if (!horizOverlap) continue;
          // 计算需要的垂直位移
          const requiredTop = p.rect.y + p.rect.h + vGap;
          if (r.y + shiftY < requiredTop) {
            shiftY = Math.max(shiftY, requiredTop - r.y);
          }
        }
        if (shiftY > 0) translateSubGroup(sg.id, 0, shiftY);
        placedGlobal.push({ id: sg.id, rect: { ...r, y: r.y + shiftY } });
      }
    }
  }

  // 按域分桶处理（原有逻辑，用于同域内精细调整）
  const buckets: Record<string, ReactFlowNode[]> = {};
  for (const sg of subGroups) {
    const d = String(((sg.data as any)?.domain || ''));
    if (!d) continue;
    if (!buckets[d]) buckets[d] = [];
    buckets[d].push(sg);
  }

  for (const d of Object.keys(buckets)) {
    const list = buckets[d];
    if (list.length <= 1) continue;

    // 1) 垂直方向重叠消解：按 y 升序
    const byY = list.slice().sort((a, b) => getRect(a).y - getRect(b).y);
    const placedY: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const sg of byY) {
      const r = getRect(sg);
      let shiftY = 0;
      for (const p of placedY) {
        const horizOverlap = !(r.x + r.w <= p.rect.x || p.rect.x + p.rect.w <= r.x);
        if (!horizOverlap) continue;
        const requiredTop = p.rect.y + p.rect.h + vGap;
        if (r.y + shiftY < requiredTop) {
          shiftY = Math.max(shiftY, requiredTop - r.y);
        }
      }
      if (shiftY > 0) translateSubGroup(sg.id, 0, shiftY);
      placedY.push({ id: sg.id, rect: { ...r, y: r.y + shiftY } });
    }

    // 2) 水平方向重叠消解：按 x 升序（微向下分布到底）
    const currentList = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === d);
    const byX = currentList.slice().sort((a, b) => getRect(a).x - getRect(b).x);
    const placedX: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const sg of byX) {
      const r = getRect(sg);
      let shiftX = 0;
      for (const p of placedX) {
        const vertOverlap = !(r.y + r.h <= p.rect.y || p.rect.y + p.rect.h <= r.y);
        if (!vertOverlap) continue;
        const requiredLeft = p.rect.x + p.rect.w + hGap;
        if (r.x + shiftX < requiredLeft) {
          shiftX = Math.max(shiftX, requiredLeft - r.x);
        }
      }
      if (shiftX > 0) translateSubGroup(sg.id, shiftX, 0);
      placedX.push({ id: sg.id, rect: { ...r, x: r.x + shiftX } });
    }

    // 3) 安全兜底：有限回退，确保不出现任何重叠
    const getSgs = () => updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === d);
    let iter = 0;
    const maxIter = 4;
    while (iter < maxIter) {
      const sgs = getSgs();
      let collision = false;
      for (let i = 0; i < sgs.length; i++) {
        for (let j = i + 1; j < sgs.length; j++) {
          const a = getRect(sgs[i]);
          const b = getRect(sgs[j]);
          if (intersects(a, b)) {
            collision = true;
            translateSubGroup(sgs[j].id, Math.ceil(hGap * 0.25), Math.ceil(vGap * 0.15));
          }
        }
      }
      if (!collision) break;
      iter++;
    }

    // 行打包：若仍可能存在重叠或拥挤，基于域内部边界执行一次并行打包
    const titleGroup = updated.find(n => String(n.type || '') === 'titleGroup' && String(((n.data as any)?.domain || '')) === d);
    if (titleGroup) {
      const cfgFull = diagramConfigManager.getConfig() as any;
      const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
      const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
      const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
      const titleH = num(cfgFull?.domain?.title?.height, 40);
      const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
      const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
      const subPadH = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), Math.max(16, Math.floor(padH * 0.8)));
      const subTitleH = num(cfgFull?.subDomain?.title?.height, 28);
      const subTitleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
      const subPadTop = num((layoutCfg?.SUB_GROUP_PADDING?.V_TOP ?? cfgFull?.subDomain?.padding?.top ?? cfgFull?.subDomain?.padding?.vertical), Math.max(12, Math.floor(padH * 0.8)));
      const left = num(((titleGroup as any)?.position?.x), 0) + padH;
      const innerTop = num(((titleGroup as any)?.position?.y), 0) + titleH + titleV + titleSafe;
      const _right = left + num((((titleGroup as any)?.measured?.width ?? (titleGroup as any)?.style?.width)), 0) - padH * 2;
      const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === d)
        .slice().sort((a, b) => {
          const ra = getRect(a); const rb = getRect(b);
          // 优先按宽度限制：尽量设置容器，降低换行撕裂与拥挤概率；先按 y 再按 x
          return (rb.w - ra.w) || (ra.y - rb.y) || (ra.x - rb.x);
        });
      const rowTop = innerTop - subTitleH - subTitleV - subPadTop;
      let cursorX = left - subPadH;
      let rowMaxH = 0;
      const _totalW = sgs.reduce((sum, sg) => sum + getRect(sg).w, 0);
      const canSingleRow = true;
      if (canSingleRow) {
        for (const sg of sgs) {
          const r = getRect(sg);
          const dx = Math.round(cursorX - r.x);
          const dy = Math.round(rowTop - r.y);
          translateSubGroup(sg.id, dx, dy);
          cursorX += r.w + hGap;
          rowMaxH = Math.max(rowMaxH, r.h);
        }
      }
      // 琛屾墦鍖呭悗绔嬪嵆鍥炴敹瀛愬煙瀹瑰櫒灏哄骞朵弗鏍煎寘鍚煙瀹瑰櫒
      let after = recomputeSubGroupContainersBasic(updated);
      after = enforceDomainContainerStrictContainment(after);
      updated.splice(0, updated.length, ...after);
    }
  }

  return updated;
};

/**
 * 函数级注释：子域容器尺寸回收（基础版）
 * 目标：基于 `subGroup.children` 的最终位置与尺寸，重算并写回子域容器的 `position/style/measured`，保证语义包含。
 */

/**
 * 函数级注释：子域容器尺寸回收（基础版）
 * 目标：基于 `subGroup.children` 的最终位置与尺寸，重算并写回子域容器的 `position/style/measured`，保证语义包含。
 */
export const recomputeSubGroupContainersBasic = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  /**
   * 函数级注释：子域“行列结构”感知的尺寸回收
   * 目标：依据子域内部业务节点的最终行列结构，合理计算容器的宽高：
   * - 水平方向：行宽=节点宽度和+行内最小水平间距，取最大行宽；
   * - 垂直方向：总高=各行最大高度之和 + 行间最小垂直间距；
   * - 位置：容器左上角对齐到“内容最小 x/y”减去标题与内边距的安全留白。
   */
  const cfgLayout = diagramConfigManager.getLayoutConfig() as any;
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const subPadTop = num((cfgFull?.subDomain?.padding?.top ?? cfgFull?.subGroup?.padding?.top ?? cfgLayout?.SUB_GROUP_PADDING?.V_TOP), 28);
  const padH = Number((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? cfgLayout?.SUB_GROUP_PADDING?.H) ?? 30);
  const titleH = Number(cfgFull?.subDomain?.title?.height ?? cfgFull?.subDomain?.title?.height ?? 28);
  const titleV = Number(cfgFull?.subDomain?.title?.padding?.vertical ?? cfgFull?.subDomain?.title?.padding?.vertical ?? 8);
  const ensureClear = !!cfgLayout?.ENSURE_SUB_GROUP_TITLE_CLEARANCE;
  const titleClearance = Number(cfgLayout?.SUB_GROUP_TITLE_CLEARANCE ?? (titleH + titleV));
  const padTop = (ensureClear ? Math.max(titleH + titleV, titleClearance) : (titleH + titleV)) + subPadTop;
  const padBottom = Number((cfgFull?.subDomain?.padding?.bottom ?? cfgFull?.subDomain?.padding?.bottom ?? cfgLayout?.SUB_GROUP_PADDING?.V_BOTTOM) ?? 28);
  const hGap = Number(cfgLayout?.NODE_H_GAP ?? 120);
  const vGap = Number(cfgLayout?.NODE_V_GAP ?? 80);
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n.style as any)?.width ?? (n as any)?.width), 0);
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n.style as any)?.height ?? (n as any)?.height), 0);
  const getX = (n: ReactFlowNode) => num(((n.position as any)?.x), 0);
  const getY = (n: ReactFlowNode) => num(((n.position as any)?.y), 0);
  const rectsIntersect = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };

  const _ROW_TOL = Math.max(6, Math.floor(vGap * 0.3));

  updated.filter(n => String(n.type || '') === 'subGroup').forEach(sg => {
    const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];

    // dagre 模式检测：检查子域自身的 __dagreSized 标记（由 reflowSubGroupChildrenDagre 设置）
    const dagreSized = (sg.data as any)?.__dagreSized;
    safeLog.debug(`[DAGRE-MARKER] "${String((sg.data as any)?.description || sg.id).substring(0, 12)}" dagreSized=${JSON.stringify(dagreSized)}`);
    if (dagreSized && typeof dagreSized.h === 'number' && dagreSized.h > 0) {
      // 使用 dagre 计算的精确尺寸
      const useW = (typeof dagreSized.w === 'number' && dagreSized.w > 0) ? dagreSized.w : num((sg as any)?.style?.width ?? (sg as any)?.measured?.width, 0);
      safeLog.debug(`[RECOMPUTE-SKIP] "${String((sg.data as any)?.description || sg.id).substring(0, 12)}" using dagreSized w=${useW}, h=${dagreSized.h}`);
      if (useW > 0) {
        (sg as any).style = { ...((sg as any).style || {}), width: useW, height: dagreSized.h };
        (sg as any).measured = { width: useW, height: dagreSized.h };
        (sg as any).width = useW;
        (sg as any).height = dagreSized.h;
        return; // 跳过此子域的尺寸回收
      }
    }

    const childNodesRaw = children
      .map(id => idMap.get(id))
      .filter((cn): cn is ReactFlowNode => !!cn && !EXCLUDE.has(String(cn.type || '')) && !((cn as any)?.data || {})?.hidden);
    const seen = new Set<string>();
    let childNodes = childNodesRaw.filter(cn => { if (seen.has(cn.id)) return false; seen.add(cn.id); return true; });
    if (!childNodes.length) {
      const pos = sg.position || { x: 0, y: 0 } as any;
      const size = { w: num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width), 0), h: num(((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height), 0) };
      const innerLeft = num(pos.x, 0) + padH;
      const innerTop = num(pos.y, 0) + padTop;
      const innerRight = num(pos.x, 0) + Math.max(1, size.w) - padH;
      const innerBottom = num(pos.y, 0) + Math.max(1, size.h) - padBottom;
      const domKey = String((((sg as any)?.data?.domain || ''))).trim();
      const candidates = updated.filter(n => {
        const t = String(n.type || '');
        if (EXCLUDE.has(t)) return false;
        if (((n as any)?.data || {})?.hidden) return false;
        const d1 = String(((n.data as any)?.domain || '')).trim();
        if (domKey && d1 !== domKey) return false;
        const nx = getX(n); const ny = getY(n); const nw = getW(n); const nh = getH(n);
        const innerRect = { x: innerLeft, y: innerTop, w: Math.max(1, innerRight - innerLeft), h: Math.max(1, innerBottom - innerTop) };
        const nodeRect = { x: nx, y: ny, w: nw, h: nh };
        return rectsIntersect(nodeRect, innerRect);
      });
      if (candidates.length) {
        childNodes = candidates;
      } else {
        const finalBottomSafe = Math.max(Math.floor(vGap * 0.2), Math.max(6, Math.floor(padBottom * 0.8)));
        const minH = padTop + padBottom + finalBottomSafe;
        const curW = num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width), 0);
        (sg.style as any).height = Math.round(minH);
        (sg as any).measured = { width: Math.round(curW), height: Math.round(minH) } as any;
        return;
      }
    }


    // 1) 按行分组：以 y 中心为依据，近似视为同一行
    const rows: ReactFlowNode[][] = [];
    const sorted = childNodes.slice().sort((a, b) => getY(a) + getH(a) / 2 - (getY(b) + getH(b) / 2));
    const avgH = sorted.length ? (sorted.reduce((s, m) => s + getH(m), 0) / sorted.length) : num((cfgFull?.node as any)?.height, 80);
    const ROW_TOL_DYNAMIC = Math.max(6, Math.floor(Math.min(vGap * 0.35, avgH * 0.5)));
    for (const n of sorted) {
      const cy = getY(n) + getH(n) / 2;
      let placed = false;
      for (const row of rows) {
        const rCy = row.reduce((s, m) => s + (getY(m) + getH(m) / 2), 0) / row.length;
        if (Math.abs(cy - rCy) <= ROW_TOL_DYNAMIC) { row.push(n); placed = true; break; }
      }
      if (!placed) rows.push([n]);
    }
    // 每行按 x 升序，计算行宽（含节点间水平间距）与行高（最大高度）
    let maxRowWidth = 0; const rowHeights: number[] = [];
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const row of rows) {
      const r = row.slice().sort((a, b) => getX(a) - getX(b));
      let sumW = 0; let maxH = 0;
      for (let i = 0; i < r.length; i++) {
        const w = getW(r[i]); const h = getH(r[i]);
        sumW += w; maxH = Math.max(maxH, h);
        if (i < r.length - 1) sumW += hGap; // 琛屽唴鑺傜偣闂寸暀鐧?
        const x = getX(r[i]); const y = getY(r[i]);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
      }
      maxRowWidth = Math.max(maxRowWidth, sumW);
      rowHeights.push(maxH);
    }
    // 行间垂直留白：动态按行基准高度与配置 vGap 组合确定
    const avgRowH = rowHeights.length ? Math.round(rowHeights.reduce((s, h) => s + h, 0) / rowHeights.length) : num((cfgFull?.node as any)?.height, 80);
    const vGapEff = Math.max(8, Math.min(vGap, Math.floor(avgRowH * 0.6)));
    const _interRowGaps = Math.max(0, rows.length - 1) * vGapEff;

    // 2) 璁＄畻瀹瑰櫒灏哄锛氫互鍑犱綍鎶曞奖涓哄敮涓€渚濇嵁锛堜弗鏍煎寘鍚?+ 閫傚害瀹夊叏鐣欑櫧锛?
    const contentW = Math.max(0, maxX - minX);
    const contentH = Math.max(0, maxY - minY);
    const finalSafeTotalH = Math.max(0, Math.min(Math.floor(padH * 0.25), Math.floor(hGap * 0.1), 10));
    const safeLeftH = Math.floor(finalSafeTotalH / 2);
    const safeRightH = finalSafeTotalH - safeLeftH;
    const newW = Math.max(0, contentW + padH * 2 + safeLeftH + safeRightH);
    const minHConfig = num(cfgLayout?.SUB_GROUP_MIN_HEIGHT, 200);
    const newH = Math.max(minHConfig, contentH + padTop + padBottom);
    const finalW = Math.round(newW);
    const finalH = Math.round(newH);

    // 3) 定位：左上角为内容最小 x/y 减去标题与上内边距的安全留白
    const newPos = { x: Math.round(minX - padH - safeLeftH), y: Math.round(minY - padTop) } as any;
    sg.position = newPos;
    (sg.style as any).width = finalW;
    (sg.style as any).height = finalH;
    (sg as any).measured = { width: finalW, height: finalH } as any;
    sg.zIndex = typeof sg.zIndex === 'number' ? sg.zIndex : -5;
  });

  return updated;
};

/**
 * 函数级注释：子域 children 同步（按成员归属）
 * 目标：将每个子域容器的 children 列表强制同步为“所有具有同 subDomain 的业务节点集合”，避免位置变化导致 children 缺失。
 * 规则：
 * - 子域标识来源：优先 `sg.data.description`，否则从 `sg.id` 的 `subgroup-<key>` 提取；
 * - 仅包含非容器节点；
 * - 同步后保持并写全 `domain/domainClass`（多数值）。
 */

/**
 * 函数级注释：域内块级密度处理
 * 目标：在同一域内，将子域容器与普通业务节点视为块，并按最小块间距进行收敛，减少不必要留白。
 */

/**
 * 瀛愬煙瀹瑰櫒琛屾墦鍖呮帓甯冿紙鍑芥暟绾ф敞閲婏級
 * 目标：在同一 domain 内，将所有 subGroup 按域内部边界进行“依行打包”，避免随意重叠。
 * 规则：
 * - 域内部边界：left = titleGroup.x + domain.padding.horizontal；right = titleGroup.width - domain.padding.horizontal；
 * - 起始行顶：innerTop = title.height + title.padding.vertical + title.safeGap；
 * - 行内依次设置子域；超出右边界则换行；行高为该行子域最大高度；行距 = NODE_V_GAP；
 * - 子域位移时，同步 children 的坐标（dx/dy）。
 */
export const packSubGroupsInDomain = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const strictElk = Boolean(layoutCfg?.ELK_STRICT_MODE ?? (cfgFull?.layout?.ELK_STRICT_MODE));
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const titleH = num(cfgFull?.domain?.title?.height, 40);
  const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
  const hGapBase = num(layoutCfg?.NODE_H_GAP, 120);
  const _vGapBase = num(layoutCfg?.NODE_V_GAP, 80);

  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n.style as any)?.width), 240);
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n.style as any)?.height), 120);
  const getX = (n: ReactFlowNode) => num(((n.position as any)?.x), 0);
  const getY = (n: ReactFlowNode) => num(((n.position as any)?.y), 0);

  const domainsSet = new Set<string>();
  for (const n of updated) {
    const d = String((((n as any)?.data && (n as any).data.domain) || '')).trim();
    if (d) domainsSet.add(d);
  }
  const domains = Array.from(domainsSet);
  for (const d of domains) {
    const tg = updated.find(n => String(n.type || '') === 'titleGroup' && String(((n.data as any)?.domain || '')) === d);
    if (!tg) continue;
    const left = num(((tg as any)?.position?.x), 0) + padH;
    const innerTop = num(((tg as any)?.position?.y), 0) + titleH + titleV + titleSafe;
    const right = left + num(((tg as any)?.measured?.width ?? (tg as any)?.style?.width), 0) - padH * 2;
    const sgs = updated
      .filter(n => {
        const tp = String(n.type || '');
        if (tp !== 'subGroup') return false;
        const d1 = String(((n.data as any)?.domain || '')).trim();
        return d1 === d;
      })
      .slice().sort((a, b) => (getY(a) - getY(b)) || (getX(a) - getX(b)));

    // ✨ 整体居中逻辑: 先计算hGapEff以便计算总宽度
    const scaleH = num(cfgFull?.layout?.autoGapScale?.h, 1);
    const hGapEff = Math.max(12, Math.floor(hGapBase * Math.min(1.0, scaleH)));

    // ✨ 整体居中逻辑: 计算所有子域的总宽度
    const subWidths = sgs.map(sg => getW(sg));
    const totalSubWidth = subWidths.reduce((sum, w) => sum + w, 0);
    const totalGaps = Math.max(0, sgs.length - 1) * hGapEff;
    const totalWidthNeeded = totalSubWidth + totalGaps;

    // ✨ 整体居中逻辑: 计算可用宽度并计算居中起点
    const availWidth = Math.max(1, right - left);
    const spaceRemaining = Math.max(0, availWidth - totalWidthNeeded);
    const centeredStartX = left + (spaceRemaining / 2);

    const rowTop = innerTop;
    let cursorX = centeredStartX;  // ✨ 从居中起点开始,而非域左边界left
    let rowMaxH = 0;
    for (const sg of sgs) {
      const w = getW(sg);
      const h = getH(sg);
      // 不换行：始终序列展开，容器宽度在后续尺寸回收中统一扩展
      const dx = Math.round(cursorX) - getX(sg);
      const dy = Math.round(rowTop) - getY(sg);
      (sg as any).position = { x: Math.round(cursorX), y: Math.round(rowTop) } as any;
      const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
      if (!strictElk) {
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          (child as any).position = { x: getX(child) + dx, y: getY(child) + dy } as any;
        }
      }
      cursorX += w + hGapEff;
      rowMaxH = Math.max(rowMaxH, h);
    }
  }
  return updated;
};

/**
 * 函数级注释：同点坐标散列（节点级）
 * - 目的：当一组节点的 position 出现多个完全相同坐标时，沿指定轴按最小间距均匀展开；
 * - 适用：ELK layered 或其他分层算法输出造成的“一对多/多对一”同点重叠；
 * - 参数：`axis` 为 'x' 或 'y'；`gap` 为散列步长；`tolerance` 为坐标聚类容差。
*/

/**
 * 函数级注释：统计域下子域容器的重叠数量
 */
export const countSubGroupOverlapsByDomain = (
  nodes: ReactFlowNode[]
): number => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n.style as any)?.width), 240);
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n.style as any)?.height), 120);
  const getX = (n: ReactFlowNode) => num(((n.position as any)?.x), 0);
  const getY = (n: ReactFlowNode) => num(((n.position as any)?.y), 0);
  let total = 0;
  const domainsSet = new Set<string>();
  for (const n of nodes) {
    const d = String((((n as any)?.data && (n as any).data.domain) || '')).trim();
    if (d) domainsSet.add(d);
  }
  const domains = Array.from(domainsSet);
  for (const d of domains) {
    const sgs = nodes.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === d);
    const rects = sgs.map(n => ({ x: getX(n), y: getY(n), width: getW(n), height: getH(n) }));
    total += countRectOverlaps(rects);
  }
  return total;
};

/**
 * 函数级注释：统计域容器之间的重叠数量
 */

/**
 * 函数级注释：子域容器间距统一
 * 目标：在同一域内，将可见的子域容器按行分组后统一行间距，并将每行统一纵向间距的打包应用到 children 以保持同步。
 */
export const unifySubGroupGapsInDomain = (
  nodes: ReactFlowNode[],
  gapHOverride?: number,
  gapVOverride?: number,
  customSort?: (a: ReactFlowNode, b: ReactFlowNode) => number
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const titleH = num(cfgFull?.domain?.title?.height, 40);
  const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
  const subPadH = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), Math.max(16, Math.floor(padH * 0.8)));
  const subPadTop = num((layoutCfg?.SUB_GROUP_PADDING?.V_TOP ?? cfgFull?.subDomain?.padding?.top ?? cfgFull?.subDomain?.padding?.vertical), Math.max(12, Math.floor(padH * 0.8)));
  const subTitleH = num(cfgFull?.subDomain?.title?.height, 28);
  const subTitleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const hGap = (typeof gapHOverride === 'number' && isFinite(gapHOverride)) ? gapHOverride : num(layoutCfg?.NODE_H_GAP, 120);
  const vGap = (typeof gapVOverride === 'number' && isFinite(gapVOverride)) ? gapVOverride : num(layoutCfg?.NODE_V_GAP, 80);
  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const dx = num(((dc as any)?.position?.x), 0);
    const dy = num(((dc as any)?.position?.y), 0);
    const innerLeft = dx + padH;
    const innerTop = dy + titleH + titleV + titleSafe;
    const sideSafe = Math.max(12, num(cfgFull?.domain?.sideSafeGap, 12));
    const sgs = updated
      .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden)
      .slice();
    if (!sgs.length) continue;
    const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
    const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height)), 0);
    const getX = (n: ReactFlowNode) => num(((n as any)?.position?.x), innerLeft - subPadH);
    const getY = (n: ReactFlowNode) => num(((n as any)?.position?.y), innerTop - subTitleH - subTitleV - subPadTop);
    const avgH = sgs.length ? Math.max(24, Math.floor(sgs.reduce((s, n) => s + getH(n), 0) / sgs.length)) : 80;
    const ROW_TOL = Math.max(6, Math.floor(Math.min(vGap * 0.35, avgH * 0.5)));
    const rows: ReactFlowNode[][] = [];
    // 优先使用 customSort 进行语义排序，确保行生成顺序符合语义预期
    const sortedY = sgs.slice().sort((a, b) => {
      if (customSort) {
        const res = customSort(a, b);
        if (res !== 0) return res;
      }
      return getY(a) - getY(b);
    });
    for (const sg of sortedY) {
      const cy = getY(sg);
      let placed = false;
      for (const row of rows) {
        const rCy = row.reduce((s, m) => s + getY(m), 0) / Math.max(1, row.length);
        if (Math.abs(cy - rCy) <= ROW_TOL) { row.push(sg); placed = true; break; }
      }
      if (!placed) rows.push([sg]);
    }
    // 顶部/底部额外留白（按统一的垂直间距比例）
    const topExtra = Math.max(4, Math.floor(vGap * 0.35));
    const bottomExtra = Math.max(4, Math.floor(vGap * 0.35));
    let cursorY = innerTop - subTitleH - subTitleV - subPadTop + topExtra;
    for (const row of rows) {
      // 行内优先语义排序
      const ordered = row.slice().sort((a, b) => {
        if (customSort) {
          const res = customSort(a, b);
          if (res !== 0) return res;
        }
        return getX(a) - getX(b);
      });
      let cursorX = innerLeft - subPadH + sideSafe;
      let rowMaxH = 0;
      for (const sg of ordered) {
        const oldX = getX(sg);
        const oldY = getY(sg);
        const w = getW(sg);
        const h = getH(sg);
        const targetX = Math.round(cursorX);
        const targetY = Math.round(cursorY);
        const dxShift = targetX - oldX;
        const dyShift = targetY - oldY;
        (sg as any).position = { x: targetX, y: targetY } as any;
        const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        if (children.length && (dxShift !== 0 || dyShift !== 0)) {
          for (const cid of children) {
            const child = idMap.get(cid);
            if (!child) continue;
            const cx = num(((child as any)?.position?.x), innerLeft);
            const cy = num(((child as any)?.position?.y), innerTop);
            (child as any).position = { x: Math.round(cx + dxShift), y: Math.round(cy + dyShift) } as any;
          }
        }
        cursorX += w + Math.max(12, hGap);
        rowMaxH = Math.max(rowMaxH, h);
      }
      cursorY += rowMaxH + Math.max(6, Math.floor(vGap * 0.8));
    }
    // 尾部额外底部留白：整体下移一个 bottomExtra，容器高度回收会包含该安全留白
    for (const sg of sgs) {
      const py = getY(sg);
      (sg as any).position = { x: getX(sg), y: Math.round(py + bottomExtra) } as any;
      const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
      for (const cid of children) {
        const child = idMap.get(cid);
        if (!child) continue;
        const cx = getX(child);
        const cy = getY(child);
        (child as any).position = { x: cx, y: Math.round(cy + bottomExtra) } as any;
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：子域容器垂直对称打包
 * 目标：在域内容区内，将所有可见子域容器按指定垂直间距进行堆叠，并将多余的空隙均分到顶部与底部，实现上下留白对称；同步 children 的 y 位移。
 */

/**
 * 函数级注释：子域容器垂直对称打包
 * 目标：在域内容区内，将所有可见子域容器按指定垂直间距进行堆叠，并将多余的空隙均分到顶部与底部，实现上下留白对称；同步 children 的 y 位移。
 */
export const packSubGroupsVerticallySymmetric = (
  nodes: ReactFlowNode[],
  gapVOverride?: number
): ReactFlowNode[] => {
  // 已回滚：不再执行垂直对称打包，返回原节点集合
  void gapVOverride;
  return nodes.map(n => ({ ...n }));
};

/**
 * 函数级注释：子域容器对称融合（精简版）
 * 目标：在域内部，将所有可见子域容器统一按“左右留白均匀为 sideSafeGap”的对称融合策略进行处理。
 * 行为：直接设置 `position.x = innerLeft + sideSafeGap - subPadH`；
 *       容器宽度 = `(innerRight - innerLeft - 2*sideSafeGap) + 2*subPadH`；
 *       同步 children 的 x 进行整体位移；高度保持不变。
*/

/**
 * 函数级注释：子域容器对称融合（精简版）
 * 目标：在域内部，将所有可见子域容器统一按“左右留白均匀为 sideSafeGap”的对称融合策略进行处理。
 * 行为：直接设置 `position.x = innerLeft + sideSafeGap - subPadH`；
 *       容器宽度 = `(innerRight - innerLeft - 2*sideSafeGap) + 2*subPadH`；
 *       同步 children 的 x 进行整体位移；高度保持不变。
*/
export const fitSubGroupsToDomainSymmetric = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const sideSafe = Math.max(0, num(cfgFull?.domain?.sideSafeGap, 8));
  const subPadHDefault = num(layoutCfg?.SUB_GROUP_PADDING?.H, Math.max(16, Math.floor(padH * 0.8)));
  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const tx = num(((dc as any)?.position?.x), 0);
    const tw = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
    const innerLeft = tx + padH;
    const innerRight = tx + Math.max(1, tw) - padH;
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
    for (let i = 0; i < updated.length; i++) {
      const sg = updated[i];
      if (!sgs.some(n => n.id === sg.id)) continue;
      const subPadH = num((((cfgFull?.subDomain || {}) as any)?.padding?.horizontal), subPadHDefault);
      const oldX = num(((sg as any)?.position?.x), innerLeft - subPadH);
      // 严格嵌套模式：不再向左偏移内边距，而是严格从 sideSafe 开始
      const newX = Math.round(innerLeft + sideSafe);
      const keepH = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0);
      const contentW = Math.max(0, innerRight - innerLeft - 2 * sideSafe);
      // 严格嵌套模式：宽度仅为内容宽，不再加倍内边距
      const newW = Math.max(1, Math.round(contentW));
      const dx = newX - oldX;
      (sg as any).position = { x: newX, y: num(((sg as any)?.position?.y), 0) } as any;
      ((sg as any).style || ((sg as any).style = {})).width = newW;
      ((sg as any).style || ((sg as any).style = {})).height = keepH;
      (sg as any).measured = { width: newW, height: keepH } as any;
      const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
      if (dx !== 0 && children.length) {
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          const cx = num(((child as any)?.position?.x), 0);
          const cy = num(((child as any)?.position?.y), 0);
          (child as any).position = { x: Math.round(cx + dx), y: cy } as any;
        }
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：子域容器高度统一（按域）
 */

/**
 * 函数级注释：子域容器高度统一（按域）
 */
export const unifySubGroupHeightsByDomain = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
    if (sgs.length === 0) continue;
    const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height)), 0);
    const maxH = Math.max(...sgs.map(getH));
    for (let i = 0; i < updated.length; i++) {
      const sg = updated[i];
      if (!sgs.some(n => n.id === sg.id)) continue;
      const curW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
      ((updated[i] as any).style || (((updated[i] as any).style) = {})).width = curW;
      ((updated[i] as any).style || (((updated[i] as any).style) = {})).height = maxH;
      (updated[i] as any).measured = { width: curW, height: maxH } as any;
      (updated[i] as any).width = curW;
      (updated[i] as any).height = maxH;
    }
  }
  return updated;
};

/**
 * 函数级注释：域内自由节点重叠消解
 * 目标：对同一域内未被子域包含的普通业务节点进行两阶段避让，避免相互遮挡。
 * 策略：
 * - 按域分桶；每桶先做垂直避让（Y 升序）、再做水平避让（X 升序）；
 * - 间距使用 `NODE_V_GAP` / `NODE_H_GAP`；不处理容器类节点，也不移动子域 children。
*/

/**
 * 函数级注释：域内自由节点重叠消解
 * 目标：对同一域内未被子域包含的普通业务节点进行两阶段避让，避免相互遮挡。
 * 策略：
 * - 按域分桶；每桶先做垂直避让（Y 升序）、再做水平避让（X 升序）；
 * - 间距使用 `NODE_V_GAP` / `NODE_H_GAP`；不处理容器类节点，也不移动子域 children。
*/
export const resolveFreeNodeOverlapsInDomain = (
  nodes: ReactFlowNode[],
  gapHOverride?: number,
  gapVOverride?: number
): ReactFlowNode[] => {
  const cfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const vGap = (typeof gapVOverride === 'number' && isFinite(gapVOverride)) ? gapVOverride : num(cfg?.NODE_V_GAP, 80);
  const hGap = (typeof gapHOverride === 'number' && isFinite(gapHOverride)) ? gapHOverride : num(cfg?.NODE_H_GAP, 120);
  const updated = nodes.map(n => ({ ...n }));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getRect = (n: ReactFlowNode) => {
    const w = num((n as any)?.measured?.width ?? (n.style as any)?.width ?? (n as any)?.width, 0);
    const h = num((n as any)?.measured?.height ?? (n.style as any)?.height ?? (n as any)?.height, 0);
    const x = num(n.position?.x, 0);
    const y = num(n.position?.y, 0);
    return { x, y, w, h };
  };
  const domainsSet = new Set<string>();
  for (const n of updated) {
    const d = String((((n as any)?.data && (n as any).data.domain) || '')).trim();
    if (d) domainsSet.add(d);
  }
  const domains = Array.from(domainsSet);
  for (const d of domains) {
    const subChildren = new Set<string>();
    updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === d).forEach(sg => {
      const ids = Array.isArray((sg.data as any)?.children) ? ((sg.data as any).children as string[]) : [];
      ids.forEach(id => subChildren.add(id));
    });
    const free = updated.filter(n => {
      const nd = String(((n.data as any)?.domain || '')) === d;
      const t = String(n.type || '');
      const hidden = !!(((n as any)?.data || {}) as any)?.hidden;
      return nd && !EXCLUDE.has(t) && !hidden && !subChildren.has(n.id);
    });
    if (free.length <= 1) continue;
    // 鍨傜洿閬胯
    const byY = free.slice().sort((a, b) => getRect(a).y - getRect(b).y);
    const placedY: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const n of byY) {
      const r = getRect(n);
      let shiftY = 0;
      for (const p of placedY) {
        const horizOverlap = !(r.x + r.w <= p.rect.x || p.rect.x + p.rect.w <= r.x);
        if (!horizOverlap) continue;
        const requiredTop = p.rect.y + p.rect.h + vGap;
        if (r.y + shiftY < requiredTop) {
          shiftY = Math.max(shiftY, requiredTop - r.y);
        }
      }
      if (shiftY > 0) {
        const idx = updated.findIndex(nn => nn.id === n.id);
        const px = num((updated[idx] as any)?.position?.x, 0);
        const py = num((updated[idx] as any)?.position?.y, 0);
        (updated[idx] as any).position = { x: px, y: py + shiftY } as any;
      }
      placedY.push({ id: n.id, rect: { ...r, y: r.y + shiftY } });
    }
    // 姘村钩閬胯
    const currentFree = updated.filter(nn => free.some(f => f.id === nn.id));
    const byX = currentFree.slice().sort((a, b) => getRect(a).x - getRect(b).x);
    const placedX: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const n of byX) {
      const r = getRect(n);
      let shiftX = 0;
      for (const p of placedX) {
        const vertOverlap = !(r.y + r.h <= p.rect.y || p.rect.y + p.rect.h <= r.y);
        if (!vertOverlap) continue;
        const requiredLeft = p.rect.x + p.rect.w + hGap;
        if (r.x + shiftX < requiredLeft) {
          shiftX = Math.max(shiftX, requiredLeft - r.x);
        }
      }
      if (shiftX > 0) {
        const idx = updated.findIndex(nn => nn.id === n.id);
        const px = num((updated[idx] as any)?.position?.x, 0);
        const py = num((updated[idx] as any)?.position?.y, 0);
        (updated[idx] as any).position = { x: px + shiftX, y: py } as any;
      }
      placedX.push({ id: n.id, rect: { ...r, x: r.x + shiftX } });
    }
  }
  return updated;
};

/**
 * 函数级注释：子域 children 重叠消解（严格）
 * 目标：对每个 subGroup 的 children 执行“垂直→水平”两阶段避让，并最终钳制到子域内容区内。
 * 策略：
 * - 子域内先按 Y 升序垂直避让，再按 X 升序水平避让；
 * - 间距取 `NODE_V_GAP` / `NODE_H_GAP`；最后钳制到内容边界。
 * - 涔嬪悗閽冲埗鍒板瓙鍩熷唴閮ㄨ竟鐣岋紝閬垮厤瓒婄晫銆?
 */

/**
 * 函数级注释：子域 children 重叠消解（严格）
 * 目标：对每个 subGroup 的 children 执行“垂直→水平”两阶段避让，并最终钳制到子域内容区内。
 * 策略：
 * - 子域内先按 Y 升序垂直避让，再按 X 升序水平避让；
 * - 间距取 `NODE_V_GAP` / `NODE_H_GAP`；最后钳制到内容边界。
 * - 涔嬪悗閽冲埗鍒板瓙鍩熷唴閮ㄨ竟鐣岋紝閬垮厤瓒婄晫銆?
 */
export const resolveSubGroupChildrenOverlapsStrict = (
  nodes: ReactFlowNode[],
  gapHOverride?: number,
  gapVOverride?: number
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const cfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const vGap = (typeof gapVOverride === 'number' && isFinite(gapVOverride)) ? gapVOverride : num(cfg?.NODE_V_GAP, 80);
  const hGap = (typeof gapHOverride === 'number' && isFinite(gapHOverride)) ? gapHOverride : num(cfg?.NODE_H_GAP, 120);
  const SUB_H = num(cfg?.SUB_GROUP_PADDING?.H, 30);
  const titleH = num(cfgFull?.subDomain?.title?.height, 28);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const TOP_PAD = Math.max(titleH + titleV, num(cfg?.SUB_GROUP_TITLE_CLEARANCE, titleH + titleV));
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getRect = (n: ReactFlowNode) => {
    const w = num((n as any)?.measured?.width ?? (n.style as any)?.width ?? (n as any)?.width, 0);
    const h = num((n as any)?.measured?.height ?? (n.style as any)?.height ?? (n as any)?.height, 0);
    const x = num(n.position?.x, 0);
    const y = num(n.position?.y, 0);
    return { x, y, w, h };
  };
  const subGroups = updated.filter(n => String(n.type || '') === 'subGroup');
  for (const sg of subGroups) {
    // dagre 模式跳过：保留 dagre 计算的精确子节点位置
    const dagreSized = (sg.data as any)?.__dagreSized;
    if (dagreSized && typeof dagreSized.h === 'number' && dagreSized.h > 0) {
      continue; // 跳过此子域的重叠消解
    }
    const pos = sg.position || { x: 0, y: 0 } as any;
    const size = { w: num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width), 0), h: num(((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height), 0) };
    const innerLeft = num(pos.x, 0) + SUB_H;
    const innerRight = num(pos.x, 0) + Math.max(1, size.w) - SUB_H;
    const innerTop = num(pos.y, 0) + TOP_PAD;
    const innerBottom = num(pos.y, 0) + Math.max(1, size.h) - num(cfg?.SUB_GROUP_PADDING?.V_BOTTOM, 20);
    const children = Array.isArray((sg.data as any)?.children) ? ((sg.data as any).children as string[]) : [];
    const list = children
      .map(cid => idMap.get(cid))
      .filter((n): n is ReactFlowNode => !!n && !EXCLUDE.has(String(n.type || '')) && !((n as any)?.data || {})?.hidden);
    if (list.length <= 1) continue;
    // 鍨傜洿閬胯
    const byY = list.slice().sort((a, b) => getRect(a).y - getRect(b).y);
    const placedY: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const n of byY) {
      const r = getRect(n);
      let shiftY = 0;
      for (const p of placedY) {
        const horizOverlap = !(r.x + r.w <= p.rect.x || p.rect.x + p.rect.w <= r.x);
        if (!horizOverlap) continue;
        const requiredTop = p.rect.y + p.rect.h + vGap;
        if (r.y + shiftY < requiredTop) {
          shiftY = Math.max(shiftY, requiredTop - r.y);
        }
      }
      if (shiftY > 0) {
        const idx = updated.findIndex(nn => nn.id === n.id);
        const px = num((updated[idx] as any)?.position?.x, 0);
        const py = num((updated[idx] as any)?.position?.y, 0);
        (updated[idx] as any).position = { x: px, y: py + shiftY } as any;
      }
      placedY.push({ id: n.id, rect: { ...r, y: r.y + shiftY } });
    }
    // 姘村钩閬胯
    const currentList = updated.filter(nn => list.some(f => f.id === nn.id));
    const byX = currentList.slice().sort((a, b) => getRect(a).x - getRect(b).x);
    const placedX: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> = [];
    for (const n of byX) {
      const r = getRect(n);
      let shiftX = 0;
      for (const p of placedX) {
        const vertOverlap = !(r.y + r.h <= p.rect.y || p.rect.y + p.rect.h <= r.y);
        if (!vertOverlap) continue;
        const requiredLeft = p.rect.x + p.rect.w + hGap;
        if (r.x + shiftX < requiredLeft) {
          shiftX = Math.max(shiftX, requiredLeft - r.x);
        }
      }
      if (shiftX > 0) {
        const idx = updated.findIndex(nn => nn.id === n.id);
        const px = num((updated[idx] as any)?.position?.x, 0);
        const py = num((updated[idx] as any)?.position?.y, 0);
        (updated[idx] as any).position = { x: px + shiftX, y: py } as any;
      }
      placedX.push({ id: n.id, rect: { ...r, x: r.x + shiftX } });
    }
    // 閽冲埗鍒板瓙鍩熷唴閮ㄨ竟鐣?
    for (const n of list) {
      const r = getRect(n);
      const nx = Math.min(Math.max(r.x, innerLeft), Math.max(innerLeft, innerRight - r.w));
      const ny = Math.min(Math.max(r.y, innerTop), Math.max(innerTop, innerBottom - r.h));
      const idx = updated.findIndex(nn => nn.id === n.id);
      (updated[idx] as any).position = { x: nx, y: ny } as any;
    }
  }
  return updated;
};

/**
 * 函数级注释：子域内部节点水平居中
 * 目标：在每个 `subGroup` 的内容区内，按行将 children 的水平起点移到居中位置，使行内整体尽量居中；
 * 规则：
 * - 行划分依据 Y 中心的近似相等（容差取 `NODE_V_GAP` 的 0.35）；
 * - 行宽 = 节点宽度之和 + 行内间距；
 * - 居中起点 = innerLeft + max(0, (innerWidth - 行宽)/2)；
 * - 仅调整 x，不改变 y；越界时进行钳制。
 */

/**
 * 函数级注释：子域内部节点水平居中
 * 目标：在每个 `subGroup` 的内容区内，按行将 children 的水平起点移到居中位置，使行内整体尽量居中；
 * 规则：
 * - 行划分依据 Y 中心的近似相等（容差取 `NODE_V_GAP` 的 0.35）；
 * - 行宽 = 节点宽度之和 + 行内间距；
 * - 居中起点 = innerLeft + max(0, (innerWidth - 行宽)/2)；
 * - 仅调整 x，不改变 y；越界时进行钳制。
 */
export const centerSubGroupChildrenHorizontally = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const V_GAP = num(layoutCfg?.NODE_V_GAP, 80);
  const SUB_H = num((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const titleH = num(cfgFull?.subDomain?.title?.height, 28);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const ensureClear = !!layoutCfg?.ENSURE_SUB_GROUP_TITLE_CLEARANCE;
  const titleClear = num(layoutCfg?.SUB_GROUP_TITLE_CLEARANCE, titleH + titleV);
  const subPadTop = num((layoutCfg?.SUB_GROUP_PADDING?.V_TOP ?? cfgFull?.subDomain?.padding?.top ?? cfgFull?.subDomain?.padding?.vertical), 28);
  const _TOP_PAD = (ensureClear ? Math.max(titleH + titleV, titleClear) : (titleH + titleV)) + subPadTop;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), num(layoutCfg?.NODE_MIN_WIDTH, 120));
  const getX = (n: ReactFlowNode) => num(((n.position as any)?.x), 0);
  const getY = (n: ReactFlowNode) => num(((n.position as any)?.y), 0);
  for (let i = 0; i < updated.length; i++) {
    const sg = updated[i];
    if (String(sg.type || '') !== 'subGroup') continue;
    const pos = sg.position || { x: 0, y: 0 } as any;
    const sizeW = num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width), 0);
    // 强制使用子域自身宽度进行居中，不再依赖域宽查找，确保与容器实际尺寸严格一致
    // const domainInnerW = findDomainInnerWidth(sg);
    const innerLeft = num(pos.x, 0) + SUB_H;
    const innerRight = sizeW > 0 ? (num(pos.x, 0) + sizeW - SUB_H) : (innerLeft + Math.max(1, num((diagramConfigManager.getConfig() as any)?.layout?.mainColumnWidth, 400)));
    const selfAvailW = Math.max(1, innerRight - innerLeft);
    const _availW = selfAvailW; // Math.max(1, (domainInnerW ?? selfAvailW));
    // 以域内部中心为参考进行居中 -> 已禁用，强制使用子域自身宽度居中，避免与 layoutStrategy 的对齐冲突
    const domainCenterX: number | null = null;
    // try { ... } catch {} logic removed to enforce strict local centering
    /*
    try {
      // ... (logic removed)
    } catch { }
    */
    const children = Array.isArray((sg.data as any)?.children) ? ((sg.data as any).children as string[]) : [];
    const childNodes = children
      .map(id => idMap.get(id))
      .filter((n): n is ReactFlowNode => !!n && !new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(n.type || '')) && !((n as any)?.data || {})?.hidden);
    if (!childNodes.length) continue;
    const tol = Math.max(6, Math.floor(V_GAP * 0.35));
    const rows: ReactFlowNode[][] = [];
    const centerY = (n: ReactFlowNode) => {
      const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), num(cfgFull?.node?.height, 80));
      return getY(n) + h / 2;
    };
    const sorted = childNodes.slice().sort((a, b) => centerY(a) - centerY(b));
    for (const n of sorted) {
      const cy = getY(n) + num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), num(cfgFull?.node?.height, 80)) / 2;
      let placed = false;
      for (const row of rows) {
        const rCy = row.reduce((s, m) => s + (getY(m) + num(((m as any)?.measured?.height ?? (m as any)?.style?.height ?? (m as any)?.height), num(cfgFull?.node?.height, 80)) / 2), 0) / row.length;
        if (Math.abs(cy - rCy) <= tol) { row.push(n); placed = true; break; }
      }
      if (!placed) rows.push([n]);
    }
    for (const row of rows) {
      const r = row.slice().sort((a, b) => getX(a) - getX(b));
      const widthsRow = r.map(n => getW(n));
      const boxSum = widthsRow.reduce((s, w) => s + w, 0);
      const _gapsDefault = Math.max(0, r.length - 1) * H_GAP;
      const avail = Math.max(1, innerRight - innerLeft);
      const gapEff = (() => {
        if (r.length <= 1) return 0;
        const need = avail - boxSum;
        const per = Math.floor(Math.max(0, need) / (r.length - 1));
        return Math.max(8, Math.min(H_GAP, per));
      })();
      const rowWidthEff = boxSum + Math.max(0, r.length - 1) * gapEff;
      const startXRaw = domainCenterX != null ? Math.round(domainCenterX - rowWidthEff / 2) : (innerLeft + Math.floor(Math.max(0, (avail - rowWidthEff)) / 2));
      const startX = Math.min(Math.max(startXRaw, innerLeft), Math.max(innerLeft, innerRight - rowWidthEff));
      let cx = startX;
      for (let i = 0; i < r.length; i++) {
        const n = r[i];
        const idx = updated.findIndex(nn => nn.id === n.id);
        if (idx < 0) continue;
        const w = widthsRow[i];
        const ny = getY(n);
        const clampedX = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w));
        (updated[idx] as any).position = { x: clampedX, y: ny } as any;
        cx = clampedX + w + (i < r.length - 1 ? gapEff : 0);
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：子域内部节点水平左对齐
 * 目标：在每个 `subGroup` 的内容区内，按行从左边界起依次排列 children，减少右侧留白；越界时进行钳制。
 */

/**
 * 函数级注释：子域内部节点水平左对齐
 * 目标：在每个 `subGroup` 的内容区内，按行从左边界起依次排列 children，减少右侧留白；越界时进行钳制。
 */
export const leftAlignSubGroupChildrenHorizontally = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const H_GAP = num(layoutCfg?.NODE_H_GAP, 120);
  const SUB_H = num((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const titleH = num(cfgFull?.subDomain?.title?.height, 28);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const ensureClear = !!layoutCfg?.ENSURE_SUB_GROUP_TITLE_CLEARANCE;
  const titleClear = num(layoutCfg?.SUB_GROUP_TITLE_CLEARANCE, titleH + titleV);
  const subPadTop = num((layoutCfg?.SUB_GROUP_PADDING?.V_TOP ?? cfgFull?.subDomain?.padding?.top ?? cfgFull?.subDomain?.padding?.vertical), 28);
  const TOP_PAD = (ensureClear ? Math.max(titleH + titleV, titleClear) : (titleH + titleV)) + subPadTop;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), 0);
  const getX = (n: ReactFlowNode) => num(((n.position as any)?.x), 0);
  const getY = (n: ReactFlowNode) => num(((n.position as any)?.y), 0);
  for (let i = 0; i < updated.length; i++) {
    const sg = updated[i];
    if (String(sg.type || '') !== 'subGroup') continue;
    const pos = sg.position || { x: 0, y: 0 } as any;
    const sizeW = num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width), 0);
    if (!(sizeW > 0)) continue;
    const innerLeft = num(pos.x, 0) + SUB_H;
    const innerRight = num(pos.x, 0) + sizeW - SUB_H;
    const _innerTop = num(pos.y, 0) + TOP_PAD;
    const children = Array.isArray((sg.data as any)?.children) ? ((sg.data as any).children as string[]) : [];
    const childNodes = children
      .map(id => idMap.get(id))
      .filter((n): n is ReactFlowNode => !!n && !new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(n.type || '')) && !((n as any)?.data || {})?.hidden);
    if (!childNodes.length) continue;
    const tol = Math.max(6, Math.floor((layoutCfg?.NODE_V_GAP ?? 80) * 0.35));
    const rows: ReactFlowNode[][] = [];
    const centerY = (n: ReactFlowNode) => {
      const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), num(cfgFull?.node?.height, 80));
      return getY(n) + h / 2;
    };
    const sorted = childNodes.slice().sort((a, b) => centerY(a) - centerY(b));
    for (const n of sorted) {
      const cy = getY(n) + num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), num(cfgFull?.node?.height, 80)) / 2;
      let placed = false;
      for (const row of rows) {
        const rCy = row.reduce((s, m) => s + (getY(m) + num(((m as any)?.measured?.height ?? (m as any)?.style?.height ?? (m as any)?.height), num(cfgFull?.node?.height, 80)) / 2), 0) / row.length;
        if (Math.abs(cy - rCy) <= tol) { row.push(n); placed = true; break; }
      }
      if (!placed) rows.push([n]);
    }
    for (const row of rows) {
      const r = row.slice().sort((a, b) => getX(a) - getX(b));
      let cx = innerLeft;
      for (const n of r) {
        const idx = updated.findIndex(nn => nn.id === n.id);
        if (idx < 0) continue;
        const w = getW(n);
        const ny = getY(n);
        const clampedX = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w));
        (updated[idx] as any).position = { x: clampedX, y: ny } as any;
        cx = clampedX + w + H_GAP;
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：子域容器高度最终投影回收
 * 目标：按 children 的包围盒精确计算子域容器高度，不做过度扩展或重叠；
 * 规则：newH = subTitleH + subTitleV + subPadTop + contentH(children bbox) + subBottomSafe；位置与宽度保持不变。
 */

/**
 * 函数级注释：子域容器高度最终投影回收
 * 目标：按 children 的包围盒精确计算子域容器高度，不做过度扩展或重叠；
 * 规则：newH = subTitleH + subTitleV + subPadTop + contentH(children bbox) + subBottomSafe；位置与宽度保持不变。
 */
export const finalizeSubGroupHeightsByProjection = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getSize = (n: ReactFlowNode): { w: number; h: number } => {
    const defW = num((layoutCfg?.NODE_MIN_WIDTH), 120);
    const defH = num((cfgFull?.node as any)?.height, 80);
    const w = num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), defW);
    const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), defH);
    return { w, h };
  };
  const subPadH = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const subPadTop = num((layoutCfg?.SUB_GROUP_PADDING?.V_TOP ?? cfgFull?.subDomain?.padding?.top ?? cfgFull?.subDomain?.padding?.vertical), 28);
  const subBottomSafe = num((cfgFull?.subDomain?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 20);
  const subTitleH = num(cfgFull?.subDomain?.title?.height, 28);
  const subTitleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const domainPadH = num(cfgFull?.domain?.padding?.horizontal, 24);

  updated.filter(n => String(n.type || '') === 'subGroup').forEach(sg => {
    const pos = (sg as any)?.position || { x: 0, y: 0 } as any;
    const innerLeft = num(pos.x, 0) + subPadH;
    const innerTop = num(pos.y, 0) + subTitleH + subTitleV + subPadTop;
    const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
    const list = children
      .map(id => idMap.get(id))
      .filter((nn): nn is ReactFlowNode => !!nn && !EXCLUDE.has(String(nn.type || '')) && !(((nn as any)?.data) || {})?.hidden);
    if (!list.length) {
      const keepW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0);
      const newH = subTitleH + subTitleV + subPadTop + subBottomSafe;
      (sg as any).style = { ...((sg as any).style || {}), width: keepW, height: newH } as any;
      (sg as any).measured = { width: keepW, height: newH } as any;
      (sg as any).height = newH;
      return;
    }
    let maxBottom = innerTop;
    let maxRight = innerLeft;
    let minLeft = Infinity;
    for (const m of list) {
      const p = (m as any)?.position || { x: 0, y: 0 } as any;
      const s = getSize(m);
      const nx = num((p as any).x, innerLeft);
      const ny = num((p as any).y, innerTop);
      maxBottom = Math.max(maxBottom, ny + s.h);
      maxRight = Math.max(maxRight, nx + s.w);
      minLeft = Math.min(minLeft, nx);
    }
    const contentH = Math.max(0, maxBottom - innerTop);
    const contentW = Math.max(0, maxRight - (isFinite(minLeft) ? minLeft : innerLeft));
    const newW = contentW + subPadH * 2;
    const _keepW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), newW);
    const newH = subTitleH + subTitleV + subPadTop + contentH + subBottomSafe;
    // 计算所属域的内部左/右边界，用于钳制子域容器左边不被越界
    let leftClamp = -Infinity; let rightClamp = Infinity;
    try {
      const dKey = String((((sg as any)?.data?.domain || ''))).trim();
      const tg = updated.find(n => String(n.type || '') === 'titleGroup' && String(((n.data as any)?.domain || '')) === dKey);
      if (tg) {
        const tx = num(((tg as any)?.position?.x), 0);
        const tw = num((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 0);
        leftClamp = tx + domainPadH - subPadH;
        rightClamp = tx + Math.max(1, tw) - domainPadH - subPadH - newW;
      }
    } catch {
      // ignore
    }
    let newX = isFinite(minLeft) ? Math.round(minLeft - subPadH) : num(pos.x, 0);
    if (isFinite(leftClamp)) newX = Math.max(newX, leftClamp);
    if (isFinite(rightClamp)) newX = Math.min(newX, rightClamp);
    (sg as any).position = { x: newX, y: num(pos.y, 0) } as any;
    (sg as any).style = { ...((sg as any).style || {}), width: newW, height: newH } as any;
    (sg as any).measured = { width: newW, height: newH } as any;
    (sg as any).width = newW;
    (sg as any).height = newH;

  });

  return updated;
};

/**
 * 函数级注释：子域容器高度回收（保持锚点）
 * 目标：仅按 children 的垂直投影精确计算子域容器高度，保持 position.x/y 不变。
 * 规则：`newH = subTitleH + subTitleV + subPadTop + contentH(children bbox) + subBottomSafe`；宽度保持不变；位置不动。
 */

/**
 * 函数级注释：子域容器高度回收（保持锚点）
 * 目标：仅按 children 的垂直投影精确计算子域容器高度，保持 position.x/y 不变。
 * 规则：`newH = subTitleH + subTitleV + subPadTop + contentH(children bbox) + subBottomSafe`；宽度保持不变；位置不动。
 */
export const finalizeSubGroupHeightsByProjectionPreserveAnchor = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getSize = (n: ReactFlowNode): { w: number; h: number } => {
    const defW = num((layoutCfg?.NODE_MIN_WIDTH), 120);
    const defH = num((cfgFull?.node as any)?.height, 80);
    const w = num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), defW);
    const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), defH);
    return { w, h };
  };
  const subPadH = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const subPadTop = num((layoutCfg?.SUB_GROUP_PADDING?.V_TOP ?? cfgFull?.subDomain?.padding?.top ?? cfgFull?.subDomain?.padding?.vertical), 28);
  const subBottomSafe = num((cfgFull?.subDomain?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 28);
  const subTitleH = num(cfgFull?.subDomain?.title?.height, 28);
  const subTitleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);

  updated.filter(n => String(n.type || '') === 'subGroup').forEach(sg => {
    const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];

    // dagre 模式检测：检查子域自身的 __dagreSized 标记
    const dagreSized = (sg.data as any)?.__dagreSized;
    if (dagreSized && typeof dagreSized.h === 'number' && dagreSized.h > 0) {
      // 恢复 dagre 计算的精确尺寸
      const useW = (typeof dagreSized.w === 'number' && dagreSized.w > 0) ? dagreSized.w : num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0);
      (sg as any).style = { ...((sg as any).style || {}), width: useW, height: dagreSized.h };
      (sg as any).measured = { width: useW, height: dagreSized.h };
      (sg as any).width = useW;
      (sg as any).height = dagreSized.h;
      return;
    }

    const pos = (sg as any)?.position || { x: 0, y: 0 } as any;
    const innerLeft = num(pos.x, 0) + subPadH;
    const innerTop = num(pos.y, 0) + subTitleH + subTitleV + subPadTop;
    const list = children
      .map(id => idMap.get(id))
      .filter((nn): nn is ReactFlowNode => !!nn && !EXCLUDE.has(String(nn.type || '')) && !(((nn as any)?.data) || {})?.hidden);
    if (!list.length) {
      const keepW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0);
      const newH = subTitleH + subTitleV + subPadTop + subBottomSafe;
      (sg as any).style = { ...((sg as any).style || {}), width: keepW, height: newH } as any;
      (sg as any).measured = { width: keepW, height: newH } as any;
      (sg as any).height = newH;
      return;
    }
    let maxBottom = innerTop;
    for (const m of list) {
      const p = (m as any)?.position || { x: 0, y: 0 } as any;
      const s = getSize(m);
      const _nx = num((p as any).x, innerLeft);
      const ny = num((p as any).y, innerTop);
      maxBottom = Math.max(maxBottom, ny + s.h);
    }
    const contentH = Math.max(0, maxBottom - innerTop);
    const keepW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0);
    const newH = subTitleH + subTitleV + subPadTop + contentH + subBottomSafe;
    (sg as any).style = { ...((sg as any).style || {}), width: keepW, height: newH } as any;
    (sg as any).measured = { width: keepW, height: newH } as any;
    (sg as any).width = keepW;
    (sg as any).height = newH;
  });

  return updated;
};

/**
 * 函数级注释：子域容器宽度回收（保持锚点）
 * 目标：仅按 children 的水平投影准确计算子域容器宽度，保持 position.x 不变，高度不动。
 * 规则：`newW = subPadH*2 + (children bbox 的水平跨度)`；位置保持不变。
 */

/**
 * 函数级注释：子域容器宽度回收（保持锚点）
 * 目标：仅按 children 的水平投影准确计算子域容器宽度，保持 position.x 不变，高度不动。
 * 规则：`newW = subPadH*2 + (children bbox 的水平跨度)`；位置保持不变。
 */
export const finalizeSubGroupWidthsByProjectionPreserveAnchor = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const subPadH = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  updated.filter(n => String(n.type || '') === 'subGroup').forEach(sg => {
    const pos = (sg as any)?.position || { x: 0, y: 0 } as any;
    const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
    const list = children
      .map(id => idMap.get(id))
      .filter((nn): nn is ReactFlowNode => !!nn && !EXCLUDE.has(String(nn.type || '')) && !(((nn as any)?.data) || {})?.hidden);
    if (!list.length) return;
    let minLeft = Infinity;
    let maxRight = -Infinity;
    for (const m of list) {
      const p = (m as any)?.position || { x: 0, y: 0 } as any;
      const w = num(((m as any)?.measured?.width ?? (m as any)?.style?.width ?? (m as any)?.width), 0);
      const nx = num((p as any).x, 0);
      minLeft = Math.min(minLeft, nx);
      maxRight = Math.max(maxRight, nx + w);
    }
    if (!isFinite(minLeft) || !isFinite(maxRight) || maxRight <= minLeft) return;
    const contentW = Math.max(0, maxRight - minLeft);
    const keepH = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height)), 0);
    const newW = Math.max(0, contentW + subPadH * 2);
    (sg as any).position = { x: num(pos.x, 0), y: num(pos.y, 0) } as any;
    ((sg as any).style || ((sg as any).style = {})).width = newW;
    ((sg as any).style || ((sg as any).style = {})).height = keepH;
    (sg as any).measured = { width: newW, height: keepH } as any;
    (sg as any).width = newW;
    (sg as any).height = keepH;
  });
  return updated;
};

/**
 * 鍩熷鍣ㄥ搴︽渶缁堟姇褰卞洖鏀讹紙鍑芥暟绾ф敞閲婏級
 * 鐩爣锛氭寜鍩熷唴鎴愬憳锛堝瓙鍩熷鍣?+ 鏅€氳妭鐐癸級鐨勬按骞虫姇褰辩簿纭绠楀煙瀹瑰櫒瀹藉害锛涗繚鐣欏煙宸﹂敋涓嶅彉锛屼粎鍐欏洖瀹藉害銆?
 */

/**
 * 鍑芥暟绾ф敞閲婏細鍐欏叆瀛愬煙鐩稿鍋忕Щ蹇収
 * - 鐩爣锛氬湪杩涘叆鍨傜洿鍫嗗彔鍓嶏紝涓烘瘡涓瓙鍩熺殑涓氬姟鑺傜偣璁板綍鍏剁浉瀵瑰鍣ㄥ唴宸︿笂瑙掔殑鍋忕Щ锛?
 * - 琛屼负锛歝hild.data.__rel = { x: child.x - innerLeftSg, y: child.y - innerTopSg }锛屼粎鍐欏叆涓嶈皟鏁翠綅缃€?
 */
export const writeSubGroupChildrenRelativeOffsets = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const cfgFull: any = diagramConfigManager.getConfig() || {};
  const padH = num(cfgFull?.subDomain?.padding?.horizontal ?? (diagramConfigManager.getLayoutConfig() as any)?.SUB_GROUP_PADDING?.H, 24);
  const titleH = num(cfgFull?.subDomain?.title?.height, 32);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const padTop = num(cfgFull?.subDomain?.padding?.top, 12);
  const updated = nodes.map(n => ({ ...n }));
  for (let i = 0; i < updated.length; i++) {
    const sg = updated[i];
    if (String(sg.type || '') !== 'subGroup') continue;
    const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
    if (!children.length) continue;
    const sx = num(((sg as any)?.position?.x), 0);
    const sy = num(((sg as any)?.position?.y), 0);
    const innerLeftSg = sx + padH;
    const innerTopSg = sy + titleH + titleV + padTop;
    for (let j = 0; j < updated.length; j++) {
      const child = updated[j];
      if (!children.includes(child.id)) continue;
      const nx = num(((child as any)?.position?.x), innerLeftSg);
      const ny = num(((child as any)?.position?.y), innerTopSg);
      ((updated[j] as any).data || ((updated[j] as any).data = {})).__rel = { x: Math.round(nx - innerLeftSg), y: Math.round(ny - innerTopSg) } as any;
    }
  }
  return updated;
};

/**
 * 鍑芥暟绾ф敞閲婏細瀛愬煙鍒氫綋琛屾墦鍖咃紙淇濇寔缁撴瀯锛屽寮虹ǔ瀹氭€э級
 * - 鐩爣锛氬湪瀛愬煙鏁翠綋绉诲姩鍚庯紝渚濇嵁鐩稿鍋忕Щ __rel 瀵?children 杩涜琛屾墦鍖咃紝淇濊瘉鏈€灏忚闂磋窛涓庡垪闂磋窛锛?
 * - 瑙勫垯锛氭寜 rel.y 鍒嗘《褰㈡垚琛岋紙闃堝€兼潵鑷?vGap锛夛紱姣忚鎸?rel.x 鍗囧簭锛屾部 x 椤哄簭鎺掑竷锛屽垪闂磋窛鑷冲皯涓?hGap锛?
 * - 杈圭晫锛氶挸鍒跺埌瀛愬煙鍐呰竟鐣岋紱涓嶆敼鍙樺鍣ㄥ昂瀵搞€?
 */

/**
 * 鍑芥暟绾ф敞閲婏細瀛愬煙鍒氫綋琛屾墦鍖咃紙淇濇寔缁撴瀯锛屽寮虹ǔ瀹氭€э級
 * - 鐩爣锛氬湪瀛愬煙鏁翠綋绉诲姩鍚庯紝渚濇嵁鐩稿鍋忕Щ __rel 瀵?children 杩涜琛屾墦鍖咃紝淇濊瘉鏈€灏忚闂磋窛涓庡垪闂磋窛锛?
 * - 瑙勫垯锛氭寜 rel.y 鍒嗘《褰㈡垚琛岋紙闃堝€兼潵鑷?vGap锛夛紱姣忚鎸?rel.x 鍗囧簭锛屾部 x 椤哄簭鎺掑竷锛屽垪闂磋窛鑷冲皯涓?hGap锛?
 * - 杈圭晫锛氶挸鍒跺埌瀛愬煙鍐呰竟鐣岋紱涓嶆敼鍙樺鍣ㄥ昂瀵搞€?
 */
export const packSubGroupChildrenRigid = (
  sg: ReactFlowNode,
  nodes: ReactFlowNode[],
  hGap: number,
  vGap: number
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const cfgFull: any = diagramConfigManager.getConfig() || {};
  const padH = num(cfgFull?.subDomain?.padding?.horizontal ?? (diagramConfigManager.getLayoutConfig() as any)?.SUB_GROUP_PADDING?.H, 24);
  const titleH = num(cfgFull?.subDomain?.title?.height, 32);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const padTop = num(cfgFull?.subDomain?.padding?.top, 12);
  const padBottomSafe = num((cfgFull?.subDomain?.padding?.bottom ?? (cfgFull?.subDomain as any)?.bottomSafeGap), 12);
  const sx = num(((sg as any)?.position?.x), 0);
  const sy = num(((sg as any)?.position?.y), 0);
  const innerLeft = sx + padH;
  const innerTop = sy + titleH + titleV + padTop;
  const innerRight = innerLeft + num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width), 0) - padH * 2;
  const innerBottom = sy + num(((sg as any)?.measured?.height ?? (sg as any)?.style?.height), 80) - padBottomSafe;
  const safeGap = Math.max(0, num((cfgFull?.subDomain?.title?.safeGap), 0));
  const rowsMap = new Map<number, ReactFlowNode[]>();
  const bucket = (relY: number) => Math.round(relY / Math.max(8, vGap));
  for (const n of nodes) {
    const rel = (n as any)?.data?.__rel as any;
    const relY = typeof rel?.y === 'number' && isFinite(rel.y) ? rel.y : 0;
    const b = bucket(relY);
    if (!rowsMap.has(b)) rowsMap.set(b, []);
    (rowsMap.get(b) as ReactFlowNode[]).push(n);
  }
  const sortedBuckets = Array.from(rowsMap.keys()).sort((a, b) => a - b);
  let cy = innerTop + safeGap;
  const minHGap = Math.max(8, hGap);
  const minVGap = Math.max(8, vGap);
  for (const b of sortedBuckets) {
    const row = rowsMap.get(b) as ReactFlowNode[];
    row.sort((a, z) => {
      const ra = (a as any)?.data?.__rel?.x ?? 0;
      const rz = (z as any)?.data?.__rel?.x ?? 0;
      return ra - rz;
    });
    // 琛岃捣濮?y 鑷冲皯涓?cy 涓庡熀鍑嗚浣嶇疆鐨勮緝澶ц€?
    const baseRowY = innerTop + safeGap + b * minVGap;
    const rowY = Math.max(cy, baseRowY);
    let cx = innerLeft;
    let maxRowH = 0;
    for (const n of row) {
      const w = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 120);
      const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
      const nx = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w));
      const ny = Math.min(Math.max(rowY, innerTop), Math.max(innerTop, innerBottom - h));
      (n as any).position = { x: Math.round(nx), y: Math.round(ny) } as any;
      cx = nx + w + minHGap;
      maxRowH = Math.max(maxRowH, h);
    }
    // 涓嬩竴琛?y 鎸囬拡绱姞锛屼繚璇佷笉涓庢湰琛岄噸鍙?
    cy = rowY + maxRowH + minVGap;
  }
  return [sg, ...nodes];
};

/**
 * 函数级注释：子域垂直重排（无重叠）
 * - 目标：当子域使用垂直节点布局时，在容器内以可用宽度居中，并按固定行间距累进垂直排布；
 * - 行为：按当前 y（或 __rel.y）排序，x 居中，y 累进递增；行间距不小于 vGap；
 */

/**
 * 函数级注释：子域垂直重排（无重叠）
 * - 目标：当子域使用垂直节点布局时，在容器内以可用宽度居中，并按固定行间距累进垂直排布；
 * - 行为：按当前 y（或 __rel.y）排序，x 居中，y 累进递增；行间距不小于 vGap；
 */
export const reflowSubGroupChildrenVertical = (
  sg: ReactFlowNode,
  nodes: ReactFlowNode[],
  hGap: number,
  vGap: number
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const cfgFull: any = diagramConfigManager.getConfig() || {};
  const padH = num(cfgFull?.subDomain?.padding?.horizontal ?? (diagramConfigManager.getLayoutConfig() as any)?.SUB_GROUP_PADDING?.H, 24);
  const titleH = num(cfgFull?.subDomain?.title?.height, 32);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const padTop = num(cfgFull?.subDomain?.padding?.top, 12);
  const safeGap = Math.max(0, num((cfgFull?.subDomain?.title?.safeGap), 0));
  const sx = num(((sg as any)?.position?.x), 0);
  const sy = num(((sg as any)?.position?.y), 0);
  const innerLeft = sx + padH;
  const innerTop = sy + titleH + titleV + padTop + safeGap;
  const innerRight = innerLeft + num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width), 240) - padH * 2;
  const minVGap = Math.max(8, vGap);
  const widthAvail = Math.max(0, innerRight - innerLeft);
  const list = nodes.slice().sort((a, b) => {
    const ay = (a as any)?.data?.__rel?.y ?? (a as any)?.position?.y ?? 0;
    const by = (b as any)?.data?.__rel?.y ?? (b as any)?.position?.y ?? 0;
    return ay - by;
  });
  let cy = innerTop;
  for (const n of list) {
    const w = num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), 0);
    const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), 0);
    const nx = innerLeft + Math.max(0, Math.floor((widthAvail - w) / 2));
    const ny = cy;
    (n as any).position = { x: Math.round(nx), y: Math.round(ny) } as any;
    cy = ny + h + minVGap;
  }
  return [sg, ...list];
};

/**
 * 函数级注释：子域 Dagre 分层布局（语义顺序 + 边分层）
 * - 目标：使用 dagre 算法在子域内部对 children 进行分层布局，充分发挥节点的语义分层和语义顺序；
 * - 行为：
 *   1) 按 data.sequence / data.order 对节点排序以确定语义顺序
 *   2) 从全局边中筛选出属于该子域内部的边
 *   3) 使用 dagre 进行 TB 方向的分层布局
 *   4) 将计算结果应用到节点位置
 * - 输入：子域容器节点、子节点列表、间距配置、全局边列表
 * - 输出：包含更新后位置的节点列表
 */

/**
 * 函数级注释：子域 Dagre 分层布局（语义顺序 + 边分层）
 * - 目标：使用 dagre 算法在子域内部对 children 进行分层布局，充分发挥节点的语义分层和语义顺序；
 * - 行为：
 *   1) 按 data.sequence / data.order 对节点排序以确定语义顺序
 *   2) 从全局边中筛选出属于该子域内部的边
 *   3) 使用 dagre 进行 TB 方向的分层布局
 *   4) 将计算结果应用到节点位置
 * - 输入：子域容器节点、子节点列表、间距配置、全局边列表
 * - 输出：包含更新后位置的节点列表
 */
export const reflowSubGroupChildrenDagre = (
  sg: ReactFlowNode,
  nodes: ReactFlowNode[],
  hGap: number,
  vGap: number,
  globalEdges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): ReactFlowNode[] => {
  if (nodes.length === 0) return [sg];

  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const cfgFull: any = diagramConfigManager.getConfig() || {};
  const layoutCfg: any = diagramConfigManager.getLayoutConfig() || {};

  // 内边距与标题配置
  const padH = num(cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H, 24);
  const titleH = num(cfgFull?.subDomain?.title?.height, 48);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const padTop = num(cfgFull?.subDomain?.padding?.top, 12);
  const padBottom = num(cfgFull?.subDomain?.padding?.bottom, 12);
  const safeGap = Math.max(8, num(cfgFull?.subDomain?.title?.safeGap, 8));

  // 子域内容区边界
  const sx = num((sg as any)?.position?.x, 0);
  const sy = num((sg as any)?.position?.y, 0);
  const innerTop = sy + titleH + titleV + padTop + safeGap;

  // 节点尺寸辅助 - 优先使用 measured（真实渲染尺寸），其次是 style，最后是配置默认值
  const defaultNodeW = num(cfgFull?.node?.width, 240);  // 增加默认宽度
  const defaultNodeH = num(cfgFull?.node?.height, 100); // 增加默认高度
  const getW = (n: ReactFlowNode) => {
    const measured = num((n as any)?.measured?.width, 0);
    if (measured > 0) return measured;
    const style = num((n as any)?.style?.width, 0);
    if (style > 0) return style;
    const direct = num((n as any)?.width, 0);
    if (direct > 0) return direct;
    return defaultNodeW;
  };
  const getH = (n: ReactFlowNode) => {
    const measured = num((n as any)?.measured?.height, 0);
    if (measured > 0) return measured;
    const style = num((n as any)?.style?.height, 0);
    if (style > 0) return style;
    const direct = num((n as any)?.height, 0);
    if (direct > 0) return direct;
    return defaultNodeH;
  };



  // 语义排序：按 sequence > order > 原始顺序
  const sorted = nodes.slice().sort((a, b) => {
    const seqA = (a.data as any)?.sequence ?? (a.data as any)?.order;
    const seqB = (b.data as any)?.sequence ?? (b.data as any)?.order;
    const numA = typeof seqA === 'number' ? seqA : parseFloat(seqA);
    const numB = typeof seqB === 'number' ? seqB : parseFloat(seqB);
    const hasA = isFinite(numA);
    const hasB = isFinite(numB);
    if (hasA && hasB) return numA - numB;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    return 0;
  });

  // 构建节点 ID 集合
  const nodeIdSet = new Set(sorted.map(n => n.id));

  // 筛选子域内部边
  const internalEdges = globalEdges.filter(e =>
    nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
  );

  // 调试日志：显示子域内部边信息
  const sgDescDebug = String((sg.data as any)?.description || sg.id);
  safeLog.debug(`[DAGRE-EDGES] 子域="${sgDescDebug}" 节点数=${sorted.length} 内部边数=${internalEdges.length}`);
  if (internalEdges.length > 0) {
    safeLog.debug(`[DAGRE-EDGES] 边详情:`, internalEdges.map(e => `${e.source} → ${e.target}`).join(', '));
  }



  // 计算最大节点尺寸用于动态间距
  let maxNodeW = 0, maxNodeH = 0;
  for (const n of sorted) {
    maxNodeW = Math.max(maxNodeW, getW(n));
    maxNodeH = Math.max(maxNodeH, getH(n));
  }

  // 创建 dagre 图 - 使用紧凑间距，避免子域过高
  // 减小 rankSep 和 nodeSep 使布局更紧凑
  const cfgLayout = diagramConfigManager.getLayoutConfig() as any;
  // 确保最小间距为 100，防止配置值过小
  const userNodeSep = num(cfgLayout?.NODE_SEP, 80);
  const userRankSep = num(cfgLayout?.RANK_SEP, 120);
  const dynamicNodeSep = Math.max(80, userNodeSep);
  const dynamicRankSep = Math.max(120, userRankSep);

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: dynamicNodeSep,
    ranksep: dynamicRankSep,
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // 添加节点（按语义顺序）
  // 使用较大的 padding 确保节点间有足够间距
  const nodePadding = 60; // 增加到 60px
  safeLog.debug(`[DAGRE-TRACE] === 开始 Dagre 布局 === direction=${direction} nodes=${sorted.length} padding=${nodePadding}`);
  for (const n of sorted) {
    // 确保节点有最小高度，防止文字多的节点高度被低估
    const baseW = getW(n);
    const baseH = getH(n);
    // 高度使用 1.5 倍以应对内容可能比 measured 更高的情况
    const w = baseW + nodePadding;
    const h = Math.max(baseH * 1.3, baseH + nodePadding);
    g.setNode(n.id, { width: w, height: h });
  }

  // 添加边 - 仅使用 "main" 类型边进行 dagre 分层计算
  // 其他类型（data, dependency 等）作为短路边，不影响 rank 排列
  const mainEdges = internalEdges.filter(e => {
    const edgeType = String(e.type || (e.data as any)?.type || 'main').toLowerCase();
    // 只有 main 边影响 dagre rank
    return edgeType === 'main';
  });
  const shortCircuitEdges = internalEdges.filter(e => {
    const edgeType = String(e.type || (e.data as any)?.type || 'main').toLowerCase();
    return edgeType !== 'main';
  });

  safeLog.debug(`[DAGRE-EDGES] 主干边(影响rank)=${mainEdges.length}, 短路边(仅视觉)=${shortCircuitEdges.length}`);
  if (shortCircuitEdges.length > 0) {
    safeLog.debug(`[DAGRE-EDGES] 忽略短路边:`, shortCircuitEdges.map(e => `${e.source}→${e.target}(${e.type})`).join(', '));
  }

  for (const e of mainEdges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      const labelText = typeof e.label === 'string' ? e.label : (typeof (e.data as any)?.label === 'string' ? (e.data as any).label : '');
      const labelOpts: any = {};
      if (labelText) {
        // 简单估算：每个字符 14px，高度 20px
        const len = labelText.length;
        labelOpts.width = Math.max(40, len * 14);
        labelOpts.height = 20;
        labelOpts.labelpos = 'c';
      }
      g.setEdge(e.source, e.target, labelOpts);
    }
  }

  // 识别有边连接的节点和独立节点
  // 注意：使用所有 internalEdges 识别连接性，但只有 mainEdges 用于 dagre rank
  const connectedNodeIds = new Set<string>();
  for (const e of internalEdges) {
    connectedNodeIds.add(e.source);
    connectedNodeIds.add(e.target);
  }
  const isolatedNodes = sorted.filter(n => !connectedNodeIds.has(n.id));
  const connectedNodes = sorted.filter(n => connectedNodeIds.has(n.id));

  // 如果没有主干边（只有短路边或无边），按语义顺序链式连接保持垂直布局
  // 如果只有部分节点是独立的，独立节点将在后面水平排列
  if (mainEdges.length === 0 && sorted.length > 1) {
    // 全部独立或只有短路边：创建链式边保持语义顺序（垂直布局）
    for (let i = 0; i < sorted.length - 1; i++) {
      g.setEdge(sorted[i].id, sorted[i + 1].id);
    }
  } else if (connectedNodes.length > 0 && isolatedNodes.length > 0) {
    // 部分连接：将独立节点从 dagre 图中移除，稍后横排
    for (const n of isolatedNodes) {
      g.removeNode(n.id);
    }
  }

  // 执行 dagre 布局
  dagre.layout(g);

  // 诊断：显示 dagre 分配的 rank 信息（用于调试分层问题）
  if (internalEdges.length > 0) {
    const rankInfo: { id: string; rank: number; x: number; y: number }[] = [];
    for (const n of sorted) {
      const nodeData = g.node(n.id);
      if (nodeData) {
        rankInfo.push({
          id: n.id.replace(/^wms-/, '').substring(0, 15),
          rank: (nodeData as any).rank ?? -1,
          x: Math.round(nodeData.x),
          y: Math.round(nodeData.y)
        });
      }
    }
    safeLog.debug(`[DAGRE-RANKS] 子域="${sgDescDebug}" 节点分层:`,
      rankInfo.sort((a, b) => a.y - b.y).map(r => `${r.id}(rank=${r.rank},y=${r.y})`).join(' → '));
    // 检查同 rank 的节点（应该水平分布）
    const byRank = new Map<number, string[]>();
    rankInfo.forEach(r => {
      const arr = byRank.get(r.rank) || [];
      arr.push(r.id);
      byRank.set(r.rank, arr);
    });
    byRank.forEach((nodes, rank) => {
      if (nodes.length > 1) {
        safeLog.debug(`[DAGRE-RANKS] rank=${rank} 有 ${nodes.length} 个并列节点: ${nodes.join(', ')}`);
        return { rank, nodes };
      }
    });
  }


  // 获取布局结果并计算边界
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const positions: { id: string; x: number; y: number; w: number; h: number }[] = [];

  // 1. 收集 Dagre 布局的节点位置
  safeLog.debug(`[DAGRE-TRACE] === Dagre 计算完成，收集位置 ===`);
  for (const n of connectedNodes) {
    const nodeWithPos = g.node(n.id);
    if (nodeWithPos) {
      const w = getW(n);
      const h = getH(n);
      const x = nodeWithPos.x - w / 2;
      const y = nodeWithPos.y - h / 2;
      positions.push({ id: n.id, x, y, w, h });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  }

  // 2. 处理独立节点：根据方向决定排列方式
  // TB (域水平策略) -> 垂直排列; LR (域垂直策略) -> 水平排列
  if (isolatedNodes.length > 0) {
    const arrangeHorizontally = direction === 'LR';
    const isolatedGap = Math.min(50, dynamicRankSep / 2);

    // 统一放在主要内容下方
    const startY = positions.length > 0 ? (maxY + isolatedGap) : 0;

    // 如果没有连接节点，初始化边界
    if (positions.length === 0) {
      minX = 0;
      minY = 0;
      maxX = 0; // 确保 maxX 有效
      maxY = 0;
    }

    // [FIX] 计算主图中心点用于对齐
    const graphWidth = maxX - minX;
    const graphCenterX = minX + graphWidth / 2;

    if (arrangeHorizontally) {
      // 水平排列独立节点 (LR 模式) - 整体居中
      let totalIsoW = 0;
      for (let i = 0; i < isolatedNodes.length; i++) {
        totalIsoW += getW(isolatedNodes[i]);
        if (i < isolatedNodes.length - 1) totalIsoW += isolatedGap;
      }

      let currentX = graphCenterX - totalIsoW / 2;

      for (const n of isolatedNodes) {
        const w = getW(n);
        const h = getH(n);
        const x = currentX;
        const y = startY;

        positions.push({ id: n.id, x, y, w, h });
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);

        currentX += w + isolatedGap; // 水平步进
      }
    } else {
      // 垂直排列独立节点 (TB 模式) - 逐个水平居中
      let currentY = startY;
      for (const n of isolatedNodes) {
        const w = getW(n);
        const h = getH(n);
        // 居中对齐
        const x = graphCenterX - w / 2;
        const y = currentY;

        positions.push({ id: n.id, x, y, w, h });
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);

        currentY += h + isolatedGap; // 垂直步进
      }
    }
  }

  // 如果没有任何节点，重置边界
  if (positions.length === 0) {
    minX = 0; minY = 0;
  }

  // 内容区偏移（使内容相对于子域内容区起点）
  const offsetX = sx + padH - minX;
  const offsetY = innerTop - minY;



  // 应用位置到节点 - 使用 dagre 计算的相对位置加偏移
  const nodeMap = new Map(sorted.map(n => [n.id, n]));
  const appliedPositions: { id: string; x: number; y: number }[] = [];
  for (const pos of positions) {
    const node = nodeMap.get(pos.id);
    if (node) {
      const newX = Math.round(pos.x + offsetX);
      const newY = Math.round(pos.y + offsetY);
      (node as any).position = { x: newX, y: newY };
      const relX = Math.round(pos.x - minX);  // 相对于 minX (归一化)
      const relY = Math.round(pos.y - minY);  // 相对于 minY (归一化)
      ((node as any).data || ((node as any).data = {})).__dagreRel = { x: relX, y: relY };
      appliedPositions.push({ id: pos.id, x: newX, y: newY });
    }
  }




  // 轻量级同行重叠修复：按 y 坐标分组，检查同行内 x 重叠
  {
    const GAP_X = Math.max(30, hGap);  // 增加最小间隙
    const avgNodeH = sorted.length > 0
      ? sorted.reduce((sum, n) => sum + getH(n), 0) / sorted.length
      : 80;
    const rowThreshold = Math.max(50, avgNodeH * 0.6); // 使用节点高度的 60% 作为同行阈值

    // 按 y 排序
    const sortedByY = sorted.slice().sort((a, b) => {
      const ay = num((a as any)?.position?.y, 0);
      const by = num((b as any)?.position?.y, 0);
      return ay - by;
    });

    // 分组到行
    const rows: ReactFlowNode[][] = [];
    for (const n of sortedByY) {
      const ny = num((n as any)?.position?.y, 0);
      if (rows.length === 0) {
        rows.push([n]);
      } else {
        const lastRow = rows[rows.length - 1];
        const lastY = num((lastRow[0] as any)?.position?.y, 0);
        if (Math.abs(ny - lastY) <= rowThreshold) {
          lastRow.push(n);
        } else {
          rows.push([n]);
        }
      }
    }

    // 修复每行内的 x 重叠（多次迭代确保完全消除重叠）
    for (let iter = 0; iter < 3; iter++) {
      for (const row of rows) {
        if (row.length < 2) continue;
        // 按 x 排序
        row.sort((a, b) => num((a as any)?.position?.x, 0) - num((b as any)?.position?.x, 0));
        for (let i = 1; i < row.length; i++) {
          const prev = row[i - 1];
          const curr = row[i];
          const prevX = num((prev as any)?.position?.x, 0);
          const prevW = getW(prev);
          const currX = num((curr as any)?.position?.x, 0);
          const currY = num((curr as any)?.position?.y, 0);
          const minX = prevX + prevW + GAP_X;
          if (currX < minX) {
            (curr as any).position = {
              x: Math.round(minX),
              y: Math.round(currY),
            };
          }
        }
      }
    }


  }

  // 重新计算边界（因为可能修复了重叠）
  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
  for (const n of sorted) {
    const nx = num((n as any)?.position?.x, 0);
    const ny = num((n as any)?.position?.y, 0);
    const nw = getW(n);
    const nh = getH(n);
    minX = Math.min(minX, nx);
    minY = Math.min(minY, ny);
    maxX = Math.max(maxX, nx + nw);
    maxY = Math.max(maxY, ny + nh);
  }

  // 重要：在重叠修复后更新 __dagreRel，确保它反映最终位置
  // __dagreRel 是相对于子域内容区左上角 (sx + padH, innerTop) 的偏移
  const innerLeft = sx + padH;
  let relMinY = Infinity, relMaxY = -Infinity;
  for (const n of sorted) {
    const nx = num((n as any)?.position?.x, 0);
    const ny = num((n as any)?.position?.y, 0);
    const nh = getH(n);
    const relX = Math.round(nx - innerLeft);
    const relY = Math.round(ny - innerTop);
    ((n as any).data || ((n as any).data = {})).__dagreRel = { x: relX, y: relY };
    // 计算相对于内容区的边界
    relMinY = Math.min(relMinY, relY);
    relMaxY = Math.max(relMaxY, relY + nh);
  }

  // 使用相对坐标计算内容高度（相对于 innerTop）
  const contentWidth = maxX - minX;
  // 重要修复：内容高度应该是节点相对于内容区起点的范围
  // 如果有节点在 innerTop 之上（relMinY < 0），需要扩展容器
  const contentHeight = relMaxY - Math.min(0, relMinY);
  const newW = contentWidth + padH * 2;
  const newH = contentHeight + titleH + titleV + padTop + safeGap + padBottom;

  // 详细高度调试日志（显示容器边界和节点位置）
  const sgDesc = String((sg.data as any)?.description || sg.id);
  const _containerTop = sy;
  const containerBottom = sy + newH;
  const contentAreaTop = innerTop;
  const contentAreaBottom = sy + newH - padBottom;
  const lastNodeBottom = maxY;
  const overflowAmount = lastNodeBottom - contentAreaBottom;
  // DEBUG: 溢出分析
  if (overflowAmount > 0) {
    safeLog.debug(`[OVERFLOW] "${sgDesc}" | container: y=${Math.round(sy)}→${Math.round(containerBottom)} (h=${Math.round(newH)}) | content: y=${Math.round(contentAreaTop)}→${Math.round(contentAreaBottom)} | lastNode: y=${Math.round(maxY)} | overflow=${Math.round(overflowAmount)}px`);
  }

  (sg as any).style = { ...((sg as any).style || {}), width: Math.round(newW), height: Math.round(newH) };
  (sg as any).measured = { width: Math.round(newW), height: Math.round(newH) };
  (sg as any).width = Math.round(newW);
  (sg as any).height = Math.round(newH);
  // 添加 dagre 尺寸标记，用于跳过后续重计算
  ((sg as any).data || ((sg as any).data = {})).__dagreSized = { w: Math.round(newW), h: Math.round(newH), ts: Date.now() };



  return [sg, ...sorted];
};

/**
 * 函数级注释：同步 dagre 布局的子节点位置（基于相对位置）
 * - 目标：当子域容器移动后，使用 __dagreRel 相对位置重新计算子节点的绝对位置
 * - 输入：所有节点列表
 * - 输出：更新后的节点列表（子节点位置已同步）
 */

/**
 * 函数级注释：同步 dagre 布局的子节点位置（基于相对位置）
 * - 目标：当子域容器移动后，使用 __dagreRel 相对位置重新计算子节点的绝对位置
 * - 输入：所有节点列表
 * - 输出：更新后的节点列表（子节点位置已同步）
 */
export const syncDagreChildPositions = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const cfgFull: any = diagramConfigManager.getConfig() || {};
  // 重要：这些配置值必须与 reflowSubGroupChildrenDagre 完全一致！
  const padH = num(cfgFull?.subDomain?.padding?.horizontal ?? (diagramConfigManager.getLayoutConfig() as any)?.SUB_GROUP_PADDING?.H, 24);
  const titleH = num(cfgFull?.subDomain?.title?.height, 48);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const padTop = num(cfgFull?.subDomain?.padding?.top, 12);  // 与 reflowSubGroupChildrenDagre 保持对齐
  const safeGap = Math.max(8, num(cfgFull?.subDomain?.title?.safeGap, 8));

  const idMap = new Map<string, ReactFlowNode>(nodes.map(n => [n.id, n] as const));
  const subGroups = nodes.filter(n => String(n.type || '') === 'subGroup');

  for (const sg of subGroups) {
    const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
    if (!children.length) continue;

    const sgX = num(((sg as any)?.position?.x), 0);
    const sgY = num(((sg as any)?.position?.y), 0);
    const innerLeft = sgX + padH;
    // 关键修正：必须包含 titleH, titleV, padTop 和 safeGap，确保子节点不盖在标题上
    const innerTop = sgY + titleH + titleV + padTop + safeGap;

    let lastNodeBottom = 0;
    for (const cid of children) {
      const child = idMap.get(cid);
      if (!child) continue;

      const rel = ((child as any)?.data as any)?.__dagreRel;
      if (rel && typeof rel.x === 'number' && typeof rel.y === 'number') {
        const newY = Math.round(innerTop + rel.y);
        const childH = num((child as any)?.measured?.height ?? (child as any)?.style?.height, 100);
        lastNodeBottom = Math.max(lastNodeBottom, newY + childH);
        (child as any).position = {
          x: Math.round(innerLeft + rel.x),
          y: newY
        };
        // [DEBUG]
        if (Math.abs(newY - innerTop) < 10) {
          safeLog.warn(`[DAGRE-SYNC-ALERT] Child ${child.id} is very close to innerTop (${innerTop}). Overlap risk!`);
        }
      }
    }

  }

  return nodes;
};

/**
 * 函数级注释：子域网格重排（自动换行、无重叠）
 * 目标：在 Grid 节点布局下，按容器可用宽度进行行内居中打包，超出换行；
 * 规则：计算每行内容宽（含列间距），居中设置起点 x，依次写回；每行高度取最大节点高度。
 */

/**
 * 函数级注释：子域网格重排（自动换行、无重叠）
 * 目标：在 Grid 节点布局下，按容器可用宽度进行行内居中打包，超出换行；
 * 规则：计算每行内容宽（含列间距），居中设置起点 x，依次写回；每行高度取最大节点高度。
 */
export const reflowSubGroupChildrenGrid = (
  sg: ReactFlowNode,
  nodes: ReactFlowNode[],
  hGap: number,
  vGap: number
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const cfgFull: any = diagramConfigManager.getConfig() || {};
  const padH = num(cfgFull?.subDomain?.padding?.horizontal ?? (diagramConfigManager.getLayoutConfig() as any)?.SUB_GROUP_PADDING?.H, 24);
  const titleH = num(cfgFull?.subDomain?.title?.height, 32);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const padTop = num(cfgFull?.subDomain?.padding?.top, 12);
  const safeGap = Math.max(0, num((cfgFull?.subDomain?.title?.safeGap), 0));
  const sx = num(((sg as any)?.position?.x), 0);
  const sy = num(((sg as any)?.position?.y), 0);
  const innerLeft = sx + padH;
  const innerTop = sy + titleH + titleV + padTop + safeGap;
  const innerRight = innerLeft + num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width), 240) - padH * 2;
  const widthAvail = Math.max(0, innerRight - innerLeft);
  const minHGap = Math.max(8, hGap);
  const minVGap = Math.max(8, vGap);
  const list = nodes.slice().sort((a, b) => {
    const ay = (a as any)?.data?.__rel?.y ?? (a as any)?.position?.y ?? 0;
    const by = (b as any)?.data?.__rel?.y ?? (b as any)?.position?.y ?? 0;
    if (ay !== by) return ay - by;
    const ax = (a as any)?.data?.__rel?.x ?? (a as any)?.position?.x ?? 0;
    const bx = (b as any)?.data?.__rel?.x ?? (b as any)?.position?.x ?? 0;
    return ax - bx;
  });
  // 鍏堟寜鍙敤瀹藉害鍒囧垎涓哄琛?
  const rows: ReactFlowNode[][] = [];
  let curRow: ReactFlowNode[] = [];
  let curWidth = 0;
  for (const n of list) {
    const w = num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), 0);
    const need = curRow.length ? (curWidth + minHGap + w) : (curWidth + w);
    if (need > widthAvail && curRow.length) {
      rows.push(curRow);
      curRow = [n];
      curWidth = w;
    } else {
      curRow.push(n);
      curWidth = need;
    }
  }
  if (curRow.length) rows.push(curRow);
  // 琛屽唴灞呬腑涓庣疮杩涜楂?
  let cy = innerTop;
  for (const row of rows) {
    const widths = row.map(n => num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), 0));
    const heights = row.map(n => num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), 0));
    const rowContentW = widths.reduce((s, w, i) => s + w + (i > 0 ? minHGap : 0), 0);
    const startX = innerLeft + Math.max(0, Math.floor((widthAvail - rowContentW) / 2));
    let cx = startX;
    let maxRowH = 0;
    for (let i = 0; i < row.length; i++) {
      const n = row[i];
      const w = widths[i];
      const h = heights[i];
      const nx = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w));
      const ny = cy;
      (n as any).position = { x: Math.round(nx), y: Math.round(ny) } as any;
      cx = nx + w + minHGap;
      maxRowH = Math.max(maxRowH, h);
    }
    cy = cy + maxRowH + minVGap;
  }
  return [sg, ...list];
};

/**
 * 函数级注释：子域标题清空区强制
 * 目标：确保子域标题区域不被 children 覆盖。
 * 规则：若 child.y 位于标题清空区内，上移至清空区下缘（保持 x 不变）。
 */

/**
 * 函数级注释：子域标题清空区强制
 * 目标：确保子域标题区域不被 children 覆盖。
 * 规则：若 child.y 位于标题清空区内，上移至清空区下缘（保持 x 不变）。
 */
export const enforceSubGroupTitleClearance = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const cfgFull: any = diagramConfigManager.getConfig() || {};
  const layoutCfg: any = diagramConfigManager.getLayoutConfig() || {};
  const padH = num(cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H, 24);
  const titleH = num(cfgFull?.subDomain?.title?.height, 32);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const padTop = num(cfgFull?.subDomain?.padding?.top, 12);
  const safeGap = Math.max(0, num((cfgFull?.subDomain?.title?.safeGap), 0));
  const minVGap = Math.max(8, num(layoutCfg?.NODE_V_GAP, 80));
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  for (let i = 0; i < updated.length; i++) {
    const sg = updated[i];
    if (String(sg.type || '') !== 'subGroup') continue;
    const children = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];
    if (!children.length) continue;
    const sx = num(((sg as any)?.position?.x), 0);
    const sy = num(((sg as any)?.position?.y), 0);
    const innerTop = sy + titleH + titleV + padTop + safeGap;
    const sizeW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0);
    const sizeH = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height)), 0);
    const innerLeft = sx + padH;
    const innerRight = sx + Math.max(1, sizeW) - padH;
    const innerBottom = sy + Math.max(1, sizeH) - num(layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM, 20);
    const list = children
      .map(cid => idMap.get(cid))
      .filter((n): n is ReactFlowNode => !!n)
      .slice()
      .sort((a, b) => num(((a as any)?.position?.y), innerTop) - num(((b as any)?.position?.y), innerTop));
    let cursorY = innerTop;
    for (const n of list) {
      const idx = updated.findIndex(u => u.id === n.id);
      if (idx < 0) continue;
      const w = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 120);
      const h = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 80);
      const cx = num(((n as any)?.position?.x), sx + padH);
      const cy = num(((n as any)?.position?.y), innerTop);
      const ny = cy < innerTop ? cursorY : cy;
      const nx = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - w));
      const nyClamped = Math.min(Math.max(ny, innerTop), Math.max(innerTop, innerBottom - h));
      (updated[idx] as any).position = { x: Math.round(nx), y: Math.round(nyClamped) } as any;
      cursorY = Math.max(cursorY, ny + h + minVGap);
    }
  }
  return updated;
};

/**
 * 鍩熷鍣ㄩ珮搴︽渶缁堟姇褰卞洖鏀讹紙鍑芥暟绾ф敞閲婏級
 * 鐩爣锛氭寜鍩熷唴鎴愬憳锛堝瓙鍩熷鍣?+ 鏅€氳妭鐐癸級鐨勫瀭鐩存姇褰辩簿纭绠楀煙瀹瑰櫒楂樺害锛涗繚鐣欏煙宸?涓婇敋涓嶅彉锛屼粎鍐欏洖楂樺害銆?
 */

/**
 * 函数级注释：子域容器左锚统一（按域）
 * 目标：将同一域内所有可见 subGroup 的 `position.x` 统一到域内左锚（`innerLeft - subPadH`），并同步 children 的 x 位移。
*/
export const unifySubGroupLeftAnchors = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const subPadH = num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const titleH = num(cfgFull?.domain?.title?.height, 40);
  const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
  const sideSafe = Math.max(0, num(cfgFull?.domain?.sideSafeGap, 8));
  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const dx = num(((dc as any)?.position?.x), 0);
    const dy = num(((dc as any)?.position?.y), 0);
    const innerLeft = dx + padH + sideSafe;
    const innerTop = dy + titleH + titleV + titleSafe;
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
    for (let i = 0; i < updated.length; i++) {
      const sg = updated[i];
      if (!sgs.some(n => n.id === sg.id)) continue;
      const oldX = num(((sg as any)?.position?.x), innerLeft - subPadH);
      const oldY = num(((sg as any)?.position?.y), innerTop);
      const targetX = innerLeft - subPadH;
      const dxShift = Math.round(targetX - oldX);
      (updated[i] as any).position = { x: targetX, y: oldY } as any;
      const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
      if (dxShift !== 0 && children.length) {
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          const cx = num(((child as any)?.position?.x), innerLeft);
          const cy = num(((child as any)?.position?.y), innerTop);
          (child as any).position = { x: Math.round(cx + dxShift), y: cy } as any;
        }
      }
    }
  }
  return updated;
};

/**
 * 瀛愬煙瀹瑰櫒鍨傜洿鍫嗗彔锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鍚屼竴鍩熷唴锛屽皢鎵€鏈夊彲瑙佸瓙鍩熷鍣ㄦ寜 y 鍗囧簭浠庡煙鍐呴儴椤堕儴閿氱偣寮€濮嬩緷娆″瀭鐩村爢鍙狅紝闂磋窛鍙?NODE_V_GAP锛涘悓姝?children 鐨?y 骞崇Щ銆?
 */

/**
 * 瀛愬煙瀹瑰櫒鍨傜洿鍫嗗彔锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鍚屼竴鍩熷唴锛屽皢鎵€鏈夊彲瑙佸瓙鍩熷鍣ㄦ寜 y 鍗囧簭浠庡煙鍐呴儴椤堕儴閿氱偣寮€濮嬩緷娆″瀭鐩村爢鍙狅紝闂磋窛鍙?NODE_V_GAP锛涘悓姝?children 鐨?y 骞崇Щ銆?
 */
export const stackSubGroupsVertically = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const titleH = num(cfgFull?.domain?.title?.height, 40);
  const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
  const sideSafe = Math.max(0, num(cfgFull?.domain?.sideSafeGap, 8));
  const vGap = num(layoutCfg?.NODE_V_GAP, 80);
  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const dx = num(((dc as any)?.position?.x), 0);
    const dy = num(((dc as any)?.position?.y), 0);
    const innerTop = dy + titleH + titleV + titleSafe;
    const innerLeft = dx + padH + sideSafe;
    const sgs = updated
      .filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId)
      .slice()
      .sort((a, b) => {
        const da = (a.data as any) || {};
        const db = (b.data as any) || {};
        const saRaw = da.sequence ?? da.order;
        const sbRaw = db.sequence ?? db.order;
        const sa = typeof saRaw === 'number' ? saRaw : parseFloat(saRaw);
        const sb = typeof sbRaw === 'number' ? sbRaw : parseFloat(sbRaw);
        const hasA = isFinite(sa);
        const hasB = isFinite(sb);
        if (hasA && hasB) return sa - sb;
        if (hasA) return -1;
        if (hasB) return 1;
        return num(((a as any)?.position?.y), innerTop) - num(((b as any)?.position?.y), innerTop);
      });
    let cursorY = innerTop;
    for (const sg of sgs) {
      const oldX = num(((sg as any)?.position?.x), innerLeft - num((cfgFull?.subDomain?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30));
      const oldY = num(((sg as any)?.position?.y), cursorY);
      const h = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0);
      const dx0 = 0;
      const dy0 = cursorY - oldY;
      (sg as any).position = { x: oldX, y: cursorY } as any;
      const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
      if (children.length && dy0 !== 0) {
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          const cx = num(((child as any)?.position?.x), innerLeft);
          const cy = num(((child as any)?.position?.y), innerTop);
          (child as any).position = { x: cx + dx0, y: cy + dy0 } as any;
        }
      }
      cursorY += h + vGap;
    }
  }
  return updated;
};

/**
 * 函数级注释：子域/域容器内部节点边界钳制
 * 目的：当节点布局变化后，确保所有子节点完整纳入其所属容器（subGroup/titleGroup）的内部边界，避免“溢出容器”。
 * 规则：
 * - 子域容器（subGroup）：左右使用 `subDomain.padding.horizontal`，顶部使用 `ensureTitleClearance` 后的 top（取 max(配置 top, 标题清空高度)），底部使用 `subDomain.padding.bottom`；
 * - 域容器（titleGroup）：左右使用 `domain.padding.horizontal`，顶部使用 `title.height + title.padding.vertical + title.safeGap`，底部使用 `domain.bottomSafeGap`；
 * - 钳制不改变节点尺寸，仅移动位置；当节点尺寸超过内容边界时，位置钳制为内容区左上角。
*/

/**
 * 函数级注释：子域容器宽度扩展以填满域内可用宽度（仅扩展不收缩）
 * 目标：将同域内每个可见子域容器的宽度扩展到“域内部可用宽度 availW”，并将其左锚对齐到 `innerLeft - subPadH`；两侧留白仅为子域自身水平内边距，避免相对域右侧过大空白。
 * 规则：
 * - 仅当 `availW > curW` 时扩展；避免内容被压缩导致换行或溢出；
 * - 不更新 children 的位置与尺寸，仅扩展容器包围框；
 * - 写回 `style.width/measured.width/width` 与 `position.x`。
 */
export const expandSubGroupsToDomainWidth = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const titleH = num(cfgFull?.domain?.title?.height, 40);
  const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
  const subPadH = num(cfgFull?.subDomain?.padding?.horizontal, Math.max(16, Math.floor(padH * 0.8)));
  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const x = num(((dc as any)?.position?.x), 0);
    const y = num(((dc as any)?.position?.y), 0);
    const w = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
    const innerLeft = x + padH;
    const innerRight = x + Math.max(1, w) - padH;
    const innerTop = y + titleH + titleV + titleSafe;
    const availW = Math.max(0, innerRight - innerLeft);
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
    for (const sg of sgs) {
      const curW = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
      const curH = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height)), 0);
      const oldY = num(((sg as any)?.position?.y), innerTop);
      const targetW = Math.max(curW, availW);
      const targetX = innerLeft - subPadH;
      ((sg as any).style || ((sg as any).style = {})).width = targetW;
      ((sg as any).style || ((sg as any).style = {})).height = curH;
      (sg as any).measured = { width: targetW, height: curH } as any;
      (sg as any).width = targetW;
      (sg as any).position = { x: targetX, y: oldY } as any;
    }
  }
  return updated;
};


/**
 * 函数级注释：域内内容等比适配域容器
 * 目标：统一域宽后，将同域内所有成员视作整体，按域内部可用区域进行“宽高等比”缩放与平移，使内容适配容器，保持结构不变。
 * 瑙勫垯锛?
 * - 璁＄畻鍩熷唴閮ㄨ竟鐣岋細innerLeft/innerRight銆乮nnerTop/innerBottom锛涘彲鐢ㄥ昂瀵?availW/availH锛?
 * - 璁＄畻鍩熷唴瀹瑰寘鍥寸洅锛歝ontentMinLeft/contentMaxRight銆乧ontentMinTop/contentMaxBottom锛涘唴瀹瑰昂瀵?contentW/contentH锛?
 * - 绛夋瘮缂╂斁绯绘暟锛歴cale = min(availW/contentW, availH/contentH)锛?
 * - 瀵瑰悓鍩熸垚鍛橈紙鎺掗櫎 titleGroup 涓?hidden锛夋墽琛岋細
 *   newX = innerLeft + (x - contentMinLeft) * scale
 *   newY = innerTop  + (y - contentMinTop ) * scale
 *   newW = oldW * scale
 *   newH = oldH * scale
 */

/**
 * 函数级注释：域内内容等比缩放以填满域内部宽度
 * 目标：统一域容器宽度后，对同域内所有成员按域内部可用宽度进行水平等比缩放，保持垂直坐标与高度不变。
 * 瑙勫垯锛氬鍚屽煙鐨勬垚鍛橈紙鎺掗櫎 titleGroup 涓?hidden锛夋墽琛岋細
 *   newX = innerLeft + (x - contentMinLeft) * scale
 *   newW = oldW * scale
 * 其中：innerLeft = tgX + padH；scale = (tgW - 2*padH) / contentW。
 */

/**
 * 函数级注释：域内内容等比缩放以填满域内部宽度
 * 目标：统一域容器宽度后，对同域内所有成员按域内部可用宽度进行水平等比缩放，保持垂直坐标与高度不变。
 * 瑙勫垯锛氬鍚屽煙鐨勬垚鍛橈紙鎺掗櫎 titleGroup 涓?hidden锛夋墽琛岋細
 *   newX = innerLeft + (x - contentMinLeft) * scale
 *   newW = oldW * scale
 * 其中：innerLeft = tgX + padH；scale = (tgW - 2*padH) / contentW。
 */
export const scaleDomainContentToFitWidth = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const sideSafe = Math.max(0, num(cfgFull?.domain?.sideSafeGap, 8));
  const tgs = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const tg of tgs) {
    const dId = String((((tg as any).data?.domain || '')));
    if (!dId) continue;
    const tx = num(((tg as any)?.position?.x), 0);
    const tw = num((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 0);
    const innerLeft = tx + padH + sideSafe;
    const innerRight = tx + Math.max(1, tw) - padH - sideSafe;
    const availW = Math.max(0, innerRight - innerLeft);
    if (availW <= 0) continue;
    let contentMinLeft = Infinity, contentMaxRight = -Infinity;
    for (const n of updated) {
      const nd = String(((n.data as any)?.domain || ''));
      const tp = String(n.type || '');
      if (nd !== dId || tp === 'titleGroup') continue;
      if ((((n as any)?.data) || {})?.hidden) continue;
      const nx = num(((n as any)?.position?.x), innerLeft);
      const nw = num((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
      contentMinLeft = Math.min(contentMinLeft, nx);
      contentMaxRight = Math.max(contentMaxRight, nx + nw);
    }
    if (!isFinite(contentMinLeft) || !isFinite(contentMaxRight) || contentMaxRight <= contentMinLeft) continue;
    const contentW = Math.max(0, contentMaxRight - contentMinLeft);
    if (contentW <= 0) continue;
    const scale = availW / contentW;
    if (!isFinite(scale) || scale <= 0) continue;
    for (let i = 0; i < updated.length; i++) {
      const n = updated[i];
      const nd = String(((n.data as any)?.domain || ''));
      const tp = String(n.type || '');
      if (nd !== dId || tp === 'titleGroup') continue;
      if ((((n as any)?.data) || {})?.hidden) continue;
      const nx = num(((n as any)?.position?.x), innerLeft);
      const ny = num(((n as any)?.position?.y), 0);
      const nw = num((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
      const newX = Math.round(innerLeft + (nx - contentMinLeft) * scale);
      const newW = Math.max(1, Math.round(nw * scale));
      (n as any).position = { x: newX, y: ny } as any;
      ((n as any).style || ((n as any).style = {})).width = newW;
      (n as any).measured = { width: newW, height: num((((n as any)?.measured?.height ?? (n as any)?.style?.height)), 0) } as any;
      updated[i] = { ...n } as any;
    }
  }
  return updated;
};

// 甯冨眬璁＄畻涓诲嚱鏁?

/**
 * 瀛愬煙瀹瑰櫒鍦ㄥ煙鍐呴儴姘村钩灞呬腑锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鍩熷涓庡瓙鍩熸渶缁堝搴︾‘瀹氬悗锛屼娇姣忎釜鍙瀛愬煙瀹瑰櫒鍦ㄦ墍灞炲煙鍐呴儴鍙敤瀹藉害鍐呮按骞冲眳涓紝淇濊瘉宸﹀彸鐣欑櫧瀵圭О锛涘悓姝?children 鐨?x 骞崇Щ锛屼笉鏀瑰彉 y銆?
 */
export const centerSubGroupsInDomain = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));

  // 基础配置
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const _titleH = num(cfgFull?.domain?.title?.height, 40);
  const _titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const _titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);

  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');

  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;

    const x = num(((dc as any)?.position?.x), 0);
    const w = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);

    if (w <= 0) continue;

    // 获取当前域的所有可见子组
    const sgs = updated.filter(n => {
      if (String(n.type || '') !== 'subGroup') return false;
      if (((n as any)?.data)?.hidden) return false;
      // 匹配逻辑：优先 parentId，其次 domain 属性
      if (n.parentId === dc.id) return true;
      const subDomain = String(((n.data as any)?.domain || ''));
      return subDomain === dId;
    });

    if (sgs.length === 0) continue;

    // 核心修正：使用子域的实际位置边界来计算 contentWidth，
    // 而不是用可能与 Dagre 不一致的 gap 值重新推算。
    // 这样无论 Dagre 用了什么 gap，居中计算都是准确的。
    const subWidths = sgs.map((sg: any) => num(sg?.measured?.width ?? sg?.style?.width, 0));
    const subPositions = sgs.map((sg: any) => num(sg?.position?.x, 0));

    // 计算子域群的实际边界（minX 到 maxX+width）
    let contentMinX = Infinity;
    let contentMaxX = -Infinity;
    for (let i = 0; i < sgs.length; i++) {
      const sgX = subPositions[i];
      const sgW = subWidths[i];
      contentMinX = Math.min(contentMinX, sgX);
      contentMaxX = Math.max(contentMaxX, sgX + sgW);
    }
    const contentWidth = contentMaxX - contentMinX;

    if (contentWidth <= 0) continue;

    // 居中偏移量：在域宽内居中整个子域群
    // 域的可用空间 = [x + padH, x + w - padH]
    // 目标：子域群的中心 = 域的中心 = x + w/2
    // 所以子域群的 minX 应该 = x + (w - contentWidth) / 2
    const targetMinX = x + (w - contentWidth) / 2;
    const dx = Math.round(targetMinX - contentMinX);

    // 安全检查：居中后子域群不应超出 padH 边界
    const finalMinX = contentMinX + dx;
    if (finalMinX < x + padH) {
      continue;
    }

    if (dx === 0) {
      continue;
    }



    // 统一平移所有子域（保持子域间的相对位置不变）
    for (let i = 0; i < sgs.length; i++) {
      const sg = sgs[i];
      const oldX = subPositions[i];
      const newX = oldX + dx;

      (sg as any).position = {
        x: newX,
        y: num(((sg as any)?.position?.y), 0)
      } as any;

      // 同步 children 位置
      const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
      if (dx !== 0 && children.length > 0) {
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          const cx = num(((child as any)?.position?.x), 0);
          const cy = num(((child as any)?.position?.y), 0);
          (child as any).position = { x: Math.round(cx + dx), y: cy } as any;
        }
      }
    }
  }

  return updated;
};

/**
 * 鍚屽煙瀛愬煙瀹瑰櫒瀹藉害缁熶竴锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬鍚屼竴鍩熷唴鎵€鏈夊彲瑙佺殑 `subGroup`锛屽皢鍏跺搴︾粺涓€涓鸿鍩熷唴鐨勬渶澶у瓙鍩熷搴︼紝浠呮洿鏂板搴︼紝涓嶆敼鍙橀珮搴︿笌浣嶇疆銆?
 */

/**
 * 鍚屽煙瀛愬煙瀹瑰櫒瀹藉害缁熶竴锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬鍚屼竴鍩熷唴鎵€鏈夊彲瑙佺殑 `subGroup`锛屽皢鍏跺搴︾粺涓€涓鸿鍩熷唴鐨勬渶澶у瓙鍩熷搴︼紝浠呮洿鏂板搴︼紝涓嶆敼鍙橀珮搴︿笌浣嶇疆銆?
 */
export const unifySubGroupWidthsByDomain = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const layeredCfg = LayeredConfigManager.getInstance();
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const sideSafe = Math.max(0, num(cfgFull?.domain?.sideSafeGap, 8));
  const minW = num(layoutCfg?.NODE_MIN_WIDTH, 120);
  const tgs = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const dc of tgs) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const tx = num(((dc as any)?.position?.x), 0);
    const tw = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
    const innerLeft = tx + padH;
    const innerRight = tx + Math.max(1, tw) - padH;
    const availW = Math.max(1, innerRight - innerLeft);
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
    if (!sgs.length) continue;
    const alignPref = String(layeredCfg.get<string>('diagram.layout.subGroupAlign', 'center') || 'center').toLowerCase();
    const maxW = sgs.reduce((m, sg) => Math.max(m, num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width)), 0)), 0);
    const targetContentW = Math.max(1, availW - 2 * sideSafe);
    const _subPadH = num((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H), 30);
    const unifiedW = alignPref === 'center'
      // 为保证左右内容留白都等于 sideSafe，需要在内容宽度基础上加上两侧子域水平内边距 -> 已修正：不再加倍内边距，严格匹配可用内容宽
      ? Math.max(minW, targetContentW)
      : Math.max(minW, Math.min(maxW, targetContentW));
    for (let i = 0; i < updated.length; i++) {
      const sg = updated[i];
      if (!sgs.some(n => n.id === sg.id)) continue;
      const ch = num((((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height)), 0);
      ((updated[i] as any).style || (((updated[i] as any).style) = {})).width = unifiedW;
      ((updated[i] as any).style || (((updated[i] as any).style) = {})).height = ch;
      (updated[i] as any).measured = { width: unifiedW, height: ch } as any;
      (updated[i] as any).width = unifiedW;
      (updated[i] as any).height = ch;
    }
  }
  return updated;
};

/**
 * 缂哄け瀛愬煙閿殑涓氬姟鑺傜偣琛ラ綈锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬綋涓氬姟鑺傜偣瀛樺湪 `domain` 浣嗙己灏?`subDomain` 鏃讹紝浣跨敤鍏?`domain` 鍊艰ˉ榻?`data.subDomain`锛堝苟鍙€夎ˉ榻?`metadata.subDomain`锛夛紝
 *      浣垮緱鏃犲瓙鍩熼敭鐨勮妭鐐瑰湪鍚庣画璇箟鍒嗙粍涓庢槧灏勬椂涓庢湁瀛愬煙閿殑鑺傜偣缁撴瀯涓€鑷达細domain 鈫?subDomain 鈫?node銆?
 */

/**
 * 鍩熷唴瀹规按骞崇瓑姣旂缉鏀撅紙鍖呭惈瀛愬煙瀹瑰櫒涓庢櫘閫氳妭鐐癸級锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氱粺涓€鍩熷鍣ㄥ搴﹀悗锛屽皢鍚屽煙鍐呮墍鏈夋垚鍛橈紙鎺掗櫎 titleGroup锛夎浣滄暣浣擄紝鎸夊煙鍐呴儴鍙敤瀹藉害杩涜鈥滄按骞崇瓑姣旂缉鏀锯€濓紱
 * 琛屼负锛氱缉鏀?X 涓?width锛屼繚鎸?Y 涓?height 涓嶅彉锛岄伩鍏嶆枃鏈瑙夎鈥滄媺浼糕€濄€?
 */
export const scaleDomainContentToFitWidthAll = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const sideSafe = Math.max(0, num(cfgFull?.domain?.sideSafeGap, 8));
  const tgs = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const tg of tgs) {
    const dId = String((((tg as any).data?.domain || '')));
    if (!dId) continue;
    const tx = num(((tg as any)?.position?.x), 0);
    const tw = num((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 0);
    const innerLeft = tx + padH + sideSafe;
    const innerRight = tx + Math.max(1, tw) - padH - sideSafe;
    const availW = Math.max(0, innerRight - innerLeft);
    if (availW <= 0) continue;
    let minL = Infinity, maxR = -Infinity;
    for (const n of updated) {
      const nd = String(((n.data as any)?.domain || ''));
      const tp = String(n.type || '');
      if (nd !== dId || tp === 'titleGroup') continue;
      if ((((n as any)?.data) || {})?.hidden) continue;
      const nx = num(((n as any)?.position?.x), innerLeft);
      const nw = num((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
      minL = Math.min(minL, nx);
      maxR = Math.max(maxR, nx + nw);
    }


    if (!isFinite(minL) || !isFinite(maxR) || maxR <= minL) continue;
    const contentW = Math.max(0, maxR - minL);
    if (contentW <= 0) continue;
    const scale = availW / contentW;
    if (!isFinite(scale) || scale <= 0) continue;
    for (let i = 0; i < updated.length; i++) {
      const n = updated[i];
      const nd = String(((n.data as any)?.domain || ''));
      const tp = String(n.type || '');
      if (nd !== dId || tp === 'titleGroup') continue;
      if ((((n as any)?.data) || {})?.hidden) continue;
      const nx = num(((n as any)?.position?.x), innerLeft);
      const ny = num(((n as any)?.position?.y), 0);
      const nw = num((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
      const nh = num((((n as any)?.measured?.height ?? (n as any)?.style?.height)), 0);
      const newX = Math.round(innerLeft + (nx - minL) * scale);
      const newW = Math.max(1, Math.round(nw * scale));
      (n as any).position = { x: newX, y: ny } as any;
      ((n as any).style || ((n as any).style = {})).width = newW;
      (n as any).measured = { width: newW, height: nh } as any;
      (n as any).width = newW;
      updated[i] = { ...n } as any;
    }
  }
  return updated;
};



/**
 * 灏嗗煙鍐呯殑鑷敱鑺傜偣涓嬫帹鍒板瓙鍩熻涔嬩笅
 * - 瀵规瘡涓煙锛岃绠楄鍩熷唴鎵€鏈夊瓙鍩熷鍣ㄧ殑鏈€澶у簳杈癸紱
 * - 灏嗗悓鍩熺殑鏅€氫笟鍔¤妭鐐圭殑 y 鍧愭爣閽冲埗鍒扳€滄渶澶у簳杈?+ 鍨傜洿闂磋窛鈥濓紝閬垮厤涓庡瓙鍩熸í鎺掑甫鍙戠敓閲嶅彔銆?
 */

/**
 * 瀛愬煙瀹瑰櫒宸﹀彸鐣欑櫧鎶曞奖鏍℃锛堢粓鎬佸姞鍥猴級锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鎵€鏈夊竷灞€涓庡鍣ㄥ搴︾‘瀹氬悗锛屾寜鍩熺殑鍐呴儴杈圭晫涓庡瓙鍩熷疄闄呬綅缃?瀹藉害璁＄畻宸﹀彸鐣欑櫧锛?
 *      閫氳繃 dx = (rightMargin - leftMargin)/2 杩涜涓€娆℃€у钩绉伙紝浣垮乏鍙崇暀鐧戒弗鏍肩浉绛夛紱涓嶆敼鍙樺搴︺€?
 */
export const equalizeSubGroupMarginsByProjection = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const _sideSafe = Math.max(0, num(cfgFull?.domain?.sideSafeGap, 8));
  const tgs = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const tg of tgs) {
    const dId = String((((tg as any).data?.domain || '')));
    if (!dId) continue;
    const tx = num(((tg as any)?.position?.x), 0);
    const tw = num((((tg as any)?.measured?.width ?? (tg as any)?.style?.width)), 0);
    const innerLeft = tx + padH;
    const innerRight = tx + Math.max(1, tw) - padH;
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);
    for (let i = 0; i < updated.length; i++) {
      const sg = updated[i];
      if (!sgs.some(n => n.id === sg.id)) continue;
      const x = num(((sg as any)?.position?.x), innerLeft);
      // 严格嵌套模式：不再偏移 subPadH
      const w = num((((sg as any)?.measured?.width ?? (sg as any)?.style?.width)), 0);
      const leftMargin = Math.max(0, x - innerLeft);
      const rightMargin = Math.max(0, innerRight - (x + w));
      const dx = Math.round((rightMargin - leftMargin) / 2);
      const minX = innerLeft;
      const maxX = innerRight - w;
      const nx = Math.min(Math.max(x + dx, minX), maxX);
      const applyDx = Math.round(nx - x);
      if (applyDx !== 0) {
        (sg as any).position = { x: nx, y: num(((sg as any)?.position?.y), 0) } as any;
        const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          const cx = num(((child as any)?.position?.x), 0);
          const cy = num(((child as any)?.position?.y), 0);
          (child as any).position = { x: Math.round(cx + applyDx), y: cy } as any;
        }
      }
    }
  }
  return updated;
};

/**
 * 瀛愬煙瀹瑰櫒涓婁笅鐣欑櫧鎶曞奖鏍℃锛堢粓鎬佸姞鍥猴級锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鍩熷唴閮紝鏍规嵁褰撳墠鎵€鏈夊瓙鍩熺殑鎶曞奖涓婁笅杈癸紝璁＄畻涓庡煙鍐呭鍖虹殑涓婁笅鐣欑櫧锛屽苟閫氳繃 dy = (bottomMargin - topMargin)/2 骞崇Щ鏁磋瀛愬煙锛?
 *      浣夸笂涓嬬暀鐧戒弗鏍肩浉绛夛紱涓嶆敼鍙橀珮搴︿笌瀹藉害锛岄挸鍒跺埌鍩熷唴閮ㄨ竟鐣屻€?
 */

/**
 * 瀛愬煙瀹瑰櫒涓婁笅鐣欑櫧鎶曞奖鏍℃锛堢粓鎬佸姞鍥猴級锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鍩熷唴閮紝鏍规嵁褰撳墠鎵€鏈夊瓙鍩熺殑鎶曞奖涓婁笅杈癸紝璁＄畻涓庡煙鍐呭鍖虹殑涓婁笅鐣欑櫧锛屽苟閫氳繃 dy = (bottomMargin - topMargin)/2 骞崇Щ鏁磋瀛愬煙锛?
 *      浣夸笂涓嬬暀鐧戒弗鏍肩浉绛夛紱涓嶆敼鍙橀珮搴︿笌瀹藉害锛岄挸鍒跺埌鍩熷唴閮ㄨ竟鐣屻€?
 */
export const equalizeSubGroupVerticalMarginsByProjection = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  // 宸插洖鎾わ細涓嶅啀杩涜涓婁笅鐣欑櫧鎶曞奖鏍℃锛岀洿鎺ヨ繑鍥炲師鑺傜偣闆嗗悎
  return nodes.map(n => ({ ...n }));
};
/**
 * 鍑芥暟绾ф敞閲婏細瀛愬煙鍐呴儴涓ユ牸甯冨眬锛堟寜绛栫暐锛?
 * 杈撳叆锛氳妭鐐归泦鍚堛€佸竷灞€绛栫暐锛坔orizontal/vertical/grid/centered锛?
 * 琛屼负锛氬姣忎釜 subGroup锛屼緷鎹叾鍐呴儴杈圭晫涓?children 椤哄簭锛屾寜鎵€閫夌瓥鐣ラ噸鏂版斁缃?children锛岀‘淇濇棤閲嶅彔涓旈棿璺濋伒寰厤缃€?
 */

/**
 * 鍑芥暟绾ф敞閲婏細瀛愬煙鍐呴儴涓ユ牸甯冨眬锛堟寜绛栫暐锛?
 * 杈撳叆锛氳妭鐐归泦鍚堛€佸竷灞€绛栫暐锛坔orizontal/vertical/grid/centered锛?
 * 琛屼负锛氬姣忎釜 subGroup锛屼緷鎹叾鍐呴儴杈圭晫涓?children 椤哄簭锛屾寜鎵€閫夌瓥鐣ラ噸鏂版斁缃?children锛岀‘淇濇棤閲嶅彔涓旈棿璺濋伒寰厤缃€?
 */
export const enforceSubGroupChildrenLayoutStrict = (
  nodes: ReactFlowNode[],
  layout: 'horizontal' | 'vertical' | 'grid' | 'centered'
): ReactFlowNode[] => {
  const cfgLayout = diagramConfigManager.getLayoutConfig() as any;
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const H_GAP = num(cfgLayout?.NODE_H_GAP, 120);
  const V_GAP = num(cfgLayout?.NODE_V_GAP, 80);
  const SUB_TOP_CFG = num((cfgFull?.subDomain?.padding?.top ?? cfgFull?.subGroup?.padding?.top ?? cfgLayout?.SUB_GROUP_PADDING?.V_TOP), 28);
  const SUB_H = num((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? cfgLayout?.SUB_GROUP_PADDING?.H), 30);
  const titleH = num((cfgFull?.subDomain?.title?.height ?? cfgFull?.subGroup?.title?.height ?? cfgLayout?.SUB_GROUP_TITLE_HEIGHT), 28);
  const titleV = num((cfgFull?.subDomain?.title?.padding?.vertical ?? cfgFull?.subGroup?.title?.padding?.vertical ?? cfgLayout?.SUB_GROUP_TITLE_SAFE_GAP), 8);
  const ensureClear = !!cfgLayout?.ENSURE_SUB_GROUP_TITLE_CLEARANCE;
  const titleClear = num(cfgLayout?.SUB_GROUP_TITLE_CLEARANCE, titleH + titleV);
  let TOP_PAD = (ensureClear ? Math.max(titleH + titleV, titleClear) : (titleH + titleV)) + SUB_TOP_CFG;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), num(cfgLayout?.NODE_MIN_WIDTH, 120));
  const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), num(cfgFull?.node?.height, 80));
  const SUB_BOTTOM = num((cfgFull?.subDomain?.padding?.bottom ?? cfgFull?.subGroup?.padding?.bottom ?? cfgLayout?.SUB_GROUP_PADDING?.V_BOTTOM), 28);
  for (let i = 0; i < updated.length; i++) {
    const sg = updated[i];
    if (String(sg.type || '') !== 'subGroup') continue;
    const children = Array.isArray((sg.data as any)?.children) ? ((sg.data as any).children as string[]) : [];
    if (!children.length) continue;
    const pos = sg.position || { x: 0, y: 0 } as any;
    const size = { w: num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width), 0), h: num(((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height), 0) };
    const innerLeft = num(pos.x, 0) + SUB_H;
    const innerTop = num(pos.y, 0) + TOP_PAD;
    // 强制使用子域自身宽度进行居中，不再依赖域宽查找
    // const domainInnerW = findDomainInnerWidth(sg);
    const innerRight = size.w > 0 ? (num(pos.x, 0) + size.w - SUB_H) : (innerLeft + Math.max(1, num((diagramConfigManager.getConfig() as any)?.layout?.mainColumnWidth, 400)));
    const selfAvailW = Math.max(1, innerRight - innerLeft);
    const availW = selfAvailW; // Math.max(1, (domainInnerW ?? selfAvailW));
    const childIds = children.filter(cid => {
      const n = idMap.get(cid);
      if (!n) return false;
      const t = String(n.type || '');
      if (t === 'subGroup' || t === 'titleGroup' || t === 'group' || t === 'domain') return false;
      const hidden = !!((n.data as any)?.hidden);
      return !hidden;
    });
    if (layout === 'grid') {
      TOP_PAD = titleH + Math.max(6, Math.floor(titleV * 0.5));
      const widths = childIds.map(cid => { const n = idMap.get(cid) as ReactFlowNode; return getW(n); });
      const heights = childIds.map(cid => { const n = idMap.get(cid) as ReactFlowNode; return getH(n); });
      const colGap = Math.max(12, H_GAP);
      const rowGap = Math.max(8, V_GAP);
      // 目标列数：按域内子域数量（少于3→2列，否则3列），受可用宽度与子节点尺寸影响
      const dKey = String((((sg as any)?.data?.domain || ''))).trim();
      const subCountInDomain = nodes.filter(n => String(n.type || '') === 'subGroup' && String((((n as any)?.data?.domain || ''))).trim() === dKey).length;
      const desiredCols = Math.min(childIds.length, subCountInDomain >= 3 ? 2 : 3);

      // 按容限收缩：使用“可变列数 + 最小列距”，若行内计算超过 availW 则换行
      let x = innerLeft, y = innerTop, c = 0, rowMaxH = 0, rowUsedW = 0;
      const rowHeights: number[] = [];
      const rowWidths: number[] = [];
      const maxCols = Math.max(1, desiredCols);
      for (let iChild = 0; iChild < childIds.length; iChild++) {
        const cid = childIds[iChild];
        const idx = updated.findIndex(n => n.id === cid);
        if (idx < 0) continue;
        const w = widths[iChild];
        const h = heights[iChild];
        if (c >= maxCols) {
          rowWidths.push(rowUsedW);
          rowHeights.push(rowMaxH);
          x = innerLeft; y += rowMaxH + rowGap; c = 0; rowMaxH = 0; rowUsedW = 0;
        }
        (updated[idx] as any).position = { x, y } as any;
        rowMaxH = Math.max(rowMaxH, h);
        rowUsedW = (c === 0 ? w : rowUsedW + colGap + w);
        c++;
        x += w + colGap;
      }
      if (rowMaxH > 0) { rowHeights.push(rowMaxH); rowWidths.push(rowUsedW); }

      const totalRowsH = rowHeights.reduce((sum, h) => sum + h, 0);
      const interRowGaps = Math.max(0, rowHeights.length - 1) * rowGap;
      const contentWidth = (rowWidths.length ? Math.max(...rowWidths) : 0);
      const newW = contentWidth + SUB_H * 2;
      {
        const innerWidth = Math.max(1, num(((updated[i] as any)?.measured?.width ?? (updated[i] as any)?.style?.width ?? newW), newW) - SUB_H * 2);
        let cursor = 0;
        for (let r = 0, yRow = innerTop; r < rowHeights.length; r++) {
          const rowW = rowWidths[r] || 0;
          const startX = innerLeft + Math.floor(Math.max(0, (innerWidth - rowW)) / 2);
          let cxRow = startX;
          for (let k = 0; k < Math.min(maxCols, childIds.length - cursor); k++) {
            const cid = childIds[cursor + k];
            const idx = updated.findIndex(n => n.id === cid);
            if (idx < 0) continue;
            const w = widths[cursor + k];
            (updated[idx] as any).position = { x: cxRow, y: yRow } as any;
            cxRow += w + colGap;
          }
          yRow += rowHeights[r] + rowGap;
          cursor += Math.min(maxCols, childIds.length - cursor);
        }
      }
      const newH = totalRowsH + interRowGaps + TOP_PAD + Math.max(8, Math.floor(SUB_BOTTOM * 0.6));
      // 写回子域容器尺寸以匹配网格内容
      (updated[i] as any).style = { ...((updated[i] as any).style || {}), width: Math.round(newW), height: Math.round(newH) } as any;
      (updated[i] as any).measured = { width: Math.round(newW), height: Math.round(newH) } as any;
      updated[i].position = { x: num((updated[i] as any)?.position?.x, innerLeft - SUB_H), y: num((updated[i] as any)?.position?.y, innerTop - TOP_PAD) } as any;
      continue;
    }
    if (layout === 'vertical') {
      const availWVert = selfAvailW; // Math.max(1, (domainInnerW ?? selfAvailW));
      const domainCenterX: number | null = null;
      let cy = innerTop;
      for (const cid of childIds) {
        const childIdx = updated.findIndex(n => n.id === cid);
        if (childIdx < 0) continue;
        const child = updated[childIdx];
        const ch = getH(child);
        const cw = getW(child);
        const centeredX = domainCenterX != null
          ? Math.round(domainCenterX - cw / 2)
          : innerLeft + Math.floor(Math.max(0, (availWVert - cw)) / 2);
        const clampedX = Math.min(Math.max(centeredX, innerLeft), Math.max(innerLeft, innerRight - cw));
        (updated[childIdx] as any).position = { x: clampedX, y: cy } as any;
        cy += ch + V_GAP;
      }
      continue;
    }
    const totalW = childIds.reduce((s, cid, idx) => s + getW(idMap.get(cid) as ReactFlowNode) + (idx > 0 ? H_GAP : 0), 0);
    if (totalW <= availW) {
      const startX = innerLeft + Math.floor(Math.max(0, (availW - totalW)) / 2);
      let cx = startX;
      for (const cid of childIds) {
        const childIdx = updated.findIndex(n => n.id === cid);
        if (childIdx < 0) continue;
        const child = updated[childIdx];
        const cw = getW(child);
        const clampedX = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerRight - cw));
        (updated[childIdx] as any).position = { x: clampedX, y: innerTop } as any;
        cx = clampedX + cw + H_GAP;
      }
    } else {
      const newW = totalW + SUB_H * 2;
      const curW = num((((updated[i] as any)?.measured?.width ?? (updated[i] as any)?.style?.width ?? (updated[i] as any)?.width)), 0);
      const finalW = Math.max(curW, newW);
      ((updated[i] as any).style || (((updated[i] as any).style) = {})).width = Math.round(finalW);
      (updated[i] as any).measured = { width: Math.round(finalW), height: num((((updated[i] as any)?.measured?.height ?? (updated[i] as any)?.style?.height)), 0) } as any;
      const innerWidthAfter = Math.max(1, finalW - SUB_H * 2);
      const startX = innerLeft + Math.floor(Math.max(0, (innerWidthAfter - totalW)) / 2);
      let cx = startX;
      for (const cid of childIds) {
        const childIdx = updated.findIndex(n => n.id === cid);
        if (childIdx < 0) continue;
        const child = updated[childIdx];
        const cw = getW(child);
        const clampedX = Math.min(Math.max(cx, innerLeft), Math.max(innerLeft, innerLeft + innerWidthAfter - cw));
        (updated[childIdx] as any).position = { x: clampedX, y: innerTop } as any;
        cx = clampedX + cw + H_GAP;
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：子域容器左锚统一（严格版）
 * 目标：将同一域内所有可见 subGroup 的 position.x 统一到域内左锚（innerLeft + sideSafe），并同步 children 的 x 位移。
 * 区别：不再减去 subPadH，而是严格按照 nested box model 进行嵌套，保证 subGroup 位于 domain padding 内部。
 */

/**
 * 函数级注释：子域容器左锚统一（严格版）
 * 目标：将同一域内所有可见 subGroup 的 position.x 统一到域内左锚（innerLeft + sideSafe），并同步 children 的 x 位移。
 * 区别：不再减去 subPadH，而是严格按照 nested box model 进行嵌套，保证 subGroup 位于 domain padding 内部。
 */
export const unifySubGroupLeftAnchorsStrict = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const sideSafe = Math.max(0, num(cfgFull?.domain?.sideSafeGap, 8));

  const tgs = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const tg of tgs) {
    const dId = String((((tg as any).data?.domain || '')));
    if (!dId) continue;
    const tx = num(((tg as any)?.position?.x), 0);
    const innerLeft = tx + padH;

    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === dId && !(((n as any)?.data) || {})?.hidden);

    for (let i = 0; i < updated.length; i++) {
      const sg = updated[i];
      if (!sgs.some(n => n.id === sg.id)) continue;

      const oldX = num(((sg as any)?.position?.x), 0);
      const oldY = num(((sg as any)?.position?.y), 0);

      // 严格使用 innerLeft + sideSafe 作为起点，不回退 padding
      const targetX = innerLeft + sideSafe;

      const dxShift = Math.round(targetX - oldX);
      if (dxShift === 0) continue;

      (updated[i] as any).position = { x: targetX, y: oldY } as any;
      const children = Array.isArray((sg as any)?.data?.children) ? (sg as any).data.children as string[] : [];
      if (children.length) {
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          const cx = num(((child as any)?.position?.x), innerLeft);
          const cy = num(((child as any)?.position?.y), 0);
          (child as any).position = { x: Math.round(cx + dxShift), y: cy } as any;
        }
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：子域内部节点垂直居中
 * 目标：在每个 `subGroup` 的内容区内，计算所有 children 的整体高度，并将其垂直居中放置于各子域容器内；
 * 规则：
 * - 容器有效高度 = subGroup.height - titleHeight - padding；
 * - 内容高度 = children 的最大底 - 最小顶；
 * - 只有当内容高度 < 容器有效高度时，计算 offset 并平移。
 */

/**
 * 函数级注释：子域内部节点垂直居中
 * 目标：在每个 `subGroup` 的内容区内，计算所有 children 的整体高度，并将其垂直居中放置于各子域容器内；
 * 规则：
 * - 容器有效高度 = subGroup.height - titleHeight - padding；
 * - 内容高度 = children 的最大底 - 最小顶；
 * - 只有当内容高度 < 容器有效高度时，计算 offset 并平移。
 */
export const centerSubGroupChildrenVertically = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const cfgFull: any = diagramConfigManager.getConfig() || {};
  const layoutCfg: any = diagramConfigManager.getLayoutConfig() || {};

  const titleH = num(cfgFull?.subDomain?.title?.height ?? cfgFull?.subGroup?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT, 30);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical ?? cfgFull?.subGroup?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP, 16);
  const padTop = num(cfgFull?.subDomain?.padding?.top ?? cfgFull?.subGroup?.padding?.top ?? layoutCfg?.SUB_GROUP_PADDING?.V_TOP, 28);
  const padBottomSafe = num((cfgFull?.subDomain?.padding?.bottom ?? cfgFull?.subGroup?.padding?.bottom ?? layoutCfg?.SUB_GROUP_PADDING?.V_BOTTOM), 16);

  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n]));

  // 1. Group children by SubGroup
  const sgChildren = new Map<string, ReactFlowNode[]>(); // sgId -> children list
  for (const n of updated) {
    if (String(n.type || '') !== 'subGroup') continue;
    const childrenIds = Array.isArray((n as any)?.data?.children) ? (n as any).data.children as string[] : [];
    const kids: ReactFlowNode[] = [];
    for (const cid of childrenIds) {
      const k = idMap.get(cid);
      if (k) kids.push(k);
    }
    sgChildren.set(n.id, kids);
  }

  // 2. Process each SubGroup
  for (const n of updated) {
    if (String(n.type || '') !== 'subGroup') continue;
    const children = sgChildren.get(n.id) || [];
    if (!children.length) continue;

    const sy = num(((n as any)?.position?.y), 0);
    const sh = num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), 240);

    const innerTop = sy + titleH + titleV + padTop;
    // To be safer, we can treat the available height as sh - header - paddings
    const availH = sh - (titleH + titleV + padTop + padBottomSafe);

    if (availH <= 1) continue;

    // Calculate bounding box of children
    let minChildY = Infinity;
    let maxChildY = -Infinity;

    // Helper to get Y relative to global, but we modify position directly
    for (const c of children) {
      const cy = num(((c as any)?.position?.y), innerTop);
      const ch = num(((c as any)?.measured?.height ?? (c as any)?.style?.height ?? (c as any)?.height), 80);
      minChildY = Math.min(minChildY, cy);
      maxChildY = Math.max(maxChildY, cy + ch);
    }

    if (!isFinite(minChildY)) continue;

    const contentH = maxChildY - minChildY;
    if (contentH >= availH) continue; // Content taller than available space, cannot center (or fits exactly)

    const targetMinY = innerTop + (availH - contentH) / 2;
    const shiftY = Math.round(targetMinY - minChildY);

    if (Math.abs(shiftY) < 1) continue;



    // Apply shift
    for (const c of children) {
      const cx = num(((c as any)?.position?.x), 0);
      const cy = num(((c as any)?.position?.y), 0);
      (c as any).position = { x: cx, y: cy + shiftY } as any;
    }
  }

  return updated;
};

/**
 * 函数级注释：子域内单行水平布局（带垂直居中）
 * - 目的：将子域内节点按单行排列，支持水平间距与安全宽度；
 * - 特性：自动计算行最大高度，并将各节点相对于行垂直居中；
 * - 坐标：基于子域绝对坐标 (sg.x, sg.y) + 传入的 padding 偏移进行定位。
 */

/**
 * 函数级注释：子域内单行水平布局（带垂直居中）
 * - 目的：将子域内节点按单行排列，支持水平间距与安全宽度；
 * - 特性：自动计算行最大高度，并将各节点相对于行垂直居中；
 * - 坐标：基于子域绝对坐标 (sg.x, sg.y) + 传入的 padding 偏移进行定位。
 */
export const layoutSubGroupChildrenInRow = (
  children: ReactFlowNode[],
  sg: ReactFlowNode,
  layoutCfg: any,
  config: any
): void => {
  if (!children.length) return;

  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;

  // Constants
  const hGapEff = Math.max(12, Math.floor((layoutCfg?.NODE_H_GAP) || 120));
  const SAFE_W = Math.max(120, layoutCfg?.NODE_MIN_WIDTH || 120);
  const SAFE_H = Math.max(80, (config as any)?.node?.height || 80);

  // Offsets
  const padLeft = Math.max(24, config?.subDomain?.padding?.horizontal ?? config?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H ?? 24);
  const headerH = Math.max(30, config?.subDomain?.title?.height ?? config?.subGroup?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT ?? 30);
  const headerSafe = Math.max(16, config?.subDomain?.title?.padding?.vertical ?? config?.subGroup?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP ?? 16);
  const padTop = Math.max(28, config?.subDomain?.padding?.top ?? config?.subGroup?.padding?.top ?? layoutCfg?.SUB_GROUP_PADDING?.V_TOP ?? 28);

  const startX = num(((sg as any)?.position?.x), 0) + padLeft;
  const startY = num(((sg as any)?.position?.y), 0) + headerH + headerSafe + padTop;

  // Metrics Helpers
  const getMeasureW = (n: any) => {
    const val = n?.measured?.width ?? n?.style?.width ?? n?.width;
    return (typeof val === 'number' && val > 0) ? Math.max(val, SAFE_W) : SAFE_W;
  };
  const getMeasureH = (n: any) => {
    const val = n?.measured?.height ?? n?.style?.height ?? n?.height;
    return (typeof val === 'number' && val > 0) ? Math.max(val, SAFE_H) : SAFE_H;
  };

  // 1. Calc Row Height
  let rowMaxH = 0;
  for (const n of children) {
    rowMaxH = Math.max(rowMaxH, getMeasureH(n));
  }

  // 2. Position
  let cx = 0;
  for (const n of children) {
    const w = getMeasureW(n);
    const h = getMeasureH(n);
    const dy = Math.round((rowMaxH - h) / 2);
    (n as any).position = { x: startX + cx, y: startY + dy };
    cx += w + hGapEff;
  }
};

/**
 * 函数级注释：子域网格行内垂直居中
 * - 目的：针对 Grid/Centered 等多行布局，识别每一行并进行垂直居中对齐；
 * - 逻辑：按 Y 坐标聚类（容差 height/2），计算行 MaxH，调整 row 内节点 Y；
 */

/**
 * 函数级注释：子域网格行内垂直居中
 * - 目的：针对 Grid/Centered 等多行布局，识别每一行并进行垂直居中对齐；
 * - 逻辑：按 Y 坐标聚类（容差 height/2），计算行 MaxH，调整 row 内节点 Y；
 */
export const alignSubGroupGridRows = (children: ReactFlowNode[]): void => {
  if (children.length <= 1) return;

  const num = (v: any) => (typeof v === 'number' && isFinite(v)) ? v : 0;
  const sorted = children.slice().sort((a, b) => num((a as any).position?.y) - num((b as any).position?.y));

  // Group by rows
  const rows: ReactFlowNode[][] = [];
  let currentRow: ReactFlowNode[] = [];
  let currentRowY = num((sorted[0] as any).position?.y);

  for (const n of sorted) {
    const ny = num((n as any).position?.y);
    // Tolerance: if within 30px or overlapping significantly
    if (Math.abs(ny - currentRowY) < 30) {
      currentRow.push(n);
    } else {
      rows.push(currentRow);
      currentRow = [n];
      currentRowY = ny;
    }
  }
  if (currentRow.length) rows.push(currentRow);

  // Process each row
  for (const row of rows) {
    if (row.length === 0) continue;
    let maxH = 0;
    const getH = (n: any) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height));
    for (const n of row) maxH = Math.max(maxH, getH(n));

    if (maxH <= 0) continue;

    const rowTop = Math.min(...row.map(n => num((n as any).position?.y)));

    for (const n of row) {
      const h = getH(n) || 80;
      const dy = Math.round((maxH - h) / 2);
      // Align relative to rowTop
      const nx = num((n as any).position?.x);
      (n as any).position = { x: nx, y: rowTop + dy };
    }
  }
};

/**
 * 函数级注释：子域堆叠水平居中
 * - 目的：针对 Vertical 布局，计算堆叠最大宽度，将所有节点水平居中对齐；
 */

/**
 * 函数级注释：子域堆叠水平居中
 * - 目的：针对 Vertical 布局，计算堆叠最大宽度，将所有节点水平居中对齐；
 */
export const alignSubGroupStack = (children: ReactFlowNode[]): void => {
  if (children.length === 0) return;
  const num = (v: any) => (typeof v === 'number' && isFinite(v)) ? v : 0;

  // 1. Calc Max Width
  let maxW = 0;
  let minX = Infinity;
  const getW = (n: any) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width));

  for (const n of children) {
    maxW = Math.max(maxW, getW(n));
    minX = Math.min(minX, num((n as any).position?.x));
  }

  if (!isFinite(minX)) return;

  // 2. Align Center
  for (const n of children) {
    const w = getW(n) || 120;
    const dx = Math.round((maxW - w) / 2);
    const ny = num((n as any).position?.y);
    (n as any).position = { x: minX + dx, y: ny };
  }
};

/**
 * 函数级注释：子域流式布局（自动换行）
 * - 目的：针对 Grid/Centered 布局，实现基于最大宽度的自动换行；
 * - 逻辑：累加节点宽度，超过 MaxW 则换行；支持 Grid 模式下的对齐预处理；
 */

/**
 * 函数级注释：子域流式布局（自动换行）
 * - 目的：针对 Grid/Centered 布局，实现基于最大宽度的自动换行；
 * - 逻辑：累加节点宽度，超过 MaxW 则换行；支持 Grid 模式下的对齐预处理；
 */
export const layoutSubGroupChildrenFlow = (
  children: ReactFlowNode[],
  sg: ReactFlowNode,
  layoutCfg: any,
  config: any
): void => {
  if (!children.length) return;

  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;

  // Constants & Max Width
  const hGapEff = Math.max(12, Math.floor((layoutCfg?.NODE_H_GAP) || 120));
  const vGapEff = Math.max(12, Math.floor((layoutCfg?.NODE_V_GAP) || 80));
  const SAFE_W = Math.max(120, layoutCfg?.NODE_MIN_WIDTH || 120);

  // Default Max Width: try config, else default to ~800, ensure it is reasonable
  const maxRowWidth = num(config?.subGroup?.maxWidth ?? layoutCfg?.SUB_GROUP_MAX_WIDTH, 1000);

  // Offsets
  const padLeft = Math.max(24, config?.subDomain?.padding?.horizontal ?? config?.subGroup?.padding?.horizontal ?? layoutCfg?.SUB_GROUP_PADDING?.H ?? 24);
  const headerH = Math.max(30, config?.subDomain?.title?.height ?? config?.subGroup?.title?.height ?? layoutCfg?.SUB_GROUP_TITLE_HEIGHT ?? 30);
  const headerSafe = Math.max(16, config?.subDomain?.title?.padding?.vertical ?? config?.subGroup?.title?.padding?.vertical ?? layoutCfg?.SUB_GROUP_TITLE_SAFE_GAP ?? 16);
  const padTop = Math.max(28, config?.subDomain?.padding?.top ?? config?.subGroup?.padding?.top ?? layoutCfg?.SUB_GROUP_PADDING?.V_TOP ?? 28);

  const startX = num(((sg as any)?.position?.x), 0) + padLeft;
  const startY = num(((sg as any)?.position?.y), 0) + headerH + headerSafe + padTop;

  let cx = 0;
  let cy = 0;
  let rowMaxH = 0;
  let rowNodes: ReactFlowNode[] = [];

  const flushRow = () => {
    // Apply Y for current row (simple top-align relative to row, alignment helper will center laters)
    for (const n of rowNodes) {
      const nx = num((n as any).position?.x, 0);
      (n as any).position = { x: nx, y: startY + cy };
    }
    cy += rowMaxH + vGapEff;
    cx = 0;
    rowMaxH = 0;
    rowNodes = [];
  };

  const getMeasureW = (n: any) => {
    const val = n?.measured?.width ?? n?.style?.width ?? n?.width;
    return (typeof val === 'number' && val > 0) ? Math.max(val, SAFE_W) : SAFE_W;
  };
  const getMeasureH = (n: any) => {
    const val = n?.measured?.height ?? n?.style?.height ?? n?.height;
    return (typeof val === 'number' && val > 0) ? num(val, 80) : 80;
  };

  for (const n of children) {
    const w = getMeasureW(n);
    const h = getMeasureH(n);

    // Check wrap: if current item pushes beyond max, and it's not first item
    if (cx + w > maxRowWidth && cx > 0) {
      flushRow();
    }

    (n as any).position = { x: startX + cx, y: startY + cy }; // Temp Y
    rowNodes.push(n);
    rowMaxH = Math.max(rowMaxH, h);
    cx += w + hGapEff;
  }
  flushRow();
};


