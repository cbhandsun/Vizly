import type { Node as ReactFlowNode } from '@xyflow/react';
import { diagramConfigManager } from '../../config/DiagramConfig';
import { enforceDomainContainerStrictContainment } from './domainContainers';
import { resolveSubGroupOverlapsWithConfig } from './subGroupOverlapResolution';
import {
  enforceSubGroupStrictContainmentByChildren,
  finalizeSubGroupHeightsByProjectionPreserveAnchor,
  finalizeSubGroupWidthsByProjectionPreserveAnchor,
  recomputeSubGroupContainersBasic,
  syncDagreChildPositions,
} from './subGroupLayoutConfiguredFacade';

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

export const strengthenSubGroupsInDomainWithGridStrict = (
  nodes: ReactFlowNode[],
  domainKey: string,
  hGap: number,
  vGap: number,
  iterations: number = 6
): ReactFlowNode[] => {
  const updated = nodes.map(n => ({ ...n }));
  const belongsToDomain = (n: ReactFlowNode) => {
    const d = String((((n as any)?.data || {}) as any)?.domain || '');
    return d === domainKey;
  };
  // 只重排该域内的子域。
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

export const packSubGroupsVerticallySymmetric = (
  nodes: ReactFlowNode[],
  gapVOverride?: number
): ReactFlowNode[] => {
  // 已回滚：不再执行垂直对称打包，返回原节点集合
  void gapVOverride;
  return nodes.map(n => ({ ...n }));
};

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

export const equalizeSubGroupVerticalMarginsByProjection = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  // 兼容阶段：不再进行上下留白投影校正，仅返回浅克隆。
  return nodes.map(n => ({ ...n }));
};

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
