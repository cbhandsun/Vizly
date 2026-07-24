import type { Node as ReactFlowNode } from '@xyflow/react';
import { diagramConfigManager } from '../../config/DiagramConfig';
import { countRectOverlaps } from './geometryUtils';

type LayoutNode = ReactFlowNode<Record<string, unknown>>;

const GROUP_NODE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const isGroupType = (type: unknown): boolean => GROUP_NODE_TYPES.has(String(type ?? ''));

const nodeDomain = (node: LayoutNode): string => String(node.data.domain ?? '').trim();

const isHiddenNode = (node: LayoutNode): boolean => node.data.hidden === true;

const nodeWidth = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.width ?? node.style?.width ?? node.width, fallback);

const nodeHeight = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.height ?? node.style?.height ?? node.height, fallback);

const nodeX = (node: LayoutNode): number => finiteNumber(node.position.x, 0);
const nodeY = (node: LayoutNode): number => finiteNumber(node.position.y, 0);

const setNodePosition = (node: LayoutNode | undefined, x: number, y: number): void => {
  if (node) node.position = { x, y };
};

export const packDomainNodesGrid = (
  nodes: LayoutNode[],
  domainKey: string,
  hGap: number,
  vGap: number
): LayoutNode[] => {
  const getW = (node: LayoutNode) => nodeWidth(node, 120);
  const getH = (node: LayoutNode) => nodeHeight(node, 80);
  const updated = nodes.map(n => ({ ...n }));
  const list = updated.filter(
    node => nodeDomain(node) === domainKey && !isGroupType(node.type) && !isHiddenNode(node)
  );
  if (list.length <= 1) return updated;
  const sorted = list.slice().sort((a, b) => nodeY(a) - nodeY(b));


  const maxW = Math.max(...list.map(getW));
  const maxH = Math.max(...list.map(getH));
  const cellW = Math.max(1, maxW + Math.max(12, hGap));
  const cellH = Math.max(1, maxH + Math.max(8, vGap));
  const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
  const rows = Math.max(1, Math.ceil(list.length / cols));
  const avgX = list.reduce((sum, node) => sum + nodeX(node), 0) / list.length;
  const avgY = list.reduce((sum, node) => sum + nodeY(node), 0) / list.length;
  const startX = Math.round(avgX - (cols * cellW) / 2);
  const startY = Math.round(Math.max(40, avgY - (rows * cellH) / 2));
  let i = 0;
  for (const n of sorted) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const nx = startX + c * cellW;
    const ny = startY + r * cellH;
    const target = updated.find(node => node.id === n.id);
    setNodePosition(target, nx, ny);
    i++;
  }
  return updated;
};

export const enforceDomainNoOverlapStrict = (
  nodes: LayoutNode[],
  domainKey: string,
  hGap: number,
  vGap: number,
  maxIterations: number = 12
): LayoutNode[] => {
  const updated = nodes.map(n => ({ ...n }));
  const domainNodes = updated.filter(
    node => nodeDomain(node) === domainKey && !isGroupType(node.type) && !isHiddenNode(node)
  );
  const getRect = (node: LayoutNode) => ({
    x: nodeX(node),
    y: nodeY(node),
    w: nodeWidth(node, 0),
    h: nodeHeight(node, 0),
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
        const target = updated.find(node => node.id === n.id);
        const px = target ? nodeX(target) : r.x;
        const py = target ? nodeY(target) : r.y;
        setNodePosition(target, Math.round(px), Math.round(py + shiftY));
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
        const target = updated.find(node => node.id === n.id);
        const px = target ? nodeX(target) : r.x;
        const py = target ? nodeY(target) : r.y;
        setNodePosition(target, Math.round(px + shiftX), Math.round(py));
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

export const strengthenDomainsAggressive = (
  nodes: LayoutNode[],
  domainKeys: string[],
  baseHGap: number,
  baseVGap: number
): LayoutNode[] => {
  const updated = nodes.map(n => ({ ...n }));
  for (const dk of domainKeys) {
    const hEff = Math.round(Math.max(12, baseHGap) * 1.2);
    const vEff = Math.round(Math.max(8, baseVGap) * 1.2);
    const afterGrid = packDomainNodesGrid(updated, dk, hEff, vEff);
    const afterStrict = enforceDomainNoOverlapStrict(afterGrid, dk, Math.round(hEff * 1.1), Math.round(vEff * 1.1), 14);
    for (let i = 0; i < updated.length; i++) {
      const a = updated[i];
      const b = afterStrict.find(node => node.id === a.id);
      if (b) setNodePosition(updated[i], b.position.x, b.position.y);
    }
  }
  return updated;
};

export const laneGridPackByDomain = (
  nodes: LayoutNode[],
  hGap?: number,
  vGap?: number,
  nodeLayoutName?: string
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainConfig = asRecord(cfgFull.domain);
  const domainPadding = asRecord(domainConfig.padding);
  const nodeConfig = asRecord(cfgFull.node);
  const layoutCfg = asRecord(diagramConfigManager.getLayoutConfig());
  const LEFT = 40;
  const TOP = 40;
  const COL_PAD = Math.max(12, finiteNumber(domainPadding.horizontal, 24));
  const COL_GAP = Math.max(24, finiteNumber(domainConfig.gap, 40));
  const nl = String(nodeLayoutName || '').trim().toLowerCase();
  const COL_GAP_MULT = nl.includes('vertical') ? 1.35 : (nl.includes('centered') ? 1.2 : (nl.includes('grid') ? 1.0 : 1.1));
  const COL_GAP_ADJ = Math.round(COL_GAP * COL_GAP_MULT);
  const updated = nodes.map(n => ({ ...n }));
  const biz = updated.filter(node => !isGroupType(node.type) && !isHiddenNode(node));
  if (biz.length <= 1) return updated;
  const getW = (node: LayoutNode) =>
    nodeWidth(node, finiteNumber(layoutCfg.NODE_MIN_WIDTH, 120));
  const getH = (node: LayoutNode) =>
    nodeHeight(node, finiteNumber(nodeConfig.height, 80));
  const groups = new Map<string, LayoutNode[]>();
  for (const n of biz) { const d = nodeDomain(n); const arr = groups.get(d) || []; arr.push(n); groups.set(d, arr); }
  const avgX = (arr: LayoutNode[]) =>
    arr.length ? arr.reduce((sum, node) => sum + nodeX(node), 0) / arr.length : 0;
  const orderedKeys = Array.from(groups.keys()).sort((a, b) => avgX(groups.get(a) || []) - avgX(groups.get(b) || []));
  let cx = LEFT;
  const halfIdx = Math.floor(orderedKeys.length / 2);
  for (let idxKey = 0; idxKey < orderedKeys.length; idxKey++) {
    const k = orderedKeys[idxKey];
    const arr = (groups.get(k) || []).slice();
    if (arr.length <= 1) {
      const node = arr[0];
      if (node) {
        setNodePosition(updated.find(candidate => candidate.id === node.id), cx, TOP);
        cx += Math.max(getW(node), 120) + COL_GAP;
      }
      continue;
    }
    // 构建域内层级基线
    const byCy = arr.slice().sort(
      (a, b) => (nodeY(a) + getH(a) / 2) - (nodeY(b) + getH(b) / 2)
    );
    const tol = Math.max(
      8,
      Math.floor(finiteNumber(vGap, finiteNumber(layoutCfg.NODE_V_GAP, 80)) * 0.35)
    );
    const ranks: LayoutNode[][] = [];
    for (const n of byCy) {
      const cy = nodeY(n) + getH(n) / 2; let placed = false;
      for (const r of ranks) { const avgY = r.reduce((s, m) => s + (nodeY(m) + getH(m) / 2), 0) / r.length; if (Math.abs(avgY - cy) <= tol) { r.push(n); placed = true; break; } }
      if (!placed) ranks.push([n]);
    }
    // 列宽取各层最大行宽；行内居中打包
    const colWParts: number[] = [];
    const layerWidths: number[] = [];
    for (const r of ranks) { const widths = r.map(getW); const rowW = widths.reduce((s, w, i) => s + w + (i > 0 ? Math.max(12, finiteNumber(hGap, finiteNumber(layoutCfg.NODE_H_GAP, 120))) : 0), 0); layerWidths.push(rowW); }
    const colW = Math.max(...layerWidths, 1) + COL_PAD * 2;
    let cy = TOP;
    const centerX = cx + Math.floor(colW / 2);
    for (const r of ranks) {
      const widths = r.map(getW);
      const rowW = widths.reduce((s, w, i) => s + w + (i > 0 ? Math.max(12, finiteNumber(hGap, finiteNumber(layoutCfg.NODE_H_GAP, 120))) : 0), 0);
      let rx = centerX - Math.floor(rowW / 2);
      let rowMaxH = 0;
      for (let i = 0; i < r.length; i++) { const n = r[i]; const w = widths[i]; setNodePosition(updated.find(node => node.id === n.id), Math.round(rx), Math.round(cy)); rx += w + Math.max(12, finiteNumber(hGap, finiteNumber(layoutCfg.NODE_H_GAP, 120))); rowMaxH = Math.max(rowMaxH, getH(n)); }
      cy += rowMaxH + Math.max(8, finiteNumber(vGap, finiteNumber(layoutCfg.NODE_V_GAP, 80)));
      colWParts.push(rowW);
    }
    const gapLocal = Math.max(24, Math.round(COL_GAP_ADJ * (idxKey >= halfIdx ? 1.2 : 1.0)));
    cx += Math.max(colW, 120) + gapLocal;
  }
  return updated;
};

export const packSubGroupsInDomain = (
  nodes: LayoutNode[]
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainConfig = asRecord(cfgFull.domain);
  const domainPadding = asRecord(domainConfig.padding);
  const domainTitle = asRecord(domainConfig.title);
  const domainTitlePadding = asRecord(domainTitle.padding);
  const fullLayoutConfig = asRecord(cfgFull.layout);
  const layoutCfg = asRecord(diagramConfigManager.getLayoutConfig());
  const strictElk = Boolean(
    layoutCfg.ELK_STRICT_MODE ?? fullLayoutConfig.ELK_STRICT_MODE
  );
  const padH = finiteNumber(domainPadding.horizontal, 24);
  const titleH = finiteNumber(domainTitle.height, 40);
  const titleV = finiteNumber(domainTitlePadding.vertical, 12);
  const titleSafe = finiteNumber(domainTitle.safeGap, 16);
  const hGapBase = finiteNumber(layoutCfg.NODE_H_GAP, 120);

  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, LayoutNode>(updated.map(n => [n.id, n] as const));
  const getW = (node: LayoutNode) => nodeWidth(node, 240);
  const getH = (node: LayoutNode) => nodeHeight(node, 120);

  const domainsSet = new Set<string>();
  for (const n of updated) {
    const d = nodeDomain(n);
    if (d) domainsSet.add(d);
  }
  const domains = Array.from(domainsSet);
  for (const d of domains) {
    const tg = updated.find(n => String(n.type ?? '') === 'titleGroup' && nodeDomain(n) === d);
    if (!tg) continue;
    const left = nodeX(tg) + padH;
    const innerTop = nodeY(tg) + titleH + titleV + titleSafe;
    const right = left + nodeWidth(tg, 0) - padH * 2;
    const sgs = updated
      .filter(n => {
        const tp = String(n.type ?? '');
        if (tp !== 'subGroup') return false;
        return nodeDomain(n) === d;
      })
      .slice().sort((a, b) => (nodeY(a) - nodeY(b)) || (nodeX(a) - nodeX(b)));

    // ✨ 整体居中逻辑: 先计算hGapEff以便计算总宽度
    const scaleH = finiteNumber(asRecord(fullLayoutConfig.autoGapScale).h, 1);
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
      const dx = Math.round(cursorX) - nodeX(sg);
      const dy = Math.round(rowTop) - nodeY(sg);
      setNodePosition(sg, Math.round(cursorX), Math.round(rowTop));
      const children = Array.isArray(sg.data.children)
        ? sg.data.children.filter((child): child is string => typeof child === 'string')
        : [];
      if (!strictElk) {
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          setNodePosition(child, nodeX(child) + dx, nodeY(child) + dy);
        }
      }
      cursorX += w + hGapEff;
      rowMaxH = Math.max(rowMaxH, h);
    }
  }
  return updated;
};

export const countSubGroupOverlapsByDomain = (
  nodes: LayoutNode[]
): number => {
  const getW = (node: LayoutNode) => nodeWidth(node, 240);
  const getH = (node: LayoutNode) => nodeHeight(node, 120);
  let total = 0;
  const domainsSet = new Set<string>();
  for (const n of nodes) {
    const d = nodeDomain(n);
    if (d) domainsSet.add(d);
  }
  const domains = Array.from(domainsSet);
  for (const d of domains) {
    const sgs = nodes.filter(n => String(n.type ?? '') === 'subGroup' && nodeDomain(n) === d);
    const rects = sgs.map(n => ({
      x: nodeX(n),
      y: nodeY(n),
      width: getW(n),
      height: getH(n)
    }));
    total += countRectOverlaps(rects);
  }
  return total;
};
