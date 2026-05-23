// @ts-nocheck

import { LayoutType, AlignmentType, LayoutOptions } from '../../types/layout';
import { GroupNodeData, StandardNodeData } from '../../models/DiagramModels';
import { Edge, Node as ReactFlowNode, XYPosition } from '@xyflow/react';
import { Position, Rectangle } from '../../types/common';
import { diagramConfigManager } from '../../components/config/DiagramConfig';
import { deriveDomainClassFromDomain } from '../domainKey';
import { LayoutOptimizer } from '../../components/layout/LayoutOptimizer';
import { forceSimulation, forceCollide, forceX, forceY } from 'd3-force';
import dagre from 'dagre';
import { safeLog } from '../consoleCleanup';

/**
 * @file 统一布局工具函数
 * @description 整合所有图表的布局计算逻辑，避免重复代码
 */

import { calculateBoundingBox, countRectOverlaps } from './geometryUtils';

/**
 * 应用域分组（支持白名单）
 * 函数级注释：当提供 `whitelist` 时，仅为白名单中的域创建 titleGroup，否则为全部域创建。
 */
export const applyDomainGrouping = (
  nodes: ReactFlowNode[],
  whitelist?: string[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const domainCfg = cfgFull?.domain || {};
  const padH = Number(domainCfg?.padding?.horizontal) || 24;
  const _padV = Number(domainCfg?.padding?.vertical) || 16;
  const titleH = Number(domainCfg?.title?.height) || 50;
  const titleVPad = Number(domainCfg?.title?.padding?.vertical) || 12;
  const titleSafe = Number(domainCfg?.title?.safeGap) || 16;
  const bottomSafe = Number((domainCfg as any)?.bottomSafeGap ?? (domainCfg as any)?.padding?.bottom ?? (titleVPad + titleSafe));
  const layoutCfgStrict = diagramConfigManager.getLayoutConfig() as any;
  const autoScaleHStrict = Number((cfgFull?.layout?.autoGapScale?.h)) || 1;
  const baseHGapStrict = Number((layoutCfgStrict?.NODE_H_GAP)) || 120;
  const _hGapEffStrict = Math.max(8, Math.floor(baseHGapStrict * Math.min(1.0, autoScaleHStrict)));
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const autoScaleH = Number((cfgFull?.layout?.autoGapScale?.h)) || 1;
  const baseHGap = Number((layoutCfg?.NODE_H_GAP)) || 120;
  const hGapEff = Math.max(8, Math.floor(baseHGap * Math.min(1.0, autoScaleH)));

  const existingTitleGroups = new Set(
    nodes
      .filter(n => String(n.type || '') === 'titleGroup')
      .map(n => String((n.data as any)?.domain || ''))
  );

  const groupedByDomain = nodes.reduce((acc, n) => {
    const d = (n.data as any)?.domain as string | undefined;
    if (!d) return acc;
    // 跳过容器类节点的自身参与计算，避免重复包含
    const t = String(n.type || '');
    if (new Set(['titleGroup', 'subGroup', 'group', 'domain']).has(t)) return acc;
    if (!acc[d]) acc[d] = [] as ReactFlowNode[];
    acc[d].push(n);
    return acc;
  }, {} as Record<string, ReactFlowNode[]>);

  if (!Object.keys(groupedByDomain).length) return nodes;

  const result: ReactFlowNode[] = [...nodes];

  for (const d of Object.keys(groupedByDomain)) {
    if (existingTitleGroups.has(d)) continue; // 宸插瓨鍦ㄥ垯璺宠繃
    const children = groupedByDomain[d];
    if (!children.length) continue;

    const bbox = calculateBoundingBox(children);
    // 域容器宽高：水平内边距 + 标题区（高度 + 垂直内边距 + 安全留白）+ 底部安全间距
    const width = bbox.width + padH * 2 + hGapEff;
    const height = bbox.height + titleH + titleVPad + titleSafe + bottomSafe;
    const x = bbox.x - padH;
    const y = bbox.y - (titleH + titleVPad + titleSafe);

    // 依据子节点的 domainClass 多数值，作为容器的 domainClass
    const childClasses = children
      .map(c => (c.data as any)?.domainClass)
      .filter(Boolean) as string[];
    const majorityClass = childClasses.length
      ? Array.from(childClasses.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1])[0][0]
      : undefined;

    // 尝试从第一个子节点获取 domainShape 配置（常由 orchestrator 注入到 metadata 或 data 中）
    const domainShape = (children[0].data as any)?.domainShape ?? (children[0].data as any)?.metadata?.domainShape;

    const node: ReactFlowNode<any> = {
      id: `titlegroup-${d}`,
      type: 'titleGroup',
      position: { x, y },
      style: { width, height, zIndex: -10 } as any,
      data: {
        // 显示标题使用 description，等同于域键
        description: d,
        domain: d,
        // 函数级注释：为域容器补充 domainClass，仅从子节点多数值获取
        domainClass: majorityClass,
        titleBarHeight: titleH,
        baseZIndex: -10,
        // 显示控制与计算分离：不论白名单如何，始终创建容器；若不在白名单则标记 hidden
        hidden: Array.isArray(whitelist) && whitelist.length > 0 ? !whitelist.includes(d) : false,
        shape: domainShape, // 浼犻€掑舰鐘跺睘鎬?
      },
      zIndex: -10,
      measured: { width, height } as any,
      draggable: false, // 锁定自动生成的域容器
    };

    result.push(node);
  }

  return result;
};

/**
 * 域容器非收缩包含校正（函数级注释）
 * 目标：在布局完成后，根据最终节点与子域容器的位置和尺寸，重新计算每个域容器（titleGroup）的包围框，
 *       确保“域统一包含其内部节点与子域容器”，并统一应用标题高度与安全留白配置。
 * 规则：
 * - 参与包围框计算的对象包括：业务节点（非分组类）与 type === 'subGroup' 的子域容器；
 * - 尺寸计算遵循 applyDomainGrouping 的公约：水平 padding、标题高度与安全留白、底部安全留白；
 * - 若某域没有可识别的内容（无显式节点/子域容器），则跳过该域的校正。
 */

/**
 * 域容器非收缩包含校正（函数级注释）
 * 目标：在布局完成后，根据最终节点与子域容器的位置和尺寸，重新计算每个域容器（titleGroup）的包围框，
 *       确保“域统一包含其内部节点与子域容器”，并统一应用标题高度与安全留白配置。
 * 规则：
 * - 参与包围框计算的对象包括：业务节点（非分组类）与 type === 'subGroup' 的子域容器；
 * - 尺寸计算遵循 applyDomainGrouping 的公约：水平 padding、标题高度与安全留白、底部安全留白；
 * - 若某域没有可识别的内容（无显式节点/子域容器），则跳过该域的校正。
 */
export const enforceDomainContainerStrictContainment = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const cfgFull = diagramConfigManager.getConfig() as any;
    const domainCfg = cfgFull?.domain || {};
  const padH = Number(domainCfg?.padding?.horizontal) || 24;
  const _padV = Number(domainCfg?.padding?.vertical) || 16;
  const titleH = Number(domainCfg?.title?.height) || 50;
  const titleVPad = Number(domainCfg?.title?.padding?.vertical) || 12;
  const titleSafe = Number(domainCfg?.title?.safeGap) || 16;
  const _bottomSafe = Number((domainCfg as any)?.bottomSafeGap ?? (domainCfg as any)?.padding?.bottom ?? (titleVPad + titleSafe));
  const layoutCfgStrict = diagramConfigManager.getLayoutConfig() as any;
  const autoScaleHStrict = Number((cfgFull?.layout?.autoGapScale?.h)) || 1;
  const baseHGapStrict = Number((layoutCfgStrict?.NODE_H_GAP)) || 120;
  const hGapEffStrict = Math.max(8, Math.floor(baseHGapStrict * Math.min(1.0, autoScaleHStrict)));
  const safeEdgeW = Math.max(6, Math.floor(hGapEffStrict * 0.25));

  const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));

  const updated: ReactFlowNode[] = nodes.map(n => ({ ...n }));
  const titleGroups = updated.filter(n => String(n.type || '') === 'titleGroup');
  if (!titleGroups.length) return updated;

  for (let i = 0; i < titleGroups.length; i++) {
    const tg = titleGroups[i];
    const domainKey = String(((tg.data as any)?.domain || ''));
    if (!domainKey) continue;
    const dk = String(domainKey).trim();
    const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
    const majorityDomainOfChildren = (sg: ReactFlowNode): string | undefined => {
      const children = Array.isArray((sg.data as any)?.children) ? ((sg.data as any).children as string[]) : [];
      if (!children.length) return undefined;
      const counts: Record<string, number> = {};
      for (const cid of children) {
        const c = idMap.get(cid);
        const dom = String(((c as any)?.data?.domain || '')).trim();
        if (!dom) continue;
        counts[dom] = (counts[dom] || 0) + 1;
      }
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      return entries.length ? entries[0][0] : undefined;
    };

    // 鏀堕泦璇ュ煙鐨勪笟鍔¤妭鐐逛笌瀛愬煙瀹瑰櫒
    const widthBySubOnly = Boolean(((diagramConfigManager.getConfig() as any)?.layout?.domainWidthBySubGroupsOnly !== false));
    const childrenCandidates = updated.filter(n => {
      const d1 = String(((n.data as any)?.domain || '')).trim();
      let belongs = !!dk && (d1 === dk);
      const typeStr = String(n.type || '');
      if (!belongs && typeStr === 'subGroup') {
        const maj = majorityDomainOfChildren(n);
        belongs = !!maj && String(maj).trim() === dk;
      }
      if (!belongs) return false;
      // 参与包围框计算的对象：业务节点与子域容器，排除域容器自身及其他分组类
      if (typeStr === 'titleGroup') return false;
      if (typeStr === 'subGroup') return true; // 子域容器参与包围框
      if (widthBySubOnly) return false; // 仅按子域计算宽度时，业务节点不参与
      const isHidden = !!(((n as any)?.data || {}) as any)?.hidden;
      if (isHidden) return false;
      return !isGroupType(typeStr);
    });
    if (!childrenCandidates.length) continue;

    const layoutCfgStrict = diagramConfigManager.getLayoutConfig() as any;
    const autoScaleHStrict = Number((cfgFull?.layout?.autoGapScale?.h)) || 1;
    const baseHGapStrict = Number((layoutCfgStrict?.NODE_H_GAP)) || 120;
    const _hGapEffStrict = Math.max(8, Math.floor(baseHGapStrict * Math.min(1.0, autoScaleHStrict)));
    const bbox = calculateBoundingBox(childrenCandidates);
    const contentHStrict = Math.max(0, bbox.height);
    const _childCountStrict = childrenCandidates.length;
    const bottomSafeEff = Number((domainCfg as any)?.bottomSafeGap ?? (titleVPad + titleSafe));
    const width = bbox.width + padH * 2 + safeEdgeW;
    const height = contentHStrict + titleH + titleVPad + titleSafe + bottomSafeEff;
    const x = bbox.x - padH;
    const y = bbox.y - (titleH + titleVPad + titleSafe);

    // 更新当前域容器的位置与尺寸
    const idx = updated.findIndex(n => n.id === tg.id);
    if (idx >= 0) {
      const old = updated[idx];
      // 依据该域的子内容（业务节点与子域容器）计算多数值 domainClass
      const childClasses = childrenCandidates
        .map(n => (n.data as any)?.domainClass)
        .filter(Boolean) as string[];
      const majorityClass = childClasses.length
        ? Array.from(childClasses.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1])[0][0]
        : undefined;

      const _curW = num(((old as any)?.measured?.width ?? (old as any)?.style?.width), 0);
      const _curH = num(((old as any)?.measured?.height ?? (old as any)?.style?.height), 0);
      const finalW = width; // 浠ユ渶缁堟姇褰变负鍑嗭紝鍏佽鏀剁缉
      const finalH = height;
      const anchoredX = num(((old as any)?.position?.x), x);
      const next: ReactFlowNode<any> = {
        ...old,
        position: { x: Math.round(anchoredX), y },
        style: { ...(old.style as any), width: finalW, height: finalH, zIndex: -10 } as any,
        data: { ...(old.data as any), domain: domainKey, domainClass: majorityClass ?? (old.data as any)?.domainClass, titleBarHeight: titleH, baseZIndex: -10 } as any,
        zIndex: -10,
        measured: { width: finalW, height: finalH } as any
      };
      updated[idx] = next;
    }
  }

  return updated;
};

/**
 * 函数级注释：域容器重叠消解
 * 目标：当生成多个 `titleGroup` 时，保证它们之间不重叠，并保持合理间距；必要时同步平移该域内的所有成员（子域容器与业务节点）。
 * 策略：
 * - 先按 Y 排序做垂直避让，再按 X 排序做水平避让；间距取 `domain.gap`；
 * - 支持锚定容器（`anchorLocked`）跳过水平避让，仅告警；
 * - 同步平移该域下所有成员，保持“语义包含”。
 * 兼容：若仅 0/1 容器或缺少尺寸，安全返回原节点集合。
*/
/**
 * 函数级注释：域容器重叠消解（加强版）
 * - 启用像素取整：对平移后的坐标进行 `Math.round`，消除子像素造成的视觉轻微模糊；
 * - 锚定容器：对 `anchorLocked` 的容器跳过水平避让；若检测到仍需水平避让，则打印警告定位。
 */

/**
 * 函数级注释：域容器重叠消解（加强版）
 * - 启用像素取整：对平移后的坐标进行 `Math.round`，消除子像素造成的视觉轻微模糊；
 * - 锚定容器：对 `anchorLocked` 的容器跳过水平避让；若检测到仍需水平避让，则打印警告定位。
 */
export const resolveDomainContainerOverlaps = (
  nodes: ReactFlowNode[],
  gapOverride?: number
): ReactFlowNode[] => {
  const cfg = diagramConfigManager.getConfig() as any;
  const domainGap = typeof gapOverride === 'number' && isFinite(gapOverride)
    ? (gapOverride as number)
    : (Number(cfg?.domain?.gap) || 48);

  const containers = nodes.filter(n => String(n.type || '') === 'titleGroup');
  const isLocked = (n: ReactFlowNode) => Boolean(((n.data as any)?.anchorLocked));
  if (containers.length <= 1) return nodes;

  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
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

  // 复制数组以返回新引用，同时按需更新节点对象
  const updated = nodes.map(n => ({ ...n }));

  // 辅助：按域同步平移所有节点（含子容器和业务节点）
  const translateDomain = (domain: string, dx: number, dy: number) => {
    for (let i = 0; i < updated.length; i++) {
      const n = updated[i];
      const d = String(((n.data as any)?.domain || ''));
      if (d === domain) {
        const px = num(n.position?.x, 0);
        const py = num(n.position?.y, 0);
        const newPos = { x: Math.round(px + dx), y: Math.round(py + dy) } as XYPosition;
        updated[i] = { ...n, position: newPos } as any;
        // 若节点数据中存在 position 字段，顺带修正（兼容旧约定）
        const nd: any = { ...(n.data || {}) };
        if (nd.position && typeof nd.position === 'object') {
          nd.position = { x: Math.round(num(nd.position.x, 0) + dx), y: Math.round(num(nd.position.y, 0) + dy) };
          (updated[i] as any).data = nd;
        }
      }
    }
    return updated;
  };

  // 1) 垂直方向重叠消解：按 y 升序设置
  const byY = containers.slice().sort((a, b) => getRect(a).y - getRect(b).y);
  const placedY: Array<{ domain: string; rect: { x: number; y: number; w: number; h: number } }> = [];
  for (const c of byY) {
    const d = String(((c.data as any)?.domain || ''));
    const r = getRect(c);
    let shiftY = 0;
    for (const p of placedY) {
      // 仅当水平范围也有重叠时才进行垂直避让（避免不必要移动）
      const horizOverlap = !(r.x + r.w <= p.rect.x || p.rect.x + p.rect.w <= r.x);
      if (!horizOverlap) continue;
      const requiredTop = p.rect.y + p.rect.h + domainGap;
      if (r.y + shiftY < requiredTop) {
        shiftY = Math.max(shiftY, requiredTop - r.y);
      }
    }
    if (shiftY > 0) translateDomain(d, 0, shiftY);
    // 鍐欏叆鏀剧疆鍚庣殑鐭╁舰
    const finalRect = { ...r, y: r.y + shiftY };
    placedY.push({ domain: d, rect: finalRect });
  }

  // 2) 水平方向重叠消解：按 x 升序设置（用于左右分布场景为主）
  const containersAfterY = updated.filter(n => String(n.type || '') === 'titleGroup');
  const byX = containersAfterY.slice().sort((a, b) => getRect(a).x - getRect(b).x);
  const placedX: Array<{ domain: string; rect: { x: number; y: number; w: number; h: number } }> = [];
  for (const c of byX) {
    const d = String(((c.data as any)?.domain || ''));
    const r = getRect(c);
    let shiftX = 0;
    if (isLocked(c)) {
      // 锚定左边界：跳过水平避让，仅保留垂直避让；如检测到需要水平避让，则记录日志
      for (const p of placedX) {
        const vertOverlap = !(r.y + r.h <= p.rect.y || p.rect.y + p.rect.h <= r.y);
        if (!vertOverlap) continue;
        const requiredLeft = p.rect.x + p.rect.w + domainGap;
        if (r.x < requiredLeft) {
          // log overlap
        }
      }
      placedX.push({ domain: d, rect: r });
      continue;
    }
    for (const p of placedX) {
      const vertOverlap = !(r.y + r.h <= p.rect.y || p.rect.y + p.rect.h <= r.y);
      if (!vertOverlap) continue;
      const requiredLeft = p.rect.x + p.rect.w + domainGap;
      if (r.x + shiftX < requiredLeft) {
        shiftX = Math.max(shiftX, requiredLeft - r.x);
      }
    }
    if (shiftX > 0) translateDomain(d, shiftX, 0);
    const finalRect = { ...r, x: Math.round(r.x + shiftX) };
    placedX.push({ domain: d, rect: finalRect });
  }

  // 最后安全检查：若仍有重叠，提醒迭代至无重叠（有上限）
  const finals = updated.filter(n => String(n.type || '') === 'titleGroup');
  let iteration = 0;
  const maxIter = 6;
  const rectOf = (n: ReactFlowNode) => getRect(n);
  const idxOf = (id: string) => updated.findIndex(n => n.id === id);
  while (iteration < maxIter) {
    let hasOverlap = false;
    for (let i = 0; i < finals.length; i++) {
      for (let j = i + 1; j < finals.length; j++) {
        const a = rectOf(finals[i]);
        const b = rectOf(finals[j]);
        if (intersects(a, b)) {
          hasOverlap = true;
          const ad = String(((finals[i].data as any)?.domain || ''));
          if (!isLocked(finals[i])) {
            // 小步平移增强：避免剧烈但更有效的避让；锚定时仅告警重叠，不做水平位移
            translateDomain(ad, Math.ceil(domainGap * 0.35), 0);
          }
        }
      }
    }
    if (!hasOverlap) break;
    // 閲嶆柊鑾峰彇 finals 寮曠敤涓庝綅缃?
    for (let k = 0; k < finals.length; k++) {
      const idx = idxOf(finals[k].id);
      if (idx >= 0) finals[k] = updated[idx];
    }
    iteration++;
  }

  return updated;
};
/**
 * 函数级注释：同域内子域容器重叠消解
 * 目标：在同一域内，确保所有 `subGroup` 容器互不重叠，并保持合理间距。
 * 策略：
 * - 垂直避让：按 y 升序，仅在水平投影有交叠时进行；行距取 `NODE_V_GAP`；
 * - 水平避让：按 x 升序，仅在垂直投影有交叠时进行；列距取 `NODE_H_GAP`；
 * - 发生位移时同步平移容器的 children，保持“语义包含”。
 */

/**
 * 函数级注释：域内块级密度处理
 * 目标：在同一域内，将子域容器与普通业务节点视为块，并按最小块间距进行收敛，减少不必要留白。
 */
export const compactDomainBlocks = (
  nodes: ReactFlowNode[],
  nodeHGap?: number,
  nodeVGap?: number
): ReactFlowNode[] => {
  const cfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const vGap = num(nodeVGap, num(cfg?.NODE_V_GAP, 80));
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n.style as any)?.height), 120);
  const getY = (n: ReactFlowNode) => num(((n.position as any)?.y), 0);
  const setY = (n: ReactFlowNode, y: number) => { (n as any).position = { x: num(((n.position as any)?.x), 0), y } as any; };

  const domains = Array.from(new Set(updated.map(n => String(((n.data as any)?.domain || ''))).filter(Boolean)));
  for (const d of domains) {
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === d);
    const leftovers = updated.filter(n => !EXCLUDE.has(String(n.type || '')) && String(((n.data as any)?.domain || '')) === d && !sgs.some(sg => Array.isArray((sg.data as any)?.children) && ((sg.data as any).children as string[]).includes(n.id)));
    type Block = { ref?: ReactFlowNode; top: number; bottom: number; applyDy: (dy: number) => void };
    const blocks: Block[] = [];
    for (const sg of sgs) {
      const top = getY(sg);
      const h = getH(sg);
      const children = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
      blocks.push({
        ref: sg,
        top,
        bottom: top + h,
        applyDy: (dy: number) => {
          setY(sg, top + dy);
          for (const cid of children) {
            const child = idMap.get(cid);
            if (!child || EXCLUDE.has(String(child.type || ''))) continue;
            setY(child, getY(child) + dy);
          }
        }
      });
    }
    if (leftovers.length) {
      const minYLeft = Math.min(...leftovers.map(n => getY(n)));
      const maxYLeft = Math.max(...leftovers.map(n => getY(n) + getH(n)));
      blocks.push({ top: isFinite(minYLeft) ? minYLeft : 0, bottom: isFinite(maxYLeft) ? maxYLeft : 1, applyDy: (dy: number) => { for (const n of leftovers) setY(n, getY(n) + dy); } });
    }
    blocks.sort((a, b) => a.top - b.top);
    for (let i = 1; i < blocks.length; i++) {
      const prev = blocks[i - 1];
      const curr = blocks[i];
      const desiredTop = prev.bottom + vGap;
      const gap = curr.top - desiredTop;
      if (gap > 0) {
        curr.applyDy(-gap);
        curr.top -= gap;
        curr.bottom -= gap;
      }
    }
  }
  return updated;
};

/**
 * 函数级注释：上方相邻块向上收拢
 * 目标：在同一域内，若子域块的子节点存在来自上方节点的相邻关系，则将该子域整体上收至“上邻节点底部 + vGap”，在不与上一块相邻且不越过域标题安全区前提下。
 */

/**
 * 函数级注释：上方相邻块向上收拢
 * 目标：在同一域内，若子域块的子节点存在来自上方节点的相邻关系，则将该子域整体上收至“上邻节点底部 + vGap”，在不与上一块相邻且不越过域标题安全区前提下。
 */
export const pullUpSubGroupsByIncomingEdges = (
  nodes: ReactFlowNode[],
  edges: Edge[],
  nodeVGap?: number
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const vGap = num(nodeVGap, num(layoutCfg?.NODE_V_GAP, 80));
  const titleH = num(cfgFull?.domain?.title?.height, 40);
  const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
  const _sideSafe = Math.max(12, num(cfgFull?.domain?.sideSafeGap, 8));

  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n.style as any)?.height), 120);
  const getX = (n: ReactFlowNode) => num(((n.position as any)?.x), 0);
  const getY = (n: ReactFlowNode) => num(((n.position as any)?.y), 0);
  const setY = (n: ReactFlowNode, y: number) => { (n as any).position = { x: getX(n), y } as any; };

  const domains = Array.from(new Set(updated.map(n => String(((n.data as any)?.domain || ''))).filter(Boolean)));
  for (const d of domains) {
    const tg = updated.find(n => String(n.type || '') === 'titleGroup' && String(((n.data as any)?.domain || '')) === d);
    const domainTopSafe = tg ? (getY(tg) + titleH + titleV + titleSafe) : 0;
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && String(((n.data as any)?.domain || '')) === d);
    type Block = { ref?: ReactFlowNode; top: number; bottom: number };
    const blocks: Block[] = [];
    for (const sg of sgs) { blocks.push({ ref: sg, top: getY(sg), bottom: getY(sg) + getH(sg) }); }
    const leftovers = updated.filter(n => !EXCLUDE.has(String(n.type || '')) && String(((n.data as any)?.domain || '')) === d && !sgs.some(sg => Array.isArray((sg.data as any)?.children) && ((sg.data as any).children as string[]).includes(n.id)));
    if (leftovers.length) {
      const minYLeft = Math.min(...leftovers.map(n => getY(n)));
      const maxYLeft = Math.max(...leftovers.map(n => getY(n) + getH(n)));
      blocks.push({ top: isFinite(minYLeft) ? minYLeft : 0, bottom: isFinite(maxYLeft) ? maxYLeft : 1 });
    }
    blocks.sort((a, b) => a.top - b.top);
    const childrenBySub = new Map<string, string[]>();
    for (const sg of sgs) childrenBySub.set(sg.id, Array.isArray((sg.data as any)?.children) ? ((sg.data as any).children as string[]) : []);
    for (let i = 0; i < blocks.length; i++) {
      const blk = blocks[i];
      const sg = blk.ref;
      if (!sg) continue;
      const children = childrenBySub.get(sg.id) || [];
      let upstreamBottom = -Infinity;
      for (const e of edges) {
        if (!children.includes(e.target)) continue;
        const src = idMap.get(e.source);
        if (!src) continue;
        const sY = getY(src);
        const sBottom = sY + getH(src);
        if (sBottom <= blk.top) upstreamBottom = Math.max(upstreamBottom, sBottom);
      }
      if (upstreamBottom === -Infinity) continue;
      const prevBottom = (i > 0) ? blocks[i - 1].bottom : domainTopSafe;
      const desiredTop = Math.max(upstreamBottom + vGap, prevBottom + vGap, domainTopSafe);
      const gap = blk.top - desiredTop;
      if (gap > 0) {
        setY(sg, getY(sg) - gap);
        for (const cid of children) {
          const child = idMap.get(cid);
          if (!child || EXCLUDE.has(String(child.type || ''))) continue;
          setY(child, getY(child) - gap);
        }
        blk.top = getY(sg);
        blk.bottom = getY(sg) + getH(sg);
      }
    }
  }
  return updated;
};



/**
 * 函数级注释：补齐子域容器的 domain
 * 目标：若 `subGroup.data.domain` 缺失，则以其 children 的多数 `domain` 作为归属，便于同域聚类。
 * 注意：不修改任何业务节点的 domain，仅回填子域容器的域字段。
 */

/**
 * 函数级注释：统计域容器之间的重叠数量
 */
export const countDomainContainerOverlaps = (
  nodes: ReactFlowNode[]
): number => {
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const tgs = nodes.filter(n => String(n.type || '') === 'titleGroup');
  const rects = tgs.map(n => ({
    x: num(((n as any)?.position?.x), 0),
    y: num(((n as any)?.position?.y), 0),
    width: num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 0),
    height: num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 0)
  }));
  return countRectOverlaps(rects);
};

/**
 * 函数级注释：统计域内业务节点之间的重叠数量
 */

/**
 * 鍩熷鍣ㄥ搴︽渶缁堟姇褰卞洖鏀讹紙鍑芥暟绾ф敞閲婏級
 * 鐩爣锛氭寜鍩熷唴鎴愬憳锛堝瓙鍩熷鍣?+ 鏅€氳妭鐐癸級鐨勬按骞虫姇褰辩簿纭绠楀煙瀹瑰櫒瀹藉害锛涗繚鐣欏煙宸﹂敋涓嶅彉锛屼粎鍐欏洖瀹藉害銆?
 */
export const finalizeDomainWidthsByProjection = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
    const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const sideSafe = Math.max(12, num(cfgFull?.domain?.sideSafeGap, 8));
  const _subPadH = num((cfgFull?.subDomain?.padding?.horizontal ?? cfgFull?.subGroup?.padding?.horizontal ?? (diagramConfigManager.getLayoutConfig() as any)?.SUB_GROUP_PADDING?.H), 30);
  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  const widthBySubOnly = Boolean(((diagramConfigManager.getConfig() as any)?.layout?.domainWidthBySubGroupsOnly !== false));
  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const xOld = num(((dc as any)?.position?.x), 0);
    const innerLeftOld = xOld + padH;
    let minLeft = Infinity;
    let maxRight = -Infinity;
    for (const n of updated) {
      const tp = String(n.type || '');
      const belongs = String(((n.data as any)?.domain || '')) === dId;
      if (!belongs || tp === 'titleGroup') continue;
      if (widthBySubOnly && tp !== 'subGroup') continue;
      const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
      if (hidden) continue;
      const nx = num(((n as any)?.position?.x), innerLeftOld);
      const nw = num((((n as any)?.measured?.width ?? (n as any)?.style?.width)), 0);
      const left = nx;
      const right = nx + nw;
      minLeft = Math.min(minLeft, left);
      maxRight = Math.max(maxRight, right);
    }
    if (isFinite(maxRight) && isFinite(minLeft)) {
      const contentW = Math.max(0, maxRight - minLeft);
      const newW = contentW + padH * 2 + sideSafe * 2;
      ((dc as any).style || ((dc as any).style = {})).width = newW;
      (dc as any).measured = { width: newW, height: num((((dc as any)?.measured?.height ?? (dc as any)?.style?.height)), 0) } as any;
      (dc as any).width = newW;
      // 保持左锚：不更新 position.x
    }
  }
  return updated;
};

/**
 * 函数级注释：子域绑定一致性审计与修复
 * - 目标：保证每个业务节点至少绑定一个子域，且子域的 children 集合完整且一致；
 * - 规则：按定义键优先级进行绑定（subDomain > metadata.subDomain > description），以匹配同域；
 * - 行为：为每个 subGroup 重建 children 集合（去重），并移除重复绑定；返回新的节点集合。
 */

/**
 * 鍩熷鍣ㄩ珮搴︽渶缁堟姇褰卞洖鏀讹紙鍑芥暟绾ф敞閲婏級
 * 鐩爣锛氭寜鍩熷唴鎴愬憳锛堝瓙鍩熷鍣?+ 鏅€氳妭鐐癸級鐨勫瀭鐩存姇褰辩簿纭绠楀煙瀹瑰櫒楂樺害锛涗繚鐣欏煙宸?涓婇敋涓嶅彉锛屼粎鍐欏洖楂樺害銆?
 */
export const finalizeDomainHeightsByProjection = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const padH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const titleH = num(cfgFull?.domain?.title?.height, 40);
  const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
  const bottomSafe = num((cfgFull?.domain as any)?.bottomSafeGap ?? (cfgFull?.domain as any)?.padding?.bottom ?? padH, padH);
  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const _x = num(((dc as any)?.position?.x), 0);
    const y = num(((dc as any)?.position?.y), 0);
    const innerTop = y + titleH + titleV + titleSafe;
    let maxBottom = innerTop;
    for (const n of updated) {
      const tp = String(n.type || '');
      const belongs = String(((n.data as any)?.domain || '')) === dId;
      if (!belongs || tp === 'titleGroup') continue;
      const hidden = !!((((n as any)?.data) || {}) as any)?.hidden;
      if (hidden) continue;
      const ny = num(((n as any)?.position?.y), innerTop);
      const nh = num((((n as any)?.measured?.height ?? (n as any)?.style?.height)), 80);
      maxBottom = Math.max(maxBottom, ny + nh);
    }
    const contentH = Math.max(0, maxBottom - innerTop);
    const keepW = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
    const newH = titleH + titleV + titleSafe + contentH + bottomSafe;
    (dc as any).style = { ...((dc as any).style || {}), width: keepW, height: newH } as any;
    (dc as any).measured = { width: keepW, height: newH } as any;
    (dc as any).height = newH;
  }
  return updated;
};

/**
 * 鍩熷鍣ㄩ珮搴﹀畨鍏ㄩ挸鍒讹細淇濊瘉鍩熼珮搴︿笉浣庝簬鍚屽煙瀛愬煙瀹瑰櫒鐨勬渶澶ч珮搴︼紙鍚爣棰樺尯/搴曢儴瀹夊叏鍖猴級銆?
 */

/**
 * 鍩熷鍣ㄩ珮搴﹀畨鍏ㄩ挸鍒讹細淇濊瘉鍩熼珮搴︿笉浣庝簬鍚屽煙瀛愬煙瀹瑰櫒鐨勬渶澶ч珮搴︼紙鍚爣棰樺尯/搴曢儴瀹夊叏鍖猴級銆?
 */
export const clampDomainHeightsToSubGroups = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const updated = nodes.map(n => ({ ...n }));
  const titleH = num(cfgFull?.domain?.title?.height, 40);
  const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
  const bottomSafe = num((cfgFull?.domain as any)?.bottomSafeGap ?? (cfgFull?.domain as any)?.padding?.bottom ?? 24, 24);
  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const dc of domains) {
    const dId = String((((dc as any).data?.domain || '')));
    if (!dId) continue;
    const dy = num(((dc as any)?.position?.y), 0);
    const innerTop = dy + titleH + titleV + titleSafe;
    let maxBottom = innerTop;
    for (const n of updated) {
      const nd = String(((n.data as any)?.domain || ''));
      const tp = String(n.type || '');
      if (nd !== dId || tp !== 'subGroup') continue;
      const ny = num(((n as any)?.position?.y), innerTop - 1);
      const nh = num((((n as any)?.measured?.height ?? (n as any)?.style?.height)), 0);
      maxBottom = Math.max(maxBottom, ny + nh);
    }
    const contentH = Math.max(0, maxBottom - innerTop);
    const requiredH = titleH + titleV + titleSafe + contentH + bottomSafe;
    const keepW = num((((dc as any)?.measured?.width ?? (dc as any)?.style?.width)), 0);
    const curH = num((((dc as any)?.measured?.height ?? (dc as any)?.style?.height)), requiredH);
    const finalH = Math.max(curH, requiredH);
    (dc as any).style = { ...((dc as any).style || {}), width: keepW, height: finalH } as any;
    (dc as any).measured = { width: keepW, height: finalH } as any;
    (dc as any).height = finalH;
  }
  return updated;
};

/**
 * 函数级注释：子域容器左锚统一（按域）
 * 目标：将同一域内所有可见 subGroup 的 `position.x` 统一到域内左锚（`innerLeft - subPadH`），并同步 children 的 x 位移。
*/

/**
 * 函数级注释：子域/域容器内部节点边界钳制
 * 目的：当节点布局变化后，确保所有子节点完整纳入其所属容器（subGroup/titleGroup）的内部边界，避免“溢出容器”。
 * 规则：
 * - 子域容器（subGroup）：左右使用 `subDomain.padding.horizontal`，顶部使用 `ensureTitleClearance` 后的 top（取 max(配置 top, 标题清空高度)），底部使用 `subDomain.padding.bottom`；
 * - 域容器（titleGroup）：左右使用 `domain.padding.horizontal`，顶部使用 `title.height + title.padding.vertical + title.safeGap`，底部使用 `domain.bottomSafeGap`；
 * - 钳制不改变节点尺寸，仅移动位置；当节点尺寸超过内容边界时，位置钳制为内容区左上角。
*/
export const clampNodesToContainers = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const cfgFull = diagramConfigManager.getConfig() as any;
  const layoutCfg = diagramConfigManager.getLayoutConfig() as any;
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;

  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));

  const getSize = (n: ReactFlowNode): { w: number; h: number } => {
    const w = num(((n as any)?.measured?.width ?? (n.style as any)?.width ?? (n as any)?.width), 0);
    const h = num(((n as any)?.measured?.height ?? (n.style as any)?.height ?? (n as any)?.height), 0);
    return { w, h };
  };

  // 子域容器钳制
  const subCfg = cfgFull?.subDomain || {};
  const subPad = {
    H: num(subCfg?.padding?.horizontal, 25),
    top: num(subCfg?.padding?.top, 35),
    bottom: num(subCfg?.padding?.bottom, 20)
  };
  const ensureTitleClearanceGlobal = !!layoutCfg?.ENSURE_SUB_GROUP_TITLE_CLEARANCE;
  const titleClearance = num(layoutCfg?.SUB_GROUP_TITLE_CLEARANCE, subPad.top);
  updated.filter(n => String(n.type || '') === 'subGroup').forEach(sg => {
    const sgChildren = Array.isArray((sg as any)?.data?.children) ? ((sg as any).data.children as string[]) : [];

    // dagre 模式检测：检查子域自身的 __dagreSized 标记
    const dagreSized = (sg.data as any)?.__dagreSized;
    if (dagreSized && typeof dagreSized.h === 'number' && dagreSized.h > 0) {
      return; // 跳过此子域的钳制（使用 dagre 精确尺寸）
    }

    const pos = sg.position || { x: 0, y: 0 } as any;
    const size = getSize(sg);
    const ensureTitleClearanceLocal = ((): boolean => {
      const v = (((sg as any).data || {}) as any)?.ensureTitleClearance;
      if (typeof v === 'boolean') return v;
      return ensureTitleClearanceGlobal;
    })();
    const innerLeft = num(pos.x, 0) + subPad.H;
    let innerRight = num(pos.x, 0) + size.w - subPad.H;
    const innerTop = num(pos.y, 0) + (ensureTitleClearanceLocal ? Math.max(subPad.top, titleClearance) : subPad.top);
    let innerBottom = num(pos.y, 0) + size.h - subPad.bottom;
    const childIds = Array.isArray((sg.data as any)?.children) ? (sg.data as any).children as string[] : [];
    for (const cid of childIds) {
      const child = idMap.get(cid);
      if (!child) continue;
      if (((child as any)?.data || {})?.hidden) continue;
      const cpos = child.position || { x: 0, y: 0 } as any;
      const csize = getSize(child);
      const H_GAP_CONF = num((diagramConfigManager.getLayoutConfig() as any)?.NODE_H_GAP, 120);
      const finalSafeTotalH = Math.max(Math.floor(H_GAP_CONF * 0.15), Math.floor(subPad.H * 0.5));
      const safeLeftH = Math.floor(finalSafeTotalH / 2);
      const safeRightH = finalSafeTotalH - safeLeftH;
      const availW = Math.max(0, innerRight - innerLeft);
      const availH = Math.max(0, innerBottom - innerTop);
      if (csize.w > availW) {
        const newW = csize.w + subPad.H * 2 + safeLeftH + safeRightH;
        const newPosX = num(pos.x, 0) - safeLeftH;
        (sg as any).position = { x: newPosX, y: num(pos.y, 0) } as any;
        ((sg as any).style || ((sg as any).style = {})).width = newW;
        (sg as any).measured = { ...(sg as any).measured, width: newW } as any;
        innerRight = newPosX + newW - subPad.H;
      }
      if (csize.h > availH) {
        const newH = csize.h + subPad.top + subPad.bottom;
        ((sg as any).style || ((sg as any).style = {})).height = newH;
        (sg as any).measured = { ...(sg as any).measured, height: newH } as any;
        innerBottom = num(pos.y, 0) + newH - subPad.bottom;
      }
      const minX = innerLeft;
      const maxX = Math.max(innerLeft, innerRight - safeRightH - csize.w);
      const minY = innerTop;
      const maxY = Math.max(innerTop, innerBottom - csize.h);
      const nx = Math.min(Math.max(num(cpos.x, 0), minX), maxX);
      const ny = Math.min(Math.max(num(cpos.y, 0), minY), maxY);
      child.position = { x: nx, y: ny } as any;
      const idx = updated.findIndex(n => n.id === child.id);
      if (idx >= 0) updated[idx] = { ...child } as any;
    }
  });

  // 鍩熷鍣ㄩ挸鍒?
  const domainPadH = num(cfgFull?.domain?.padding?.horizontal, 24);
  const titleH = num(cfgFull?.domain?.title?.height, 40);
  const titleV = num(cfgFull?.domain?.title?.padding?.vertical, 12);
  const titleSafe = num(cfgFull?.domain?.title?.safeGap, 16);
  const bottomSafe = num(cfgFull?.domain?.bottomSafeGap, titleV + titleSafe);
  const tgs = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const tg of tgs) {
    const domainKey = String(((tg.data as any)?.domain || ''));
    if (!domainKey) continue;
    const pos = tg.position || { x: 0, y: 0 } as any;
    const size = getSize(tg);
    const innerLeft = num(pos.x, 0) + domainPadH;
    let innerRight = num(pos.x, 0) + size.w - domainPadH;
    const innerTop = num(pos.y, 0) + titleH + titleV + titleSafe;
    const contentHDom = Math.max(0, size.h - (titleH + titleV + titleSafe) - bottomSafe);
    let bottomSafeEff = Math.max(6, Math.floor((titleV + titleSafe) * 0.5));
    bottomSafeEff = Math.max(bottomSafeEff, Math.floor(bottomSafe * 0.7));
    bottomSafeEff = Math.min(bottomSafeEff, Math.floor(contentHDom * 0.12));
    const innerBottom = num(pos.y, 0) + size.h - bottomSafeEff;
    const idMapLocal = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
    const majorityDomainOfChildren = (sg: ReactFlowNode): string | undefined => {
      const children = Array.isArray((sg.data as any)?.children) ? ((sg.data as any).children as string[]) : [];
      if (!children.length) return undefined;
      const counts: Record<string, number> = {};
      for (const cid of children) {
        const c = idMapLocal.get(cid);
        const dom = String(((c as any)?.data?.domain || '')).trim();
        if (!dom) continue;
        counts[dom] = (counts[dom] || 0) + 1;
      }
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      return entries.length ? entries[0][0] : undefined;
    };
    const members = updated.filter(n => {
      const d1 = String(((n.data as any)?.domain || '')).trim();
      const typeStr = String(n.type || '');
      if (typeStr === 'titleGroup') return false;
      if (d1 === domainKey) return true;
      if (typeStr === 'subGroup') {
        const maj = majorityDomainOfChildren(n);
        return !!maj && String(maj).trim() === String(domainKey).trim();
      }
      return false;
    });
    for (const m of members) {
      const mpos = m.position || { x: 0, y: 0 } as any;
      const msize = getSize(m);
      const availWDom = Math.max(0, innerRight - innerLeft);
      if (msize.w > availWDom) {
        const targetW = msize.w + domainPadH * 2;
        ((tg as any).style || ((tg as any).style = {})).width = targetW;
        (tg as any).measured = { ...(tg as any).measured, width: targetW } as any;
        // 閲嶆柊璁＄畻鍙崇晫
        const newSize = getSize(tg);
        innerRight = num(pos.x, 0) + newSize.w - domainPadH;
      }
      const minX = innerLeft;
      const maxX = Math.max(innerLeft, innerRight - msize.w);
      const minY = innerTop;
      const maxY = Math.max(innerTop, innerBottom - msize.h);
      const nx = Math.min(Math.max(num(mpos.x, 0), minX), maxX);
      const ny = Math.min(Math.max(num(mpos.y, 0), minY), maxY);
      m.position = { x: nx, y: ny } as any;
      const idx = updated.findIndex(n => n.id === m.id);
      if (idx >= 0) updated[idx] = { ...m } as any;
    }
  }

  /**
   * 函数级注释：按归属将域内自由节点归并到最近子域
   * 规则：同域下，节点中心点落入某子域的矩形内容区（含内边距）则加入该子域的 children
   */
  return updated;
};

/**
 * 函数级注释：子域容器在域内水平居中
 * 目标：在域宽与子域最终宽度确定后，使每个子域容器在所属域内部可用宽度内水平居中，保证左右留白对称。
 * 规则：
 * - 域内部边界：innerLeft = domain.x + padH；innerRight = domain.x + domain.w - padH；
 * - 子域居中：sgX = innerLeft + floor((availW - sgW)/2) - subPadH；同步平移 children；
 * - 钳制：确保 sgX ∈ [innerLeft - subPadH, innerRight - subPadH - sgW]。
 */

/**
 * 函数级注释：子域容器宽度扩展以填满域内可用宽度（仅扩展不收缩）
 * 目标：将同域内每个可见子域容器的宽度扩展到“域内部可用宽度 availW”，并将其左锚对齐到 `innerLeft - subPadH`；两侧留白仅为子域自身水平内边距，避免相对域右侧过大空白。
 * 规则：
 * - 仅当 `availW > curW` 时扩展；避免内容被压缩导致换行或溢出；
 * - 不更新 children 的位置与尺寸，仅扩展容器包围框；
 * - 写回 `style.width/measured.width/width` 与 `position.x`。
 */
