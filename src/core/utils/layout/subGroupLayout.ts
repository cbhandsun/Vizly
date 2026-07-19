import type { Node as ReactFlowNode } from '@xyflow/react';
import { diagramConfigManager } from '../../config/DiagramConfig';

import { countRectOverlaps } from './geometryUtils';
import { enforceDomainContainerStrictContainment } from './domainContainers';
import { resolveSubGroupOverlapsWithConfig } from './subGroupOverlapResolution';
import {
  enforceGlobalNoOverlapStrict,
  layoutNodesByGhostDomainColumns,
  resolveAllNodeOverlapsGlobal,
  resolveFreeNodeOverlapsInDomain,
} from './subGroupGlobalLayout';
import {
  centerSubGroupChildrenHorizontally,
  centerSubGroupChildrenVertically,
  centerSubGroupsInDomain,
  enforceSubGroupChildrenLayoutStrict,
  enforceSubGroupStrictContainmentByChildren,
  enforceSubGroupTitleClearance,
  equalizeSubGroupMarginsByProjection,
  expandSubGroupContainersBySemantic,
  expandSubGroupsToDomainWidth,
  finalizeSubGroupHeightsByProjection,
  finalizeSubGroupHeightsByProjectionPreserveAnchor,
  finalizeSubGroupWidthsByProjectionPreserveAnchor,
  leftAlignSubGroupChildrenHorizontally,
  rankSnapDomainFreeNodes,
  rankSnapSubGroupChildren,
  recomputeSubGroupContainersBasic,
  reflowSubGroupChildrenDagre,
  resolveSubGroupChildrenOverlapWithD3Force,
  resolveSubGroupChildrenOverlapsStrict,
  resolveSubGroupsOverlapWithD3Force,
  scaleDomainContentToFitWidth,
  scaleDomainContentToFitWidthAll,
  snapFreeNodesToRowsInDomain,
  snapSubGroupChildrenToRowsStrict,
  splitDenseRowsInSubGroupsAdaptive,
  stackSubGroupsVertically,
  syncDagreChildPositions,
  unifySubGroupGapsInDomain,
  unifySubGroupHeightsByDomain,
  unifySubGroupLeftAnchors,
  unifySubGroupWidthsByDomain,
  writeSubGroupChildrenRelativeOffsets,
} from './subGroupLayoutConfiguredFacade';

/**
 * 函数级注释：全局业务节点重叠消解
 * 目标：在不显示域/子域容器的场景下，对全图范围内的普通业务节点执行两阶段避让，确保最小水平/垂直间距。
 * 策略：
 * - 排除分组类与 hidden 节点；
 * - 先按 Y 升序进行垂直避让，再按 X 升序进行水平避让；
 * - 间距使用 `NODE_V_GAP` / `NODE_H_GAP`，不对容器进行钳制。
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

/**
 * 函数级注释：高密子域的行拆分与自适应打包
 * 目标：针对内容密度较高的子域，自动将过长或过多节点的行拆分为两行以上，并按增大行/列间距进行打包，减小重叠与拥挤。
 */

/**
 * 函数级注释：高密子域的行拆分与自适应打包
 * 目标：针对内容密度较高的子域，自动将过长或过多节点的行拆分为两行以上，并按增大行/列间距进行打包，减小重叠与拥挤。
 */

/**
 * 函数级注释：子域容器语义归一化扩展
 * 基于标准化的 `subDomain` 键，计算该子域的全部业务节点的包围盒，并按“只扩展不收缩”的原则更新子域容器尺寸与位置。
 */

/**
 * 函数级注释：子域容器语义归一化扩展
 * 基于标准化的 `subDomain` 键，计算该子域的全部业务节点的包围盒，并按“只扩展不收缩”的原则更新子域容器尺寸与位置。
 */

/**
 * 函数级注释：子域容器最终非收缩包含（基于 children bbox）
 * 目标：以 children 的最小/最大投影为基准，确保子域容器至少包含成员的 bbox + 安全留白；只扩展不收缩。
 */

/**
 * 函数级注释：子域容器最终非收缩包含（基于 children bbox）
 * 目标：以 children 的最小/最大投影为基准，确保子域容器至少包含成员的 bbox + 安全留白；只扩展不收缩。
 */

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
): ReactFlowNode[] =>
  resolveSubGroupOverlapsWithConfig(
    nodes,
    gapHOverride,
    gapVOverride,
    diagramConfigManager.getLayoutConfig(),
    diagramConfigManager.getConfig(),
    {
      recomputeContainers: recomputeSubGroupContainersBasic,
      enforceDomainContainment: enforceDomainContainerStrictContainment,
    }
  );

/**
 * 函数级注释：子域容器尺寸回收（基础版）
 * 目标：基于 `subGroup.children` 的最终位置与尺寸，重算并写回子域容器的 `position/style/measured`，保证语义包含。
 */

/**
 * 函数级注释：子域容器尺寸回收（基础版）
 * 目标：基于 `subGroup.children` 的最终位置与尺寸，重算并写回子域容器的 `position/style/measured`，保证语义包含。
 */

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

/**
 * 函数级注释：同步 dagre 布局的子节点位置（基于相对位置）
 * - 目标：当子域容器移动后，使用 __dagreRel 相对位置重新计算子节点的绝对位置
 * - 输入：所有节点列表
 * - 输出：更新后的节点列表（子节点位置已同步）
 */

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

/**
 * 鍩熷鍣ㄩ珮搴︽渶缁堟姇褰卞洖鏀讹紙鍑芥暟绾ф敞閲婏級
 * 鐩爣锛氭寜鍩熷唴鎴愬憳锛堝瓙鍩熷鍣?+ 鏅€氳妭鐐癸級鐨勫瀭鐩存姇褰辩簿纭绠楀煙瀹瑰櫒楂樺害锛涗繚鐣欏煙宸?涓婇敋涓嶅彉锛屼粎鍐欏洖楂樺害銆?
 */

/**
 * 函数级注释：子域容器左锚统一（按域）
 * 目标：将同一域内所有可见 subGroup 的 `position.x` 统一到域内左锚（`innerLeft - subPadH`），并同步 children 的 x 位移。
*/

/**
 * 瀛愬煙瀹瑰櫒鍨傜洿鍫嗗彔锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鍚屼竴鍩熷唴锛屽皢鎵€鏈夊彲瑙佸瓙鍩熷鍣ㄦ寜 y 鍗囧簭浠庡煙鍐呴儴椤堕儴閿氱偣寮€濮嬩緷娆″瀭鐩村爢鍙狅紝闂磋窛鍙?NODE_V_GAP锛涘悓姝?children 鐨?y 骞崇Щ銆?
 */

/**
 * 瀛愬煙瀹瑰櫒鍨傜洿鍫嗗彔锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鍚屼竴鍩熷唴锛屽皢鎵€鏈夊彲瑙佸瓙鍩熷鍣ㄦ寜 y 鍗囧簭浠庡煙鍐呴儴椤堕儴閿氱偣寮€濮嬩緷娆″瀭鐩村爢鍙狅紝闂磋窛鍙?NODE_V_GAP锛涘悓姝?children 鐨?y 骞崇Щ銆?
 */

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

// 甯冨眬璁＄畻涓诲嚱鏁?

/**
 * 瀛愬煙瀹瑰櫒鍦ㄥ煙鍐呴儴姘村钩灞呬腑锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鍩熷涓庡瓙鍩熸渶缁堝搴︾‘瀹氬悗锛屼娇姣忎釜鍙瀛愬煙瀹瑰櫒鍦ㄦ墍灞炲煙鍐呴儴鍙敤瀹藉害鍐呮按骞冲眳涓紝淇濊瘉宸﹀彸鐣欑櫧瀵圭О锛涘悓姝?children 鐨?x 骞崇Щ锛屼笉鏀瑰彉 y銆?
 */

/**
 * 鍚屽煙瀛愬煙瀹瑰櫒瀹藉害缁熶竴锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬鍚屼竴鍩熷唴鎵€鏈夊彲瑙佺殑 `subGroup`锛屽皢鍏跺搴︾粺涓€涓鸿鍩熷唴鐨勬渶澶у瓙鍩熷搴︼紝浠呮洿鏂板搴︼紝涓嶆敼鍙橀珮搴︿笌浣嶇疆銆?
 */

/**
 * 鍚屽煙瀛愬煙瀹瑰櫒瀹藉害缁熶竴锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬鍚屼竴鍩熷唴鎵€鏈夊彲瑙佺殑 `subGroup`锛屽皢鍏跺搴︾粺涓€涓鸿鍩熷唴鐨勬渶澶у瓙鍩熷搴︼紝浠呮洿鏂板搴︼紝涓嶆敼鍙橀珮搴︿笌浣嶇疆銆?
 */

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


export {
  centerSubGroupChildrenHorizontally,
  centerSubGroupChildrenVertically,
  centerSubGroupsInDomain,
  enforceSubGroupChildrenLayoutStrict,
  enforceSubGroupStrictContainmentByChildren,
  enforceSubGroupTitleClearance,
  equalizeSubGroupMarginsByProjection,
  expandSubGroupContainersBySemantic,
  expandSubGroupsToDomainWidth,
  finalizeSubGroupHeightsByProjection,
  finalizeSubGroupHeightsByProjectionPreserveAnchor,
  finalizeSubGroupWidthsByProjectionPreserveAnchor,
  leftAlignSubGroupChildrenHorizontally,
  rankSnapDomainFreeNodes,
  rankSnapSubGroupChildren,
  recomputeSubGroupContainersBasic,
  reflowSubGroupChildrenDagre,
  resolveSubGroupChildrenOverlapWithD3Force,
  resolveSubGroupChildrenOverlapsStrict,
  resolveSubGroupsOverlapWithD3Force,
  scaleDomainContentToFitWidth,
  scaleDomainContentToFitWidthAll,
  snapFreeNodesToRowsInDomain,
  snapSubGroupChildrenToRowsStrict,
  splitDenseRowsInSubGroupsAdaptive,
  stackSubGroupsVertically,
  syncDagreChildPositions,
  unifySubGroupGapsInDomain,
  unifySubGroupHeightsByDomain,
  unifySubGroupLeftAnchors,
  unifySubGroupWidthsByDomain,
  writeSubGroupChildrenRelativeOffsets,
  enforceGlobalNoOverlapStrict,
  layoutNodesByGhostDomainColumns,
  resolveAllNodeOverlapsGlobal,
  resolveFreeNodeOverlapsInDomain,
};

export {
  packSubGroupChildrenRigid,
  reflowSubGroupChildrenGrid,
  reflowSubGroupChildrenVertical,
} from './subGroupChildPacking';

export {
  alignSubGroupGridRows,
  alignSubGroupStack,
  layoutSubGroupChildrenInRow,
  layoutSubGroupChildrenFlow,
} from './subGroupChildAlignment';


