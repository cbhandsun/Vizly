import { LayoutOptions } from '../../types/layout';
import { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { Position } from '../../types/common';

/**
 * @file 统一布局工具函数
 * @description 整合所有图表的布局计算逻辑，避免重复代码
 */

/**
 * @param nodes 要布局的元素数组
 * @param edges 边数组
 * @param options 布局选项
 * @returns {{ positions: Position[], nodeRanks: Map<string, number> }} 返回一个包含节点位置数组和节点层级 Map 的对象
 */
export function calculateHierarchicalLayout(
  nodes: ReactFlowNode[],
  edges: Edge[],
  options: LayoutOptions
): { positions: Position[]; nodeRanks: Map<string, number> } {
  const {
    spacing = { horizontal: 200, vertical: 150 },
    padding = { top: 100, right: 50, bottom: 50, left: 50 },
    itemSize = { width: 280, height: 120 },
  } = options;

  /**
   * 函数级注释：层次布局方向推断与应用
   * - 若提供 `options.direction`，按该方向布置层次（TB/BT/LR/RL）；
   * - 若开启 `options.autoDirection` 且未提供显式方向，依据图结构与容器尺寸智能选择：
   *   1) 层数较多（>=3）且每层节点较少（平均<=3）→ 采用 TB（上下层次）以减少宽度；
   *   2) 层数较少（<=2）且每层节点较多（平均>=4）→ 采用 LR（左右层次）以减少高度；
   *   3) 容器宽高比（width/height）> 1.2 倾向 LR；< 0.8 倾向 TB；
   *   4) 若边数量密集且扇出/扇入显著（一对多/多对一）则倾向 LR，便于水平层容纳更多节点。
   */
  const decideDirection = (levels: string[][]): 'TB' | 'BT' | 'LR' | 'RL' => {
    return decideHierDirectionByFan(nodes, edges, { ...options, levels });
  };

  // 构建层次结构
  const levels = buildHierarchy(nodes, edges);
  const positions: Position[] = new Array(nodes.length);
  const nodeMap = new Map(nodes.map((node, index) => [node.id, index]));
  const nodeRanks = new Map<string, number>();
  levels.forEach((level, rank) => {
    level.forEach(nodeId => {
      nodeRanks.set(nodeId, rank);
    });
  });

  const dir = decideDirection(levels);
  if (dir === 'TB' || dir === 'BT') {
    const isBottomToTop = dir === 'BT';
    const levelSeq = isBottomToTop ? [...levels].reverse() : levels;
    levelSeq.forEach((levelNodes, index) => {
      const levelY = padding.top + index * (itemSize.height + spacing.vertical);
      const levelWidth = levelNodes.length * itemSize.width + (levelNodes.length - 1) * spacing.horizontal;
      const containerWidth = options.containerSize?.width ?? 1200;
      const startX = padding.left + (containerWidth - levelWidth) / 2;
      levelNodes.forEach((nodeId, posIndex) => {
        const nodeIndex = nodeMap.get(nodeId);
        if (nodeIndex !== undefined) {
          const x = startX + posIndex * (itemSize.width + spacing.horizontal);
          positions[nodeIndex] = { x, y: levelY };
        }
      });
    });
  } else {
    // LR/RL：水平层次（按层在 X 轴推进，层内垂直堆叠）
    const isRightToLeft = dir === 'RL';
    const levelSeq = isRightToLeft ? [...levels].reverse() : levels;
    levelSeq.forEach((levelNodes, index) => {
      const levelX = padding.left + index * (itemSize.width + spacing.horizontal);
      const levelHeight = levelNodes.length * itemSize.height + (levelNodes.length - 1) * spacing.vertical;
      const containerHeight = options.containerSize?.height ?? 800;
      const startY = padding.top + (containerHeight - levelHeight) / 2;
      levelNodes.forEach((nodeId, posIndex) => {
        const nodeIndex = nodeMap.get(nodeId);
        if (nodeIndex !== undefined) {
          const y = startY + posIndex * (itemSize.height + spacing.vertical);
          positions[nodeIndex] = { x: levelX, y };
        }
      });
    });
  }

  /**
   * 函数级注释：同点坐标散列（一对多/多对一）
   * - 目的：当分层结果出现多个节点落在完全相同坐标时，沿轴向均匀展开以避免重叠；
   * - 规则：TB/BT 方向沿 X 轴散列（间距取 horizontal）；LR/RL 方向沿 Y 轴散列（间距取 vertical）。
   */
  try {
    const axis: 'x' | 'y' = (dir === 'TB' || dir === 'BT') ? 'x' : 'y';
    const gap = axis === 'x' ? Math.max(12, spacing.horizontal) : Math.max(12, spacing.vertical);
    const tol = 2;
    const keyOf = (p: Position) => `${Math.round((p.x || 0) / Math.max(1, tol))}:${Math.round((p.y || 0) / Math.max(1, tol))}`;
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const k = keyOf(p);
      const arr = buckets.get(k) || [];
      arr.push(i); buckets.set(k, arr);
    }
    buckets.forEach((idxs) => {
      if (idxs.length <= 1) return;
      const pivot = positions[idxs[0]];
      const ordered = idxs.slice().sort((a, b) => a - b);
      const half = Math.floor(ordered.length / 2);
      for (let i = 0; i < ordered.length; i++) {
        const offset = (i - half) * gap;
        const cur = positions[ordered[i]];
        if (axis === 'x') positions[ordered[i]] = { x: Math.round(pivot.x + offset), y: Math.round(cur.y) };
        else positions[ordered[i]] = { x: Math.round(cur.x), y: Math.round(pivot.y + offset) };
      }
    });
  } catch {
    // ignore
  }

  // 为没有位置的节点（可能因为是孤立节点或循环依赖）提供一个默认位置
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i]) {
      positions[i] = { x: padding.left, y: padding.top };
    }
  }

  return { positions, nodeRanks };
}

/**
 * 决策分层方向（函数级注释）
 * - 依据容器宽高比、层数与平均每层节点数、扇出/扇入评分，综合选择 TB/BT/LR/RL；
 * - 当显式传入 direction 时直接返回；开启 autoDirection 且未传方向时进行智能选择；
 * - 支持从 levels 作为外部已计算层信息以避免重复构建；否则内部调用 buildHierarchy。
 */

/**
 * 决策分层方向（函数级注释）
 * - 依据容器宽高比、层数与平均每层节点数、扇出/扇入评分，综合选择 TB/BT/LR/RL；
 * - 当显式传入 direction 时直接返回；开启 autoDirection 且未传方向时进行智能选择；
 * - 支持从 levels 作为外部已计算层信息以避免重复构建；否则内部调用 buildHierarchy。
 */
export function decideHierDirectionByFan(
  nodes: ReactFlowNode[],
  edges: Edge[],
  options: LayoutOptions & { levels?: string[][] }
): 'TB' | 'BT' | 'LR' | 'RL' {
  const explicit = options.direction;
  if (explicit === 'TB' || explicit === 'BT' || explicit === 'LR' || explicit === 'RL') return explicit;
  if (!options.autoDirection) return 'TB';
  const { spacing = { horizontal: 200, vertical: 150 }, padding = { top: 100, right: 50, bottom: 50, left: 50 }, itemSize = { width: 280, height: 120 } } = options;
  const levels = Array.isArray(options.levels) ? (options.levels as string[][]) : buildHierarchy(nodes, edges);
  const containerWidth = options.containerSize?.width ?? 1200;
  const containerHeight = options.containerSize?.height ?? 800;
  const aspect = containerWidth / Math.max(1, containerHeight);
  const levelCount = levels.length;
  const avgPerLevel = levelCount ? (nodes.length / levelCount) : nodes.length;
  const edgeCount = edges.length;
  const h = options.autoDirectionHeuristics || {};
  const thrLR = typeof h.aspectThresholdLR === 'number' ? h.aspectThresholdLR : 1.2;
  const thrTB = typeof h.aspectThresholdTB === 'number' ? h.aspectThresholdTB : 0.8;
  const minLvlTB = typeof h.minLevelCountTB === 'number' ? h.minLevelCountTB : 3;
  const minAvgLR = typeof h.minAvgPerLevelLR === 'number' ? h.minAvgPerLevelLR : 4;
  const fanOutDeg = typeof h.fanOutDegree === 'number' ? h.fanOutDegree : 3;
  const fanInDeg = typeof h.fanInDegree === 'number' ? h.fanInDegree : 3;
  const fanScoreThr = typeof h.fanScoreThreshold === 'number' ? h.fanScoreThreshold : 0.2;
  let fanScore = 0;
  try {
    const outDeg: Record<string, number> = {};
    const inDeg: Record<string, number> = {};
    for (const n of nodes) { outDeg[n.id] = 0; inDeg[n.id] = 0; }
    for (const e of edges) { outDeg[e.source] = (outDeg[e.source] || 0) + 1; inDeg[e.target] = (inDeg[e.target] || 0) + 1; }
    const highOut = Object.values(outDeg).filter(v => v >= fanOutDeg).length;
    const highIn = Object.values(inDeg).filter(v => v >= fanInDeg).length;
    fanScore = (highOut + highIn) / Math.max(1, nodes.length);
  } catch {
    // ignore
  }
  const estimateBoundsTB = () => {
    const levelWidths = levels.map(levelNodes => levelNodes.length * itemSize.width + Math.max(0, levelNodes.length - 1) * spacing.horizontal);
    const width = Math.max(...levelWidths, 0) + (padding.left + (options.padding?.right ?? 0));
    const height = levelCount * (itemSize.height + spacing.vertical) + (padding.top + (options.padding?.bottom ?? 0));
    return { width, height };
  };
  const estimateBoundsLR = () => {
    const levelHeights = levels.map(levelNodes => levelNodes.length * itemSize.height + Math.max(0, levelNodes.length - 1) * spacing.vertical);
    const height = Math.max(...levelHeights, 0) + (padding.top + (options.padding?.bottom ?? 0));
    const width = levelCount * (itemSize.width + spacing.horizontal) + (padding.left + (options.padding?.right ?? 0));
    return { width, height };
  };
  const tb = estimateBoundsTB();
  const lr = estimateBoundsLR();

  const weights = {
    area: typeof h.areaWeight === 'number' ? h.areaWeight : 0.55,
    fan: typeof h.fanWeight === 'number' ? h.fanWeight : 0.25,
    density: typeof h.densityWeight === 'number' ? h.densityWeight : 0.10,
    imbalance: typeof h.imbalanceWeight === 'number' ? h.imbalanceWeight : 0.10,
  };
  const norm = (v: number, base: number) => v / Math.max(1, base);
  const areaTB = tb.width * tb.height;
  const areaLR = lr.width * lr.height;
  const baseArea = Math.max(areaTB, areaLR);
  const normAreaTB = norm(areaTB, baseArea);
  const normAreaLR = norm(areaLR, baseArea);
  const maxPerLevel = Math.max(...levels.map(l => l.length), 1);
  const imbalanceTB = norm(maxPerLevel, avgPerLevel + 1);
  const imbalanceLR = imbalanceTB;
  const density = edgeCount / Math.max(1, nodes.length);
  const fanPenaltyTB = fanScore; // TB 更受最大行节点数影响
  const fanPenaltyLR = fanScore * 0.85; // LR 对扇出稍更友好
  const scoreTB = weights.area * normAreaTB + weights.fan * fanPenaltyTB + weights.density * density + weights.imbalance * imbalanceTB;
  const scoreLR = weights.area * normAreaLR + weights.fan * fanPenaltyLR + weights.density * density + weights.imbalance * imbalanceLR;

  let candidate: 'TB' | 'LR' = scoreLR < scoreTB ? 'LR' : 'TB';
  if (aspect > thrLR && avgPerLevel >= 3) candidate = 'LR';
  if (aspect < thrTB && levelCount >= minLvlTB) candidate = 'TB';
  if (levelCount <= 2 && avgPerLevel >= minAvgLR) candidate = 'LR';
  if (fanScore > fanScoreThr && edgeCount >= nodes.length) candidate = 'LR';

  const pref = options.compactPreference as ('width' | 'height' | undefined);
  if (pref) {
    if (pref === 'width') candidate = (lr.width < tb.width) ? 'LR' : 'TB';
    else candidate = (tb.height < lr.height) ? 'TB' : 'LR';
  }
  return candidate;
}



// 构建层次结构




// 构建层次结构
function buildHierarchy(nodes: ReactFlowNode[], edges: Edge[]): string[][] {
  if (!nodes.length) return [];

  const levels: string[][] = [];
  const visited = new Set<string>();
  const inDegrees = new Map<string, number>();
  const adj = new Map<string, string[]>();

  nodes.forEach(node => {
    inDegrees.set(node.id, 0);
    adj.set(node.id, []);
  });

  // 计算入度和构建邻接表
  edges.forEach(edge => {
    inDegrees.set(edge.target, (inDegrees.get(edge.target) || 0) + 1);
    adj.get(edge.source)?.push(edge.target);
  });

  // 找到根节点（入度为 0 的节点）
  const roots = nodes
    .map(node => node.id)
    .filter(id => inDegrees.get(id) === 0);

  if (roots.length === 0 && nodes.length > 0) {
    // 如果没有根节点（可能存在循环），选择第一个节点作为根
    roots.push(nodes[0].id);
  }

  // BFS遍历构建层次
  let currentLevel = [...roots];

  while (currentLevel.length > 0) {
    levels.push([...currentLevel]);
    currentLevel.forEach(nodeId => visited.add(nodeId));

    const nextLevel: string[] = [];

    currentLevel.forEach(nodeId => {
      adj.get(nodeId)?.forEach(targetId => {
        if (!visited.has(targetId)) {
          nextLevel.push(targetId);
        }
      });
    });

    // 去重
    currentLevel = [...new Set(nextLevel)];
  }

  // 处理未访问的节点（可能是独立的子图或循环的一部分）
  const unvisited = nodes
    .map(node => node.id)
    .filter(id => !visited.has(id));

  if (unvisited.length > 0) {
    levels.push(unvisited);
  }

  return levels;
}





// 检测线段是否与矩形相交
