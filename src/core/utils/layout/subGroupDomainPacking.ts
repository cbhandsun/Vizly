import type { Node as ReactFlowNode } from '@xyflow/react';
import { diagramConfigManager } from '../../config/DiagramConfig';
import { countRectOverlaps } from './geometryUtils';

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
