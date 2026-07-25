import type { Edge } from '@xyflow/react';
import { diagramConfigManager } from '../../config/DiagramConfig';
import { calculateBoundingBox, countRectOverlaps } from './geometryUtils';
import {
  asDomainRecord as asRecord,
  finiteDomainNumber as finiteNumber,
  GROUP_TYPES,
  isHiddenNode,
  nodeChildren,
  nodeDomain,
  nodeHeight,
  nodeWidth,
  nodeX,
  nodeY,
  setNodeDimensions,
  setNodePosition,
  type LayoutNode,
} from './domainContainerAccessors';

/**
 * @file 统一布局工具函数
 * @description 整合所有图表的布局计算逻辑，避免重复代码
 */

/**
 * 应用域分组（支持白名单）
 * 函数级注释：当提供 `whitelist` 时，仅为白名单中的域创建 titleGroup，否则为全部域创建。
 */
export const applyDomainGrouping = (
  nodes: LayoutNode[],
  whitelist?: string[]
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainCfg = asRecord(cfgFull.domain);
  const domainPadding = asRecord(domainCfg.padding);
  const domainTitle = asRecord(domainCfg.title);
  const domainTitlePadding = asRecord(domainTitle.padding);
  const fullLayoutCfg = asRecord(cfgFull.layout);
  const autoGapScale = asRecord(fullLayoutCfg.autoGapScale);
  const padH = finiteNumber(domainPadding.horizontal, 24);
  const _padV = finiteNumber(domainPadding.vertical, 16);
  const titleH = finiteNumber(domainTitle.height, 50);
  const titleVPad = finiteNumber(domainTitlePadding.vertical, 12);
  const titleSafe = finiteNumber(domainTitle.safeGap, 16);
  const bottomSafe = finiteNumber(
    domainCfg.bottomSafeGap ?? domainPadding.bottom,
    titleVPad + titleSafe
  );
  const layoutCfgStrict = asRecord(diagramConfigManager.getLayoutConfig());
  const autoScaleHStrict = finiteNumber(autoGapScale.h, 1);
  const baseHGapStrict = finiteNumber(layoutCfgStrict.NODE_H_GAP, 120);
  const _hGapEffStrict = Math.max(8, Math.floor(baseHGapStrict * Math.min(1.0, autoScaleHStrict)));
  const layoutCfg = asRecord(diagramConfigManager.getLayoutConfig());
  const autoScaleH = finiteNumber(autoGapScale.h, 1);
  const baseHGap = finiteNumber(layoutCfg.NODE_H_GAP, 120);
  const hGapEff = Math.max(8, Math.floor(baseHGap * Math.min(1.0, autoScaleH)));

  const existingTitleGroups = new Set(
    nodes
      .filter(n => String(n.type || '') === 'titleGroup')
      .map(nodeDomain)
  );

  const groupedByDomain = nodes.reduce((acc, n) => {
    const d = nodeDomain(n);
    if (!d) return acc;
    // 跳过容器类节点的自身参与计算，避免重复包含
    const t = String(n.type || '');
    if (new Set(['titleGroup', 'subGroup', 'group', 'domain']).has(t)) return acc;
    if (!acc[d]) acc[d] = [];
    acc[d].push(n);
    return acc;
  }, {} as Record<string, LayoutNode[]>);

  if (!Object.keys(groupedByDomain).length) return nodes;

  const result: LayoutNode[] = [...nodes];

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
      .map(c => c.data.domainClass)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    const majorityClass = childClasses.length
      ? Array.from(childClasses.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1])[0][0]
      : undefined;

    // 尝试从第一个子节点获取 domainShape 配置（常由 orchestrator 注入到 metadata 或 data 中）
    const firstChild = children[0];
    const domainShape = firstChild?.data.domainShape
      ?? asRecord(firstChild?.data.metadata).domainShape;

    const node: LayoutNode = {
      id: `titlegroup-${d}`,
      type: 'titleGroup',
      position: { x, y },
      style: { width, height, zIndex: -10 },
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
      measured: { width, height },
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
  nodes: LayoutNode[]
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainCfg = asRecord(cfgFull.domain);
  const domainPadding = asRecord(domainCfg.padding);
  const domainTitle = asRecord(domainCfg.title);
  const domainTitlePadding = asRecord(domainTitle.padding);
  const fullLayoutCfg = asRecord(cfgFull.layout);
  const autoGapScale = asRecord(fullLayoutCfg.autoGapScale);
  const padH = finiteNumber(domainPadding.horizontal, 24);
  const _padV = finiteNumber(domainPadding.vertical, 16);
  const titleH = finiteNumber(domainTitle.height, 50);
  const titleVPad = finiteNumber(domainTitlePadding.vertical, 12);
  const titleSafe = finiteNumber(domainTitle.safeGap, 16);
  const _bottomSafe = finiteNumber(
    domainCfg.bottomSafeGap ?? domainPadding.bottom,
    titleVPad + titleSafe
  );
  const layoutCfgStrict = asRecord(diagramConfigManager.getLayoutConfig());
  const autoScaleHStrict = finiteNumber(autoGapScale.h, 1);
  const baseHGapStrict = finiteNumber(layoutCfgStrict.NODE_H_GAP, 120);
  const hGapEffStrict = Math.max(8, Math.floor(baseHGapStrict * Math.min(1.0, autoScaleHStrict)));
  const safeEdgeW = Math.max(6, Math.floor(hGapEffStrict * 0.25));

  const isGroupType = (type: unknown) => GROUP_TYPES.has(String(type ?? ''));

  const updated: LayoutNode[] = nodes.map(n => ({ ...n }));
  const titleGroups = updated.filter(n => String(n.type || '') === 'titleGroup');
  if (!titleGroups.length) return updated;

  for (let i = 0; i < titleGroups.length; i++) {
    const tg = titleGroups[i];
    const domainKey = nodeDomain(tg);
    if (!domainKey) continue;
    const dk = String(domainKey).trim();
    const idMap = new Map<string, LayoutNode>(updated.map(n => [n.id, n] as const));
    const majorityDomainOfChildren = (sg: LayoutNode): string | undefined => {
      const children = nodeChildren(sg);
      if (!children.length) return undefined;
      const counts: Record<string, number> = {};
      for (const cid of children) {
        const c = idMap.get(cid);
        const dom = nodeDomain(c).trim();
        if (!dom) continue;
        counts[dom] = (counts[dom] || 0) + 1;
      }
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      return entries.length ? entries[0][0] : undefined;
    };

    // 鏀堕泦璇ュ煙鐨勪笟鍔¤妭鐐逛笌瀛愬煙瀹瑰櫒
    const widthBySubOnly = fullLayoutCfg.domainWidthBySubGroupsOnly !== false;
    const childrenCandidates = updated.filter(n => {
      const d1 = nodeDomain(n).trim();
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
      if (isHiddenNode(n)) return false;
      return !isGroupType(typeStr);
    });
    if (!childrenCandidates.length) continue;

    const layoutCfgStrict = asRecord(diagramConfigManager.getLayoutConfig());
    const autoScaleHStrict = finiteNumber(autoGapScale.h, 1);
    const baseHGapStrict = finiteNumber(layoutCfgStrict.NODE_H_GAP, 120);
    const _hGapEffStrict = Math.max(8, Math.floor(baseHGapStrict * Math.min(1.0, autoScaleHStrict)));
    const bbox = calculateBoundingBox(childrenCandidates);
    const contentHStrict = Math.max(0, bbox.height);
    const _childCountStrict = childrenCandidates.length;
    const bottomSafeEff = finiteNumber(domainCfg.bottomSafeGap, titleVPad + titleSafe);
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
        .map(n => n.data.domainClass)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      const majorityClass = childClasses.length
        ? Array.from(childClasses.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1])[0][0]
        : undefined;

      const _curW = nodeWidth(old, 0);
      const _curH = nodeHeight(old, 0);
      const finalW = width; // 浠ユ渶缁堟姇褰变负鍑嗭紝鍏佽鏀剁缉
      const finalH = height;
      const anchoredX = nodeX(old, x);
      const next: LayoutNode = {
        ...old,
        position: { x: Math.round(anchoredX), y },
        style: { ...old.style, width: finalW, height: finalH, zIndex: -10 },
        data: { ...old.data, domain: domainKey, domainClass: majorityClass ?? old.data.domainClass, titleBarHeight: titleH, baseZIndex: -10 },
        zIndex: -10,
        measured: { width: finalW, height: finalH }
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
  nodes: LayoutNode[],
  gapOverride?: number
): LayoutNode[] => {
  const cfg = asRecord(diagramConfigManager.getConfig());
  const domainGap = finiteNumber(
    gapOverride,
    finiteNumber(asRecord(cfg.domain).gap, 48)
  );

  const containers = nodes.filter(n => String(n.type ?? '') === 'titleGroup');
  const isLocked = (node: LayoutNode) => node.data.anchorLocked === true;
  if (containers.length <= 1) return nodes;

  const getRect = (n: LayoutNode) => {
    const w = nodeWidth(n, 0);
    const h = nodeHeight(n, 0);
    const x = nodeX(n);
    const y = nodeY(n);
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
      const d = nodeDomain(n);
      if (d === domain) {
        const px = nodeX(n);
        const py = nodeY(n);
        const translated = { ...n, position: { x: Math.round(px + dx), y: Math.round(py + dy) } };
        // 若节点数据中存在 position 字段，顺带修正（兼容旧约定）
        const dataPosition = asRecord(n.data.position);
        if (Object.keys(dataPosition).length > 0) {
          translated.data = {
            ...n.data,
            position: {
              x: Math.round(finiteNumber(dataPosition.x, 0) + dx),
              y: Math.round(finiteNumber(dataPosition.y, 0) + dy)
            }
          };
        }
        updated[i] = translated;
      }
    }
    return updated;
  };

  // 1) 垂直方向重叠消解：按 y 升序设置
  const byY = containers.slice().sort((a, b) => getRect(a).y - getRect(b).y);
  const placedY: Array<{ domain: string; rect: { x: number; y: number; w: number; h: number } }> = [];
  for (const c of byY) {
    const d = nodeDomain(c);
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
    const d = nodeDomain(c);
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
  const rectOf = (n: LayoutNode) => getRect(n);
  const idxOf = (id: string) => updated.findIndex(n => n.id === id);
  while (iteration < maxIter) {
    let hasOverlap = false;
    for (let i = 0; i < finals.length; i++) {
      for (let j = i + 1; j < finals.length; j++) {
        const a = rectOf(finals[i]);
        const b = rectOf(finals[j]);
        if (intersects(a, b)) {
          hasOverlap = true;
          const ad = nodeDomain(finals[i]);
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
  nodes: LayoutNode[],
  nodeHGap?: number,
  nodeVGap?: number
): LayoutNode[] => {
  const cfg = asRecord(diagramConfigManager.getLayoutConfig());
  const vGap = finiteNumber(nodeVGap, finiteNumber(cfg.NODE_V_GAP, 80));
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, LayoutNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getH = (node: LayoutNode) => nodeHeight(node, 120);
  const getY = (node: LayoutNode) => nodeY(node);
  const setY = (node: LayoutNode, y: number) => setNodePosition(node, nodeX(node), y);

  const domains = Array.from(new Set(updated.map(nodeDomain).filter(Boolean)));
  for (const d of domains) {
    const sgs = updated.filter(n => String(n.type ?? '') === 'subGroup' && nodeDomain(n) === d);
    const leftovers = updated.filter(n =>
      !EXCLUDE.has(String(n.type ?? ''))
      && nodeDomain(n) === d
      && !sgs.some(sg => nodeChildren(sg).includes(n.id))
    );
    type Block = { ref?: LayoutNode; top: number; bottom: number; applyDy: (dy: number) => void };
    const blocks: Block[] = [];
    for (const sg of sgs) {
      const top = getY(sg);
      const h = getH(sg);
      const children = nodeChildren(sg);
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
      blocks.push({ top: Number.isFinite(minYLeft) ? minYLeft : 0, bottom: Number.isFinite(maxYLeft) ? maxYLeft : 1, applyDy: (dy: number) => { for (const n of leftovers) setY(n, getY(n) + dy); } });
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
  nodes: LayoutNode[],
  edges: Edge[],
  nodeVGap?: number
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainConfig = asRecord(cfgFull.domain);
  const domainTitle = asRecord(domainConfig.title);
  const domainTitlePadding = asRecord(domainTitle.padding);
  const layoutCfg = asRecord(diagramConfigManager.getLayoutConfig());
  const vGap = finiteNumber(nodeVGap, finiteNumber(layoutCfg.NODE_V_GAP, 80));
  const titleH = finiteNumber(domainTitle.height, 40);
  const titleV = finiteNumber(domainTitlePadding.vertical, 12);
  const titleSafe = finiteNumber(domainTitle.safeGap, 16);
  const _sideSafe = Math.max(12, finiteNumber(domainConfig.sideSafeGap, 8));

  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, LayoutNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getH = (node: LayoutNode) => nodeHeight(node, 120);
  const getY = (node: LayoutNode) => nodeY(node);
  const setY = (node: LayoutNode, y: number) => setNodePosition(node, nodeX(node), y);

  const domains = Array.from(new Set(updated.map(nodeDomain).filter(Boolean)));
  for (const d of domains) {
    const tg = updated.find(n => String(n.type ?? '') === 'titleGroup' && nodeDomain(n) === d);
    const domainTopSafe = tg ? (getY(tg) + titleH + titleV + titleSafe) : 0;
    const sgs = updated.filter(n => String(n.type ?? '') === 'subGroup' && nodeDomain(n) === d);
    type Block = { ref?: LayoutNode; top: number; bottom: number };
    const blocks: Block[] = [];
    for (const sg of sgs) { blocks.push({ ref: sg, top: getY(sg), bottom: getY(sg) + getH(sg) }); }
    const leftovers = updated.filter(n =>
      !EXCLUDE.has(String(n.type ?? ''))
      && nodeDomain(n) === d
      && !sgs.some(sg => nodeChildren(sg).includes(n.id))
    );
    if (leftovers.length) {
      const minYLeft = Math.min(...leftovers.map(n => getY(n)));
      const maxYLeft = Math.max(...leftovers.map(n => getY(n) + getH(n)));
      blocks.push({ top: Number.isFinite(minYLeft) ? minYLeft : 0, bottom: Number.isFinite(maxYLeft) ? maxYLeft : 1 });
    }
    blocks.sort((a, b) => a.top - b.top);
    const childrenBySub = new Map<string, string[]>();
    for (const sg of sgs) childrenBySub.set(sg.id, nodeChildren(sg));
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
  nodes: LayoutNode[]
): number => {
  const tgs = nodes.filter(n => String(n.type ?? '') === 'titleGroup');
  const rects = tgs.map(n => ({
    x: nodeX(n),
    y: nodeY(n),
    width: nodeWidth(n, 0),
    height: nodeHeight(n, 0)
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
  nodes: LayoutNode[]
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainConfig = asRecord(cfgFull.domain);
  const domainPadding = asRecord(domainConfig.padding);
  const subDomainConfig = asRecord(cfgFull.subDomain);
  const subDomainPadding = asRecord(subDomainConfig.padding);
  const legacySubGroupPadding = asRecord(asRecord(cfgFull.subGroup).padding);
  const layoutConfig = asRecord(diagramConfigManager.getLayoutConfig());
  const layoutSubGroupPadding = asRecord(layoutConfig.SUB_GROUP_PADDING);
  const fullLayoutConfig = asRecord(cfgFull.layout);
  const updated = nodes.map(n => ({ ...n }));
  const padH = finiteNumber(domainPadding.horizontal, 24);
  const sideSafe = Math.max(12, finiteNumber(domainConfig.sideSafeGap, 8));
  const _subPadH = finiteNumber(
    subDomainPadding.horizontal ?? legacySubGroupPadding.horizontal ?? layoutSubGroupPadding.H,
    30
  );
  const domains = updated.filter(n => String(n.type ?? '') === 'titleGroup');
  const widthBySubOnly = fullLayoutConfig.domainWidthBySubGroupsOnly !== false;
  for (const dc of domains) {
    const dId = nodeDomain(dc);
    if (!dId) continue;
    const xOld = nodeX(dc);
    const innerLeftOld = xOld + padH;
    let minLeft = Infinity;
    let maxRight = -Infinity;
    for (const n of updated) {
      const tp = String(n.type ?? '');
      const belongs = nodeDomain(n) === dId;
      if (!belongs || tp === 'titleGroup') continue;
      if (widthBySubOnly && tp !== 'subGroup') continue;
      if (isHiddenNode(n)) continue;
      const nx = nodeX(n, innerLeftOld);
      const nw = nodeWidth(n, 0);
      const left = nx;
      const right = nx + nw;
      minLeft = Math.min(minLeft, left);
      maxRight = Math.max(maxRight, right);
    }
    if (Number.isFinite(maxRight) && Number.isFinite(minLeft)) {
      const contentW = Math.max(0, maxRight - minLeft);
      const newW = contentW + padH * 2 + sideSafe * 2;
      setNodeDimensions(dc, newW, nodeHeight(dc, 0));
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
  nodes: LayoutNode[]
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainConfig = asRecord(cfgFull.domain);
  const domainPadding = asRecord(domainConfig.padding);
  const domainTitle = asRecord(domainConfig.title);
  const domainTitlePadding = asRecord(domainTitle.padding);
  const updated = nodes.map(n => ({ ...n }));
  const padH = finiteNumber(domainPadding.horizontal, 24);
  const titleH = finiteNumber(domainTitle.height, 40);
  const titleV = finiteNumber(domainTitlePadding.vertical, 12);
  const titleSafe = finiteNumber(domainTitle.safeGap, 16);
  const bottomSafe = finiteNumber(domainConfig.bottomSafeGap ?? domainPadding.bottom, padH);
  const domains = updated.filter(n => String(n.type ?? '') === 'titleGroup');
  for (const dc of domains) {
    const dId = nodeDomain(dc);
    if (!dId) continue;
    const _x = nodeX(dc);
    const y = nodeY(dc);
    const innerTop = y + titleH + titleV + titleSafe;
    let maxBottom = innerTop;
    for (const n of updated) {
      const tp = String(n.type ?? '');
      const belongs = nodeDomain(n) === dId;
      if (!belongs || tp === 'titleGroup') continue;
      if (isHiddenNode(n)) continue;
      const ny = nodeY(n, innerTop);
      const nh = nodeHeight(n, 80);
      maxBottom = Math.max(maxBottom, ny + nh);
    }
    const contentH = Math.max(0, maxBottom - innerTop);
    const keepW = nodeWidth(dc, 0);
    const newH = titleH + titleV + titleSafe + contentH + bottomSafe;
    setNodeDimensions(dc, keepW, newH);
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
  nodes: LayoutNode[]
): LayoutNode[] => {
  const cfgFull = asRecord(diagramConfigManager.getConfig());
  const domainConfig = asRecord(cfgFull.domain);
  const domainPadding = asRecord(domainConfig.padding);
  const domainTitle = asRecord(domainConfig.title);
  const domainTitlePadding = asRecord(domainTitle.padding);
  const updated = nodes.map(n => ({ ...n }));
  const titleH = finiteNumber(domainTitle.height, 40);
  const titleV = finiteNumber(domainTitlePadding.vertical, 12);
  const titleSafe = finiteNumber(domainTitle.safeGap, 16);
  const bottomSafe = finiteNumber(domainConfig.bottomSafeGap ?? domainPadding.bottom, 24);
  const domains = updated.filter(n => String(n.type ?? '') === 'titleGroup');
  for (const dc of domains) {
    const dId = nodeDomain(dc);
    if (!dId) continue;
    const dy = nodeY(dc);
    const innerTop = dy + titleH + titleV + titleSafe;
    let maxBottom = innerTop;
    for (const n of updated) {
      const nd = nodeDomain(n);
      const tp = String(n.type ?? '');
      if (nd !== dId || tp !== 'subGroup') continue;
      const ny = nodeY(n, innerTop - 1);
      const nh = nodeHeight(n, 0);
      maxBottom = Math.max(maxBottom, ny + nh);
    }
    const contentH = Math.max(0, maxBottom - innerTop);
    const requiredH = titleH + titleV + titleSafe + contentH + bottomSafe;
    const keepW = nodeWidth(dc, 0);
    const curH = nodeHeight(dc, requiredH);
    const finalH = Math.max(curH, requiredH);
    setNodeDimensions(dc, keepW, finalH);
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
export { clampNodesToContainers } from './domainContainerClamping';
