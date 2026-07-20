/**
 * LayoutRefinement — 路由感知布局后处理层
 *
 * 融合 ELK / Sugiyama / Adaptagrams 的核心思想，作为通用后处理层
 * 在任何布局策略（dagre / elk / domain-*）完成后自动运行，
 * 优化节点位置以改善后续连线质量。
 *
 * ⭐ 域感知约束：当提供 nodeGroups 时，所有优化阶段都在
 *    每个域组内部独立运行，永远不会跨域移动节点。
 *
 * 三个优化阶段：
 * ① 边通道间距预留 — 借鉴 ELK 的 edgeNodeBetweenLayers
 * ② 层内排序交叉最小化 — 借鉴 Sugiyama 的 barycenter 启发式
 * ③ 阻塞节点微调 — 借鉴 Adaptagrams 的 libcola+libavoid 反馈循环
 */

import type { Node, Edge } from '@xyflow/react';
import { safeLog } from '../../utils/consoleCleanup';
import {
  assignLayers,
  buildNodeRects,
  countCrossings,
  estimateDetourRatio,
  findBlockingNodes,
  rectsOverlap,
} from './layoutRefinementGeometry';
import type {
  LayoutRefinementLayer as LayerInfo,
  LayoutRefinementNodeRect as NodeRect,
} from './layoutRefinementGeometry';

// ═══════════════════════════════════════════════════════════════
// 公开接口
// ═══════════════════════════════════════════════════════════════

export interface RefinementOptions {
  /** ① 启用边通道间距预留（默认 true） */
  enableChannelSpacing?: boolean;
  /** ② 启用层内排序交叉最小化（默认 true） */
  enableCrossingMinimization?: boolean;
  /** ③ 启用阻塞节点微调（默认 false，需要更多测试后开启） */
  enableNodeNudging?: boolean;

  /** 每条穿越边分配的通道宽度（默认 12px） */
  channelWidth?: number;
  /** 层间最大额外间距（默认 120px，防止过度拉伸） */
  maxExtraSpacing?: number;
  /** 层聚类容差：y 坐标差 ≤ 此值视为同一层（默认 60px） */
  layerTolerance?: number;

  /** 节点微调搜索范围（默认 40px） */
  nudgeRange?: number;
  /** 节点微调步长（默认 20px） */
  nudgeStep?: number;
  /** detour ratio 超过此阈值才微调（默认 1.15） */
  nudgeThreshold?: number;

  /** 交叉最小化最大扫描轮数（默认 4） */
  maxSweeps?: number;

  /** 布局方向：TB 或 LR */
  direction?: 'TB' | 'LR';

  /**
   * ⭐ 域感知约束：域/子域分组信息
   *
   * key = 容器节点 ID（如 titlegroup-logistics）
   * value = 该域内的业务节点 ID 列表
   *
   * 当提供此参数时，所有优化阶段在每个组内独立运行，
   * 永远不会让节点跨域移动，保证域布局结构不被破坏。
   */
  nodeGroups?: Map<string, string[]>;
}

export interface RefinementResult {
  nodes: Node[];
  stats: {
    layerCount: number;
    channelSpacingApplied: number;
    crossingsBefore: number;
    crossingsAfter: number;
    nudgesApplied: number;
    durationMs: number;
    groupCount: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════════

/**
 * 对布局结果进行路由感知精修
 *
 * @param nodes  布局策略输出的节点（带 position）
 * @param edges  对应的边
 * @param opts   精修选项
 * @returns      优化后的节点 + 统计信息
 */
export function refineLayout(
  nodes: Node[],
  edges: Edge[],
  opts?: RefinementOptions,
): RefinementResult {
  const t0 = performance.now();
  const options = {
    enableChannelSpacing: true,
    enableCrossingMinimization: true,
    enableNodeNudging: false,
    channelWidth: 12,
    maxExtraSpacing: 120,
    layerTolerance: 60,
    nudgeRange: 40,
    nudgeStep: 20,
    nudgeThreshold: 1.15,
    maxSweeps: 4,
    direction: 'TB' as const,
    ...opts,
  };

  // 跳过容器节点，只处理业务节点
  const containerTypes = new Set(['titleGroup', 'subGroup', 'domain', 'group']);
  const businessNodes = nodes.filter(n => !containerTypes.has(n.type || ''));
  const containerNodes = nodes.filter(n => containerTypes.has(n.type || ''));

  // 如果业务节点太少，跳过优化
  if (businessNodes.length < 3) {
    return {
      nodes,
      stats: { layerCount: 0, channelSpacingApplied: 0, crossingsBefore: 0, crossingsAfter: 0, nudgesApplied: 0, durationMs: performance.now() - t0, groupCount: 0 },
    };
  }

  const isHorizontal = options.direction === 'LR';
  const nodeGroups = options.nodeGroups;

  // ═══════════════════════════════════════════════════════════
  // 域感知模式 vs 扁平模式
  // ═══════════════════════════════════════════════════════════
  let refined: Node[];
  let totalLayers = 0;
  let totalChannelSpacing = 0;
  let totalCrossingsBefore = 0;
  let totalCrossingsAfter = 0;
  let totalNudges = 0;
  let groupCount = 0;

  if (nodeGroups && nodeGroups.size > 0) {
    // ── 域感知模式：在每个域组内独立运行优化 ──
    groupCount = nodeGroups.size;
    const nodeById = new Map(businessNodes.map(n => [n.id, n]));
    const groupMemberSet = new Set<string>();

    // 收集所有分组内的节点ID
    for (const memberIds of nodeGroups.values()) {
      for (const id of memberIds) groupMemberSet.add(id);
    }

    // 对每个域组独立运行优化
    const refinedMap = new Map<string, Node>();

    for (const [_groupId, memberIds] of nodeGroups) {
      const groupNodes = memberIds
        .map(id => nodeById.get(id))
        .filter((n): n is Node => !!n);

      if (groupNodes.length < 2) {
        // 组内节点太少，保持原样
        groupNodes.forEach(n => refinedMap.set(n.id, n));
        continue;
      }

      // 只取组内边（两端都在同一组内的边）
      const memberSet = new Set(memberIds);
      const groupEdges = edges.filter(e => memberSet.has(e.source) && memberSet.has(e.target));

      // 运行三个阶段（组内独立）
      const result = runPhasesOnGroup(groupNodes, groupEdges, options, isHorizontal);
      result.nodes.forEach(n => refinedMap.set(n.id, n));
      totalLayers += result.layers;
      totalChannelSpacing += result.channelSpacing;
      totalCrossingsBefore += result.crossingsBefore;
      totalCrossingsAfter += result.crossingsAfter;
      totalNudges += result.nudges;
    }

    // 不属于任何组的节点保持原样
    refined = businessNodes.map(n => refinedMap.get(n.id) || n);

  } else {
    // ── 扁平模式：无域约束，自由优化（用于 tree / force 布局） ──
    const result = runPhasesOnGroup(businessNodes, edges, options, isHorizontal);
    refined = result.nodes;
    totalLayers = result.layers;
    totalChannelSpacing = result.channelSpacing;
    totalCrossingsBefore = result.crossingsBefore;
    totalCrossingsAfter = result.crossingsAfter;
    totalNudges = result.nudges;
  }

  // 合并容器节点（容器不参与优化，但需要同步偏移）
  const finalNodes = syncContainerNodes(refined, containerNodes, nodes);

  const stats = {
    layerCount: totalLayers,
    channelSpacingApplied: totalChannelSpacing,
    crossingsBefore: totalCrossingsBefore,
    crossingsAfter: totalCrossingsAfter,
    nudgesApplied: totalNudges,
    durationMs: performance.now() - t0,
    groupCount,
  };

  safeLog.debug(
    `[LayoutRefinement] ${groupCount > 0 ? `${groupCount} groups | ` : ''}` +
    `${totalLayers} layers | ` +
    `channel: +${totalChannelSpacing} | ` +
    `crossings: ${totalCrossingsBefore}→${totalCrossingsAfter} | ` +
    `nudges: ${totalNudges} | ` +
    `${stats.durationMs.toFixed(1)}ms`,
  );

  return { nodes: finalNodes, stats };
}

// ═══════════════════════════════════════════════════════════════
// 核心：在一组节点上运行三个阶段
// ═══════════════════════════════════════════════════════════════

interface PhaseResult {
  nodes: Node[];
  layers: number;
  channelSpacing: number;
  crossingsBefore: number;
  crossingsAfter: number;
  nudges: number;
}

/**
 * 在给定的一组节点上运行 Phase 1/2/3
 * 这个函数对域内节点和扁平节点都通用
 */
function runPhasesOnGroup(
  groupNodes: Node[],
  groupEdges: Edge[],
  opts: {
    enableChannelSpacing: boolean;
    enableCrossingMinimization: boolean;
    enableNodeNudging: boolean;
    channelWidth: number;
    maxExtraSpacing: number;
    layerTolerance: number;
    nudgeRange: number;
    nudgeStep: number;
    nudgeThreshold: number;
    maxSweeps: number;
  },
  isHorizontal: boolean,
): PhaseResult {
  // 构建 node rect 查找表
  const rects = buildNodeRects(groupNodes);
  const rectMap = new Map(rects.map(r => [r.id, r]));

  // 按主轴聚类为层
  const layers = assignLayers(rects, opts.layerTolerance, isHorizontal);

  // ── Phase 1: 边通道间距预留 ──
  let channelSpacing = 0;
  let refined = [...groupNodes];
  if (opts.enableChannelSpacing && layers.length >= 2) {
    const result = applyChannelSpacing(refined, groupEdges, layers, rectMap, opts, isHorizontal);
    refined = result.nodes;
    channelSpacing = result.adjustments;
  }

  // 重新生成 rects 和 layers（Phase 1 可能修改了坐标）
  const rects2 = buildNodeRects(refined);
  const rectMap2 = new Map(rects2.map(r => [r.id, r]));
  const layers2 = assignLayers(rects2, opts.layerTolerance, isHorizontal);

  // ── Phase 2: 层内排序交叉最小化 ──
  const crossingsBefore = countCrossings(groupEdges, rectMap2);
  let crossingsAfter = crossingsBefore;
  if (opts.enableCrossingMinimization && layers2.length >= 2) {
    refined = applyCrossingMinimization(refined, groupEdges, layers2, rectMap2, opts, isHorizontal);
    const rects3 = buildNodeRects(refined);
    const rectMap3 = new Map(rects3.map(r => [r.id, r]));
    crossingsAfter = countCrossings(groupEdges, rectMap3);
  }

  // ── Phase 3: 阻塞节点微调 ──
  let nudges = 0;
  if (opts.enableNodeNudging) {
    const result = applyNodeNudging(refined, groupEdges, opts, isHorizontal);
    refined = result.nodes;
    nudges = result.nudges;
  }

  return {
    nodes: refined,
    layers: layers.length,
    channelSpacing,
    crossingsBefore,
    crossingsAfter,
    nudges,
  };
}

// ═══════════════════════════════════════════════════════════════
// Phase 1: 边通道间距预留
// ═══════════════════════════════════════════════════════════════

/**
 * 统计每两层之间穿越的边数，按比例拉开间距
 *
 * 思路（借鉴 ELK edgeNodeBetweenLayers）：
 * - 一条边从 layer[i] 连到 layer[j]（j > i+1）时，穿越了中间的 i+1..j-1 层
 * - 穿越的边越多，层间需要的空间越大
 */
function applyChannelSpacing(
  nodes: Node[],
  edges: Edge[],
  layers: LayerInfo[],
  rectMap: Map<string, NodeRect>,
  opts: { channelWidth: number; maxExtraSpacing: number },
  isHorizontal: boolean,
): { nodes: Node[]; adjustments: number } {
  if (layers.length < 2) return { nodes, adjustments: 0 };

  // 建立 nodeId → layerIndex 映射
  const nodeLayer = new Map<string, number>();
  layers.forEach(l => l.nodeIds.forEach(id => nodeLayer.set(id, l.index)));

  // 统计每个层间隙 (i, i+1) 穿越的边数
  const gapCrossCount = new Array(layers.length - 1).fill(0);
  for (const edge of edges) {
    const srcL = nodeLayer.get(edge.source);
    const tgtL = nodeLayer.get(edge.target);
    if (srcL === undefined || tgtL === undefined) continue;
    const minL = Math.min(srcL, tgtL);
    const maxL = Math.max(srcL, tgtL);
    // 这条边穿越了 minL..maxL-1 之间的所有间隙
    for (let g = minL; g < maxL; g++) {
      gapCrossCount[g]++;
    }
  }

  // 计算每个间隙需要的额外间距
  // 至少有 1 条边穿越才需要额外空间；2+ 条边时按比例增长
  const extraSpacings = gapCrossCount.map(count => {
    if (count <= 1) return 0; // 1 条边不需要额外空间
    return Math.min(
      (count - 1) * opts.channelWidth,
      opts.maxExtraSpacing,
    );
  });

  // 累计偏移量
  const layerOffset = new Array(layers.length).fill(0);
  for (let i = 1; i < layers.length; i++) {
    layerOffset[i] = layerOffset[i - 1] + extraSpacings[i - 1];
  }

  let adjustments = 0;
  const result = nodes.map(n => {
    const li = nodeLayer.get(n.id);
    if (li === undefined || layerOffset[li] === 0) return n;
    adjustments++;
    const pos = { ...n.position };
    if (isHorizontal) {
      pos.x += layerOffset[li];
    } else {
      pos.y += layerOffset[li];
    }
    return { ...n, position: pos };
  });

  return { nodes: result, adjustments };
}

// ═══════════════════════════════════════════════════════════════
// Phase 2: 层内排序交叉最小化（Barycenter 启发式）
// ═══════════════════════════════════════════════════════════════

/**
 * Barycenter 排序：每个节点的「重心」= 所有相邻层邻居的横坐标平均值
 * 按重心排序本层节点，减少边交叉
 */
function applyCrossingMinimization(
  nodes: Node[],
  edges: Edge[],
  layers: LayerInfo[],
  rectMap: Map<string, NodeRect>,
  opts: { maxSweeps: number },
  isHorizontal: boolean,
): Node[] {
  if (layers.length < 2) return nodes;

  // 建立邻接表
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }

  // nodeId → layer index
  const nodeLayer = new Map<string, number>();
  layers.forEach(l => l.nodeIds.forEach(id => nodeLayer.set(id, l.index)));

  // 当前节点在排序轴上的坐标（用于计算重心）
  const nodeCoord = new Map<string, number>();
  for (const r of rectMap.values()) {
    nodeCoord.set(r.id, isHorizontal ? r.y : r.x);
  }

  // 多轮上下扫描
  let bestCrossings = countCrossings(edges, rectMap);
  let bestCoords = new Map(nodeCoord);

  for (let sweep = 0; sweep < opts.maxSweeps; sweep++) {
    // 向下扫描（固定上层，重排下层）
    for (let li = 1; li < layers.length; li++) {
      reorderLayer(layers[li], layers[li - 1], adj, nodeLayer, nodeCoord, isHorizontal);
    }
    // 向上扫描（固定下层，重排上层）
    for (let li = layers.length - 2; li >= 0; li--) {
      reorderLayer(layers[li], layers[li + 1], adj, nodeLayer, nodeCoord, isHorizontal);
    }

    // 检查是否改善
    const tmpRects = new Map(rectMap);
    for (const [id, coord] of nodeCoord) {
      const r = tmpRects.get(id);
      if (r) {
        tmpRects.set(id, { ...r, ...(isHorizontal ? { y: coord } : { x: coord }) });
      }
    }
    const newCrossings = countCrossings(edges, tmpRects);
    if (newCrossings < bestCrossings) {
      bestCrossings = newCrossings;
      bestCoords = new Map(nodeCoord);
    } else {
      // 不再改善，恢复最优并停止
      for (const [id, coord] of bestCoords) nodeCoord.set(id, coord);
      break;
    }
  }

  // 应用最优排序坐标到节点
  return nodes.map(n => {
    const newCoord = bestCoords.get(n.id);
    const oldRect = rectMap.get(n.id);
    if (newCoord === undefined || !oldRect) return n;
    const oldCoord = isHorizontal ? oldRect.y : oldRect.x;
    if (Math.abs(newCoord - oldCoord) < 1) return n;
    const pos = { ...n.position };
    if (isHorizontal) {
      pos.y += newCoord - oldRect.y;
    } else {
      pos.x += newCoord - oldRect.x;
    }
    return { ...n, position: pos };
  });
}

/**
 * 对 targetLayer 的节点按 barycenter 重排
 * fixedLayer 是参考层（已固定）
 */
function reorderLayer(
  targetLayer: LayerInfo,
  fixedLayer: LayerInfo,
  adj: Map<string, string[]>,
  nodeLayer: Map<string, number>,
  nodeCoord: Map<string, number>,
  _isHorizontal: boolean,
): void {
  const fixedSet = new Set(fixedLayer.nodeIds);

  // 计算每个节点的 barycenter
  const barycenters = new Map<string, number>();
  for (const nodeId of targetLayer.nodeIds) {
    const neighbors = (adj.get(nodeId) || []).filter(n => fixedSet.has(n));
    if (neighbors.length === 0) {
      // 没有固定层邻居，保持原位
      barycenters.set(nodeId, nodeCoord.get(nodeId) || 0);
      continue;
    }
    const sum = neighbors.reduce((s, n) => s + (nodeCoord.get(n) || 0), 0);
    barycenters.set(nodeId, sum / neighbors.length);
  }

  // 按 barycenter 排序
  const sorted = [...targetLayer.nodeIds].sort(
    (a, b) => (barycenters.get(a) || 0) - (barycenters.get(b) || 0),
  );

  // 重新分配坐标：保持相对间距，按排序顺序放置
  // 获取当前坐标并排序
  const currentCoords = targetLayer.nodeIds
    .map(id => nodeCoord.get(id) || 0)
    .sort((a, b) => a - b);

  // 按新顺序分配旧的坐标槽位
  sorted.forEach((id, i) => {
    nodeCoord.set(id, currentCoords[i]);
  });
}

// ═══════════════════════════════════════════════════════════════
// Phase 3: 阻塞节点微调
// ═══════════════════════════════════════════════════════════════

function applyNodeNudging(
  nodes: Node[],
  edges: Edge[],
  opts: { nudgeRange: number; nudgeStep: number; nudgeThreshold: number },
  isHorizontal: boolean,
): { nodes: Node[]; nudges: number } {
  const rects = buildNodeRects(nodes);
  const rectMap = new Map(rects.map(r => [r.id, r]));
  let nudges = 0;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const edge of edges) {
    const srcRect = rectMap.get(edge.source);
    const tgtRect = rectMap.get(edge.target);
    if (!srcRect || !tgtRect) continue;

    const ratio = estimateDetourRatio(srcRect, tgtRect, rects);
    if (ratio < opts.nudgeThreshold) continue;

    // 找阻塞节点：在 src→tgt 直线通道上的非源非目标节点
    const blockers = findBlockingNodes(srcRect, tgtRect, rects);
    if (blockers.length === 0) continue;

    // 尝试微调第一个阻塞节点
    const blocker = blockers[0];
    const node = nodeMap.get(blocker.id);
    if (!node) continue;

    // 搜索最佳偏移
    let bestOffset = 0;
    let bestRatio = ratio;
    for (let dx = -opts.nudgeRange; dx <= opts.nudgeRange; dx += opts.nudgeStep) {
      if (dx === 0) continue;
      // 模拟偏移
      const nudgedRect = {
        ...blocker,
        x: isHorizontal ? blocker.x : blocker.x + dx,
        y: isHorizontal ? blocker.y + dx : blocker.y,
      };
      // 检查不与其他节点重叠
      const overlaps = rects.some(
        r => r.id !== blocker.id && rectsOverlap(nudgedRect, r, 10),
      );
      if (overlaps) continue;

      const tempRects = rects.map(r => (r.id === blocker.id ? nudgedRect : r));
      const newRatio = estimateDetourRatio(srcRect, tgtRect, tempRects);
      if (newRatio < bestRatio) {
        bestRatio = newRatio;
        bestOffset = dx;
      }
    }

    if (bestOffset !== 0) {
      // 应用偏移
      const pos = { ...node.position };
      if (isHorizontal) {
        pos.y += bestOffset;
      } else {
        pos.x += bestOffset;
      }
      nodeMap.set(node.id, { ...node, position: pos });
      // 更新 rect
      const r = rectMap.get(blocker.id)!;
      if (isHorizontal) r.y += bestOffset;
      else r.x += bestOffset;
      nudges++;
    }
  }

  return { nodes: Array.from(nodeMap.values()), nudges };
}

/**
 * 同步容器节点位置
 *
 * 业务节点被优化后，容器节点（titleGroup 等）需要同步偏移。
 * 策略：找到容器的所有子节点，计算子节点位移的平均值，应用到容器。
 */
function syncContainerNodes(
  refinedBusiness: Node[],
  containers: Node[],
  _originalNodes: Node[],
): Node[] {
  if (containers.length === 0) return refinedBusiness;

  // 建立 parentId → children 映射
  const refinedById = new Map(refinedBusiness.map(n => [n.id, n]));
  const parentChildren = new Map<string, Node[]>();
  for (const n of refinedBusiness) {
    const pid = (n as any).parentId;
    if (!pid) continue;
    if (!parentChildren.has(pid)) parentChildren.set(pid, []);
    parentChildren.get(pid)!.push(n);
  }

  // 从原始节点获取容器的 padding 信息
  // 域布局策略设置的 padding 大约为：top=70, right=20, bottom=20, left=20
  // 如果容器有 style.padding 我们优先使用，否则用默认值
  const DEFAULT_PADDING = { top: 70, right: 20, bottom: 20, left: 20 };

  const adjustedContainers = containers.map(c => {
    const children = parentChildren.get(c.id) || [];
    if (children.length === 0) return c;

    // 子节点的 position 是相对于父容器的本地坐标
    // 找出子节点边界框
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const child of children) {
      const cx = child.position.x;
      const cy = child.position.y;
      const cw = (child as any).width || (child as any).measured?.width || (child.style as any)?.width || 200;
      const ch = (child as any).height || (child as any).measured?.height || (child.style as any)?.height || 100;
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (cx + cw > maxX) maxX = cx + cw;
      if (cy + ch > maxY) maxY = cy + ch;
    }

    // 安全检查：如果边界框无效（子节点没有有效坐标），跳过
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return c;

    // 读取容器原始 style 中的 padding（如果有）
    const style = (c.style || {}) as Record<string, any>;
    const padLeft = typeof style.paddingLeft === 'number' ? style.paddingLeft : DEFAULT_PADDING.left;
    const padTop = typeof style.paddingTop === 'number' ? style.paddingTop : DEFAULT_PADDING.top;
    const padRight = typeof style.paddingRight === 'number' ? style.paddingRight : DEFAULT_PADDING.right;
    const padBottom = typeof style.paddingBottom === 'number' ? style.paddingBottom : DEFAULT_PADDING.bottom;

    // 如果子节点在容器内的位置偏移了，调整容器位置和尺寸使之重新包裹
    // 策略：如果子节点左上角（minX, minY）不再等于 padding，
    // 我们通过移动所有子节点或调整容器来修复。
    // 最安全的方式：重新计算容器尺寸以包裹所有子节点
    const newWidth = (maxX - minX) + padLeft + padRight;
    const newHeight = (maxY - minY) + padTop + padBottom;

    // 子节点相对于容器左上角的期望偏移
    // 如果 minX != padLeft，说明子节点整体左移或右移了
    const driftX = minX - padLeft;
    const driftY = minY - padTop;

    // 通过移动容器来补偿漂移（而不是移动子节点，避免打断本地坐标）
    const newPos = {
      x: c.position.x + driftX,
      y: c.position.y + driftY,
    };

    // 同时调整所有子节点的本地坐标，消除漂移
    for (const child of children) {
      const updated = refinedById.get(child.id);
      if (updated) {
        updated.position = {
          x: updated.position.x - driftX,
          y: updated.position.y - driftY,
        };
      }
    }

    // 只在实际有变化时才更新容器
    const posChanged = Math.abs(newPos.x - c.position.x) > 0.5 || Math.abs(newPos.y - c.position.y) > 0.5;
    const sizeChanged = Math.abs(newWidth - (style.width || 0)) > 0.5 || Math.abs(newHeight - (style.height || 0)) > 0.5;

    if (!posChanged && !sizeChanged) return c;

    return {
      ...c,
      position: newPos,
      style: {
        ...style,
        width: Math.max(newWidth, style.width || 0),
        height: Math.max(newHeight, style.height || 0),
      },
    };
  });

  return [...refinedBusiness, ...adjustedContainers];
}

// ═══════════════════════════════════════════════════════════════
// 辅助工具：从节点数组中提取域分组
// ═══════════════════════════════════════════════════════════════

/**
 * 从布局结果节点中提取域分组信息
 *
 * 读取每个节点的 parentId，建立 groupId → nodeId[] 映射
 * 用于传给 refineLayout 的 nodeGroups 选项
 */
export function extractNodeGroups(nodes: Node[]): Map<string, string[]> {
  const containerTypes = new Set(['titleGroup', 'subGroup', 'domain', 'group']);
  const groups = new Map<string, string[]>();

  for (const n of nodes) {
    // 跳过容器节点自身
    if (containerTypes.has(n.type || '')) continue;

    const parentId = (n as any).parentId;
    if (!parentId) continue;

    if (!groups.has(parentId)) groups.set(parentId, []);
    groups.get(parentId)!.push(n.id);
  }

  return groups;
}
