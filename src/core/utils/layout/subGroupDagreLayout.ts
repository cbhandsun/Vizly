import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import dagre from 'dagre';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
);

const nestedValue = (source: unknown, ...keys: string[]): unknown => {
  let current: unknown = source;
  for (const key of keys) current = asRecord(current)[key];
  return current;
};

const firstDefined = (...values: unknown[]): unknown => (
  values.find(value => value !== undefined && value !== null)
);

const boundedNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const coordinate = (value: unknown, fallback = 0): number => (
  boundedNumber(value, fallback, -100_000, 100_000)
);

const dimension = (value: unknown, fallback: number): number => (
  boundedNumber(value, fallback, 1, 100_000)
);

const spacing = (value: unknown, fallback: number): number => (
  boundedNumber(value, fallback, 0, 10_000)
);

const cloneNode = (node: ReactFlowNode): ReactFlowNode => ({
  ...node,
  position: {
    x: coordinate(node.position?.x),
    y: coordinate(node.position?.y),
  },
  data: node.data ? { ...node.data } : {},
  style: node.style ? { ...node.style } : node.style,
  measured: node.measured
    ? {
      width: dimension(node.measured.width, 1),
      height: dimension(node.measured.height, 1),
    }
    : node.measured,
});

const semanticOrder = (node: ReactFlowNode): number | null => {
  const data = asRecord(node.data);
  const raw = data.sequence ?? data.order;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const edgeType = (edge: Edge): string => String(
  edge.type || asRecord(edge.data).type || 'main',
).toLowerCase();

const edgeLabel = (edge: Edge): string => {
  if (typeof edge.label === 'string') return edge.label;
  const label = asRecord(edge.data).label;
  return typeof label === 'string' ? label : '';
};

export interface SubGroupDagreLogger {
  debug?: (...args: unknown[]) => void;
}

export interface SubGroupDagreOptions {
  logger?: SubGroupDagreLogger;
  now?: () => number;
}

interface DagreMetrics {
  horizontalPadding: number;
  titleHeight: number;
  titlePadding: number;
  topPadding: number;
  bottomPadding: number;
  safeGap: number;
  defaultNodeWidth: number;
  defaultNodeHeight: number;
  nodeSeparation: number;
  rankSeparation: number;
}

const resolveMetrics = (layoutConfig: unknown, config: unknown): DagreMetrics => ({
  horizontalPadding: spacing(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'horizontal'),
    nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
  ), 24),
  titleHeight: spacing(nestedValue(config, 'subDomain', 'title', 'height'), 48),
  titlePadding: spacing(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    8,
  ),
  topPadding: spacing(nestedValue(config, 'subDomain', 'padding', 'top'), 12),
  bottomPadding: spacing(nestedValue(config, 'subDomain', 'padding', 'bottom'), 12),
  safeGap: Math.max(
    8,
    spacing(nestedValue(config, 'subDomain', 'title', 'safeGap'), 8),
  ),
  defaultNodeWidth: dimension(nestedValue(config, 'node', 'width'), 240),
  defaultNodeHeight: dimension(nestedValue(config, 'node', 'height'), 100),
  nodeSeparation: Math.max(
    80,
    spacing(nestedValue(layoutConfig, 'NODE_SEP'), 80),
  ),
  rankSeparation: Math.max(
    120,
    spacing(nestedValue(layoutConfig, 'RANK_SEP'), 120),
  ),
});

const nodeWidth = (node: ReactFlowNode, metrics: DagreMetrics): number => dimension(
  node.measured?.width ?? node.style?.width ?? node.width,
  metrics.defaultNodeWidth,
);

const nodeHeight = (node: ReactFlowNode, metrics: DagreMetrics): number => dimension(
  node.measured?.height ?? node.style?.height ?? node.height,
  metrics.defaultNodeHeight,
);

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const reflowSubGroupChildrenDagreWithConfig = (
  subGroupInput: ReactFlowNode,
  nodeInputs: ReactFlowNode[],
  requestedHorizontalGap: unknown,
  _requestedVerticalGap: unknown,
  globalEdges: Edge[],
  requestedDirection: unknown,
  layoutConfig: unknown,
  config: unknown,
  options: SubGroupDagreOptions = {},
): ReactFlowNode[] => {
  const subGroup = cloneNode(subGroupInput);
  if (!nodeInputs.length) return [subGroup];

  const metrics = resolveMetrics(layoutConfig, config);
  const direction = requestedDirection === 'LR' ? 'LR' : 'TB';
  const horizontalGap = Math.max(30, spacing(requestedHorizontalGap, 30));
  const logger = options.logger;
  const sorted = nodeInputs
    .map((node, index) => ({ node: cloneNode(node), index }))
    .sort((a, b) => {
      const aOrder = semanticOrder(a.node);
      const bOrder = semanticOrder(b.node);
      if (aOrder !== null && bOrder !== null) return aOrder - bOrder || a.index - b.index;
      if (aOrder !== null) return -1;
      if (bOrder !== null) return 1;
      return a.index - b.index;
    })
    .map(entry => entry.node);
  const nodeById = new Map(sorted.map(node => [node.id, node]));
  const nodeIds = new Set(nodeById.keys());
  const internalEdges = (Array.isArray(globalEdges) ? globalEdges : []).filter(edge => (
    typeof edge?.source === 'string'
    && typeof edge?.target === 'string'
    && nodeIds.has(edge.source)
    && nodeIds.has(edge.target)
  ));
  const description = String(asRecord(subGroup.data).description || subGroup.id);
  logger?.debug?.(
    `[DAGRE-EDGES] 子域="${description}" 节点数=${sorted.length} 内部边数=${internalEdges.length}`,
  );
  if (internalEdges.length) {
    logger?.debug?.(
      '[DAGRE-EDGES] 边详情:',
      internalEdges.map(edge => `${edge.source} → ${edge.target}`).join(', '),
    );
  }

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: direction,
    nodesep: metrics.nodeSeparation,
    ranksep: metrics.rankSeparation,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  const nodePadding = 60;
  logger?.debug?.(
    `[DAGRE-TRACE] === 开始 Dagre 布局 === direction=${direction} nodes=${sorted.length} padding=${nodePadding}`,
  );
  for (const node of sorted) {
    const width = nodeWidth(node, metrics);
    const height = nodeHeight(node, metrics);
    graph.setNode(node.id, {
      width: width + nodePadding,
      height: Math.max(height * 1.3, height + nodePadding),
    });
  }

  const mainEdges = internalEdges.filter(edge => edgeType(edge) === 'main');
  const shortCircuitEdges = internalEdges.filter(edge => edgeType(edge) !== 'main');
  logger?.debug?.(
    `[DAGRE-EDGES] 主干边(影响rank)=${mainEdges.length}, 短路边(仅视觉)=${shortCircuitEdges.length}`,
  );
  if (shortCircuitEdges.length) {
    logger?.debug?.(
      '[DAGRE-EDGES] 忽略短路边:',
      shortCircuitEdges
        .map(edge => `${edge.source}→${edge.target}(${edge.type})`)
        .join(', '),
    );
  }
  for (const edge of mainEdges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    const label = edgeLabel(edge);
    graph.setEdge(edge.source, edge.target, label
      ? { width: Math.max(40, label.length * 14), height: 20, labelpos: 'c' }
      : {});
  }

  const connectedIds = new Set<string>();
  for (const edge of internalEdges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }
  const isolatedNodes = sorted.filter(node => !connectedIds.has(node.id));
  const connectedNodes = sorted.filter(node => connectedIds.has(node.id));
  if (!mainEdges.length && sorted.length > 1) {
    for (let index = 0; index < sorted.length - 1; index += 1) {
      graph.setEdge(sorted[index].id, sorted[index + 1].id);
    }
  } else if (connectedNodes.length && isolatedNodes.length) {
    for (const node of isolatedNodes) graph.removeNode(node.id);
  }

  dagre.layout(graph);
  if (internalEdges.length) {
    const ranks = sorted.flatMap(node => {
      const positioned = graph.node(node.id);
      return positioned
        ? [{
          id: node.id.replace(/^wms-/, '').substring(0, 15),
          rank: (positioned as typeof positioned & { rank?: number }).rank ?? -1,
          x: Math.round(positioned.x),
          y: Math.round(positioned.y),
        }]
        : [];
    });
    logger?.debug?.(
      `[DAGRE-RANKS] 子域="${description}" 节点分层:`,
      ranks
        .sort((a, b) => a.y - b.y)
        .map(rank => `${rank.id}(rank=${rank.rank},y=${rank.y})`)
        .join(' → '),
    );
  }

  const positions: PositionedNode[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const includePosition = (position: PositionedNode) => {
    positions.push(position);
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + position.width);
    maxY = Math.max(maxY, position.y + position.height);
  };
  logger?.debug?.('[DAGRE-TRACE] === Dagre 计算完成，收集位置 ===');
  for (const node of connectedNodes) {
    const positioned = graph.node(node.id);
    if (!positioned) continue;
    const width = nodeWidth(node, metrics);
    const height = nodeHeight(node, metrics);
    includePosition({
      id: node.id,
      x: positioned.x - width / 2,
      y: positioned.y - height / 2,
      width,
      height,
    });
  }

  if (isolatedNodes.length) {
    const isolatedGap = Math.min(50, metrics.rankSeparation / 2);
    const startY = positions.length ? maxY + isolatedGap : 0;
    if (!positions.length) {
      minX = 0;
      minY = 0;
      maxX = 0;
      maxY = 0;
    }
    const graphCenterX = minX + (maxX - minX) / 2;
    if (direction === 'LR') {
      const totalWidth = isolatedNodes.reduce(
        (sum, node, index) => (
          sum + nodeWidth(node, metrics) + (index ? isolatedGap : 0)
        ),
        0,
      );
      let currentX = graphCenterX - totalWidth / 2;
      for (const node of isolatedNodes) {
        const width = nodeWidth(node, metrics);
        const height = nodeHeight(node, metrics);
        includePosition({ id: node.id, x: currentX, y: startY, width, height });
        currentX += width + isolatedGap;
      }
    } else {
      let currentY = startY;
      for (const node of isolatedNodes) {
        const width = nodeWidth(node, metrics);
        const height = nodeHeight(node, metrics);
        includePosition({
          id: node.id,
          x: graphCenterX - width / 2,
          y: currentY,
          width,
          height,
        });
        currentY += height + isolatedGap;
      }
    }
  }
  if (!positions.length) {
    minX = 0;
    minY = 0;
  }

  const innerTop = (
    subGroup.position.y
    + metrics.titleHeight
    + metrics.titlePadding
    + metrics.topPadding
    + metrics.safeGap
  );
  const innerLeft = subGroup.position.x + metrics.horizontalPadding;
  const offsetX = innerLeft - minX;
  const offsetY = innerTop - minY;
  for (const position of positions) {
    const node = nodeById.get(position.id);
    if (!node) continue;
    node.position = {
      x: Math.round(position.x + offsetX),
      y: Math.round(position.y + offsetY),
    };
  }

  const averageHeight = sorted.reduce(
    (sum, node) => sum + nodeHeight(node, metrics),
    0,
  ) / sorted.length;
  const rowThreshold = Math.max(50, averageHeight * 0.6);
  const rows: ReactFlowNode[][] = [];
  for (const node of sorted.slice().sort((a, b) => a.position.y - b.position.y)) {
    const row = rows.at(-1);
    if (!row || Math.abs(node.position.y - row[0].position.y) > rowThreshold) {
      rows.push([node]);
    } else {
      row.push(node);
    }
  }
  for (let iteration = 0; iteration < 3; iteration += 1) {
    for (const row of rows) {
      row.sort((a, b) => a.position.x - b.position.x);
      for (let index = 1; index < row.length; index += 1) {
        const previous = row[index - 1];
        const current = row[index];
        const minimumX = previous.position.x + nodeWidth(previous, metrics) + horizontalGap;
        if (current.position.x < minimumX) {
          current.position = { x: Math.round(minimumX), y: current.position.y };
        }
      }
    }
  }

  minX = Number.POSITIVE_INFINITY;
  minY = Number.POSITIVE_INFINITY;
  maxX = Number.NEGATIVE_INFINITY;
  maxY = Number.NEGATIVE_INFINITY;
  let relativeMinimumY = Number.POSITIVE_INFINITY;
  let relativeMaximumY = Number.NEGATIVE_INFINITY;
  for (const node of sorted) {
    const width = nodeWidth(node, metrics);
    const height = nodeHeight(node, metrics);
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
    const relativeX = Math.round(node.position.x - innerLeft);
    const relativeY = Math.round(node.position.y - innerTop);
    node.data = { ...node.data, __dagreRel: { x: relativeX, y: relativeY } };
    relativeMinimumY = Math.min(relativeMinimumY, relativeY);
    relativeMaximumY = Math.max(relativeMaximumY, relativeY + height);
  }

  const contentWidth = maxX - minX;
  const contentHeight = relativeMaximumY - Math.min(0, relativeMinimumY);
  const width = Math.round(contentWidth + metrics.horizontalPadding * 2);
  const height = Math.round(
    contentHeight
    + metrics.titleHeight
    + metrics.titlePadding
    + metrics.topPadding
    + metrics.safeGap
    + metrics.bottomPadding,
  );
  const contentBottom = subGroup.position.y + height - metrics.bottomPadding;
  const overflow = maxY - contentBottom;
  if (overflow > 0) {
    logger?.debug?.(
      `[OVERFLOW] "${description}" | container: y=${Math.round(subGroup.position.y)}→${Math.round(subGroup.position.y + height)} (h=${height}) | content: y=${Math.round(innerTop)}→${Math.round(contentBottom)} | lastNode: y=${Math.round(maxY)} | overflow=${Math.round(overflow)}px`,
    );
  }
  subGroup.style = { ...subGroup.style, width, height };
  subGroup.measured = { width, height };
  subGroup.width = width;
  subGroup.height = height;
  subGroup.data = {
    ...subGroup.data,
    __dagreSized: { w: width, h: height, ts: (options.now || Date.now)() },
  };

  return [subGroup, ...sorted];
};
