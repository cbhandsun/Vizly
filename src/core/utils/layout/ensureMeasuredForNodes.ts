import type { Node as ReactFlowNode } from '@xyflow/react';

import { diagramConfigManager } from '../../config/DiagramConfig';
import { LayoutOptimizer } from '../../components/layout/LayoutOptimizer';

const GROUP_NODE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const finiteNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const nodeData = (node: ReactFlowNode): Record<string, unknown> => (
  isRecord(node.data) ? node.data : {}
);

const nodeWidth = (node: ReactFlowNode, fallback = 0): number => (
  finiteNumber(node.measured?.width ?? node.style?.width ?? node.width, fallback)
);

const nodeHeight = (node: ReactFlowNode, fallback = 0): number => (
  finiteNumber(node.measured?.height ?? node.style?.height ?? node.height, fallback)
);

/**
 * 函数级注释：确保业务节点 measured 就绪
 * 目标：为所有非容器节点补齐 `measured.width/height` 与 `style.width/height`，容器节点保持已有 `style/measured` 一致。
 * 规则：
 * - 非容器节点：优先读取 `data.description`，否则用 `label`；宽高使用 LayoutOptimizer 同步计算；
 * - 容器节点：若 `measured` 缺失，使用 `style.width/height` 或已知尺寸回填；
 * - 写回：`style.width/height` 与 `measured` 保持一致，方便后续布局与投影。
 */
export const ensureMeasuredForNodes = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const layoutCfg = diagramConfigManager.getLayoutConfig();
  const minW = finiteNumber(layoutCfg.NODE_MIN_WIDTH, 120);
  const opt = LayoutOptimizer.getInstance();
  const updated = nodes.map(n => ({
    ...n,
    ...(n.style ? { style: { ...n.style } } : {}),
    ...(n.measured ? { measured: { ...n.measured } } : {}),
  }));
  for (let i = 0; i < updated.length; i++) {
    const n = updated[i];
    const tp = String(n.type || '');
    if (GROUP_NODE_TYPES.has(tp)) {
      const w = nodeWidth(n);
      const h = nodeHeight(n);
      n.measured = { width: w, height: h };
      if (!n.style) n.style = {};
      if (finiteNumber(n.style.width, 0) <= 0) n.style.width = w;
      if (finiteNumber(n.style.height, 0) <= 0) n.style.height = h;
      continue;
    }
    const data = nodeData(n);
    const desc = String(data.description ?? data.label ?? '').trim();
    const wCalc = opt.calculateNodeWidth(desc);
    const hCalc = opt.calculateNodeHeight(desc);
    const w = Math.max(minW, finiteNumber(wCalc, minW));
    const h = Math.max(24, finiteNumber(hCalc, 60));
    if (!n.style) n.style = {};
    n.style.width = w; n.style.height = h;
    n.measured = { width: w, height: h };
  }
  return updated;
};
