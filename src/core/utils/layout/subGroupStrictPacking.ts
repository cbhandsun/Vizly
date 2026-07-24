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

type LayoutNode = ReactFlowNode<Record<string, unknown>>;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nodeWidth = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.width ?? node.style?.width ?? node.width, fallback);

const nodeHeight = (node: LayoutNode, fallback: number): number =>
  finiteNumber(node.measured?.height ?? node.style?.height ?? node.height, fallback);

const nodeX = (node: LayoutNode): number => finiteNumber(node.position.x, 0);
const nodeY = (node: LayoutNode): number => finiteNumber(node.position.y, 0);
const nodeDomain = (node: LayoutNode): string => String(node.data.domain ?? '');
const isHiddenNode = (node: LayoutNode): boolean => node.data.hidden === true;
const isGhostNode = (node: LayoutNode): boolean => node.data.ghost === true;

const nodeChildren = (node: LayoutNode): string[] =>
  Array.isArray(node.data.children)
    ? node.data.children.filter((child): child is string => typeof child === 'string')
    : [];

const setNodePosition = (node: LayoutNode | undefined, x: number, y: number): void => {
  if (node) node.position = { x, y };
};

export const packSubGroupChildrenGridStrict = (
  nodes: LayoutNode[]
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const subDomain = asRecord(cfgFull.subDomain);
  const subDomainPadding = asRecord(subDomain.padding);
  const subDomainTitle = asRecord(subDomain.title);
  const subDomainTitlePadding = asRecord(subDomainTitle.padding);
  const nodeConfig = asRecord(cfgFull.node);
  const layoutCfg = asRecord(diagramConfigManager.getLayoutConfig());
  const subGroupPadding = asRecord(layoutCfg.SUB_GROUP_PADDING);
  const H_GAP = finiteNumber(layoutCfg.NODE_H_GAP, 120);
  const V_GAP = finiteNumber(layoutCfg.NODE_V_GAP, 80);
  const SUB_H = finiteNumber(subDomainPadding.horizontal ?? subGroupPadding.H, 30);
  const titleH = finiteNumber(subDomainTitle.height ?? layoutCfg.SUB_GROUP_TITLE_HEIGHT, 28);
  const titleV = finiteNumber(
    subDomainTitlePadding.vertical ?? layoutCfg.SUB_GROUP_TITLE_SAFE_GAP,
    8
  );
  const DEFAULT_TOP_PAD = Math.max(
    titleH + titleV,
    finiteNumber(
      subDomainPadding.top ?? layoutCfg.SUB_GROUP_TITLE_CLEARANCE,
      titleH + titleV
    )
  );
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, LayoutNode>(updated.map(n => [n.id, n] as const));
  const getW = (node: LayoutNode) =>
    nodeWidth(node, finiteNumber(layoutCfg.NODE_MIN_WIDTH, 120));
  const getH = (node: LayoutNode) =>
    nodeHeight(node, finiteNumber(nodeConfig.height, 80));
  const sgs = updated.filter(n => String(n.type ?? '') === 'subGroup');
  for (const sg of sgs) {
    const w = nodeWidth(sg, 0);
    const innerLeft = nodeX(sg) + SUB_H;
    const innerRight = nodeX(sg) + Math.max(1, w) - SUB_H;
    const innerWidth = Math.max(1, innerRight - innerLeft);
    const ghostTopPad = Math.max(8, finiteNumber(layoutCfg.SUB_GROUP_GHOST_TOP_PAD, 12));
    const innerTop = nodeY(sg) + (isGhostNode(sg) ? ghostTopPad : DEFAULT_TOP_PAD);
    const chIds = nodeChildren(sg);
    const list = chIds.map(id => idMap.get(id)).filter((n): n is LayoutNode => n !== undefined);
    if (list.length <= 1) continue;
    const items = list.slice().sort((a, b) => {
      const saRaw = a.data.sequence ?? a.data.order;
      const sbRaw = b.data.sequence ?? b.data.order;
      const sa = typeof saRaw === 'number' ? saRaw : Number.parseFloat(String(saRaw ?? ''));
      const sb = typeof sbRaw === 'number' ? sbRaw : Number.parseFloat(String(sbRaw ?? ''));
      const hasA = Number.isFinite(sa);
      const hasB = Number.isFinite(sb);
      if (hasA && hasB) return sa - sb;
      if (hasA) return -1;
      if (hasB) return 1;
      // Fallback to original order (chIds order) instead of width
      return 0;
    });
    const rows: LayoutNode[][] = [];
    let currentRow: LayoutNode[] = [];
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
        setNodePosition(updated.find(node => node.id === n.id), Math.round(ix), Math.round(cy));
        cx = ix + w0 + Math.max(12, H_GAP);
        rowMaxH = Math.max(rowMaxH, getH(n));
      }
      cy += rowMaxH + Math.max(8, V_GAP);
    }
  }
  return updated;
};

export const enforceSubGroupNoOverlapStrict = (
  nodes: LayoutNode[],
  hGap?: number,
  vGap?: number,
  iterations: number = 3
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const subDomain = asRecord(cfgFull.subDomain);
  const subDomainPadding = asRecord(subDomain.padding);
  const subDomainTitle = asRecord(subDomain.title);
  const subDomainTitlePadding = asRecord(subDomainTitle.padding);
  const nodeConfig = asRecord(cfgFull.node);
  const layoutCfg = asRecord(diagramConfigManager.getLayoutConfig());
  const subGroupPadding = asRecord(layoutCfg.SUB_GROUP_PADDING);
  const H_G = finiteNumber(hGap, finiteNumber(layoutCfg.NODE_H_GAP, 120));
  const V_G = finiteNumber(vGap, finiteNumber(layoutCfg.NODE_V_GAP, 80));
  const SUB_H = finiteNumber(subDomainPadding.horizontal ?? subGroupPadding.H, 30);
  const titleH = finiteNumber(subDomainTitle.height ?? layoutCfg.SUB_GROUP_TITLE_HEIGHT, 28);
  const titleV = finiteNumber(
    subDomainTitlePadding.vertical ?? layoutCfg.SUB_GROUP_TITLE_SAFE_GAP,
    8
  );
  const DEFAULT_TOP_PAD = Math.max(
    titleH + titleV,
    finiteNumber(
      subDomainPadding.top ?? layoutCfg.SUB_GROUP_TITLE_CLEARANCE,
      titleH + titleV
    )
  );
  const SUB_BOTTOM = finiteNumber(subDomainPadding.bottom ?? subGroupPadding.V_BOTTOM, 20);
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, LayoutNode>(updated.map(n => [n.id, n] as const));
  const getW = (node: LayoutNode) =>
    nodeWidth(node, finiteNumber(layoutCfg.NODE_MIN_WIDTH, 120));
  const getH = (node: LayoutNode) =>
    nodeHeight(node, finiteNumber(nodeConfig.height, 80));
  const rect = (node: LayoutNode) => ({
    x: nodeX(node),
    y: nodeY(node),
    w: getW(node),
    h: getH(node)
  });

  const sgs = updated.filter(n => String(n.type ?? '') === 'subGroup');
  for (const sg of sgs) {
    const pos = rect(sg);
    const ghostTopPad = Math.max(8, finiteNumber(layoutCfg.SUB_GROUP_GHOST_TOP_PAD, 12));
    const inner = { left: pos.x + SUB_H, right: pos.x + Math.max(1, pos.w) - SUB_H, top: pos.y + (isGhostNode(sg) ? ghostTopPad : DEFAULT_TOP_PAD), bottom: pos.y + Math.max(1, pos.h) - SUB_BOTTOM };
    const list = nodeChildren(sg)
      .map(id => idMap.get(id))
      .filter((n): n is LayoutNode => n !== undefined);
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
            setNodePosition(a, Math.round(na), Math.round(ay));
            setNodePosition(b, Math.round(nb), Math.round(by));
          } else {
            const na = Math.max(inner.top, Math.min(inner.bottom - ra.h, ay - delta));
            const nb = Math.max(inner.top, Math.min(inner.bottom - rb.h, by + delta));
            setNodePosition(a, Math.round(ax), Math.round(na));
            setNodePosition(b, Math.round(bx), Math.round(nb));
          }
        }
      }
      // 钳制
      for (const n of list) {
        const r = rect(n);
        const nx = Math.min(Math.max(r.x, inner.left), Math.max(inner.left, inner.right - r.w));
        const ny = Math.min(Math.max(r.y, inner.top), Math.max(inner.top, inner.bottom - r.h));
        setNodePosition(n, Math.round(nx), Math.round(ny));
      }
    }
  }
  return updated;
};

export const strengthenSubGroupsInDomainWithGridStrict = (
  nodes: LayoutNode[],
  domainKey: string,
  hGap: number,
  vGap: number,
  iterations: number = 6
): LayoutNode[] => {
  const updated = nodes.map(n => ({ ...n }));
  const belongsToDomain = (node: LayoutNode) => nodeDomain(node) === domainKey;
  // 只重排该域内的子域。
  const sgs = updated.filter(n => String(n.type ?? '') === 'subGroup' && belongsToDomain(n));
  if (!sgs.length) return updated;
  let tmp = packSubGroupChildrenGridStrict(updated);
  tmp = enforceSubGroupNoOverlapStrict(tmp, hGap, vGap, Math.max(1, iterations));
  tmp = recomputeSubGroupContainersBasic(tmp);
  tmp = enforceSubGroupStrictContainmentByChildren(tmp);
  // After container size adjustments, synchronize child positions based on __dagreRel
  tmp = syncDagreChildPositions(tmp);
  tmp = finalizeSubGroupWidthsByProjectionPreserveAnchor(tmp);
  tmp = finalizeSubGroupHeightsByProjectionPreserveAnchor(tmp);
  return tmp;
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
  nodes: LayoutNode[]
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainConfig = asRecord(cfgFull.domain);
  const domainPadding = asRecord(domainConfig.padding);
  const subDomain = asRecord(cfgFull.subDomain);
  const subDomainPadding = asRecord(subDomain.padding);
  const layoutCfg = asRecord(diagramConfigManager.getLayoutConfig());
  const subGroupPadding = asRecord(layoutCfg.SUB_GROUP_PADDING);
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, LayoutNode>(updated.map(n => [n.id, n] as const));
  const padH = finiteNumber(domainPadding.horizontal, 24);
  const sideSafe = Math.max(0, finiteNumber(domainConfig.sideSafeGap, 8));
  const subPadHDefault = finiteNumber(
    subGroupPadding.H,
    Math.max(16, Math.floor(padH * 0.8))
  );
  const domains = updated.filter(n => String(n.type ?? '') === 'titleGroup');
  for (const dc of domains) {
    const dId = nodeDomain(dc);
    if (!dId) continue;
    const tx = nodeX(dc);
    const tw = nodeWidth(dc, 0);
    const innerLeft = tx + padH;
    const innerRight = tx + Math.max(1, tw) - padH;
    const sgs = updated.filter(
      n => String(n.type ?? '') === 'subGroup' && nodeDomain(n) === dId && !isHiddenNode(n)
    );
    for (let i = 0; i < updated.length; i++) {
      const sg = updated[i];
      if (!sgs.some(n => n.id === sg.id)) continue;
      const subPadH = finiteNumber(subDomainPadding.horizontal, subPadHDefault);
      const oldX = finiteNumber(sg.position.x, innerLeft - subPadH);
      // 严格嵌套模式：不再向左偏移内边距，而是严格从 sideSafe 开始
      const newX = Math.round(innerLeft + sideSafe);
      const keepH = nodeHeight(sg, 0);
      const contentW = Math.max(0, innerRight - innerLeft - 2 * sideSafe);
      // 严格嵌套模式：宽度仅为内容宽，不再加倍内边距
      const newW = Math.max(1, Math.round(contentW));
      const dx = newX - oldX;
      setNodePosition(sg, newX, nodeY(sg));
      sg.style = { ...sg.style, width: newW, height: keepH };
      sg.measured = { ...sg.measured, width: newW, height: keepH };
      const children = nodeChildren(sg);
      if (dx !== 0 && children.length) {
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          setNodePosition(child, Math.round(nodeX(child) + dx), nodeY(child));
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
  nodes: LayoutNode[]
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainConfig = asRecord(cfgFull.domain);
  const domainPadding = asRecord(domainConfig.padding);
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, LayoutNode>(updated.map(n => [n.id, n] as const));
  const padH = finiteNumber(domainPadding.horizontal, 24);
  const sideSafe = Math.max(0, finiteNumber(domainConfig.sideSafeGap, 8));

  const tgs = updated.filter(n => String(n.type ?? '') === 'titleGroup');
  for (const tg of tgs) {
    const dId = nodeDomain(tg);
    if (!dId) continue;
    const tx = nodeX(tg);
    const innerLeft = tx + padH;

    const sgs = updated.filter(
      n => String(n.type ?? '') === 'subGroup' && nodeDomain(n) === dId && !isHiddenNode(n)
    );

    for (let i = 0; i < updated.length; i++) {
      const sg = updated[i];
      if (!sgs.some(n => n.id === sg.id)) continue;

      const oldX = nodeX(sg);
      const oldY = nodeY(sg);

      // 严格使用 innerLeft + sideSafe 作为起点，不回退 padding
      const targetX = innerLeft + sideSafe;

      const dxShift = Math.round(targetX - oldX);
      if (dxShift === 0) continue;

      setNodePosition(updated[i], targetX, oldY);
      const children = nodeChildren(sg);
      if (children.length) {
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child) continue;
          const cx = finiteNumber(child.position.x, innerLeft);
          setNodePosition(child, Math.round(cx + dxShift), nodeY(child));
        }
      }
    }
  }
  return updated;
};
