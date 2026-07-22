 
/**
 * @file 最终几何包含保障
 * @description 管线末端的域容器溢出检测 + 自动扩展 + 域宽统一。
 *   从 DomainVerticalLayoutStrategy 提取，可被所有域布局策略复用。
 */
import type { Node as ReactFlowNode } from '@xyflow/react';

const finiteNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const positionOf = (node: ReactFlowNode): { x: number; y: number } => ({
  x: finiteNumber(node.position?.x, 0),
  y: finiteNumber(node.position?.y, 0),
});

const widthOf = (node: ReactFlowNode): number => (
  finiteNumber(node.measured?.width ?? node.style?.width ?? node.width, 0)
);

const heightOf = (node: ReactFlowNode): number => (
  finiteNumber(node.measured?.height ?? node.style?.height ?? node.height, 0)
);

const writeSize = (node: ReactFlowNode, width: number, height: number): void => {
  node.style = { ...(node.style ?? {}), width };
  node.measured = { width, height };
  node.width = width;
};

/**
 * 确保所有子元素都包含在域容器内
 * - 检测子域容器和普通节点是否溢出域容器右边界
 * - 自动扩展溢出的域容器宽度
 * - 扩展后统一所有域容器的宽度
 * @param nodes 所有节点
 * @param padH 安全 padding，默认 30px
 */
export function ensureDomainContainment(nodes: ReactFlowNode[], padH: number = 30): ReactFlowNode[] {
  const titleGroups = nodes.filter(n => String(n.type || '') === 'titleGroup');
  const subGroups = nodes.filter(n => String(n.type || '') === 'subGroup');

  if (titleGroups.length === 0 || subGroups.length === 0) return nodes;

  let anyExpanded = false;

  for (const tg of titleGroups) {
    const { x: tgX, y: tgY } = positionOf(tg);
    const tgW = widthOf(tg);
    const tgH = heightOf(tg);
    const tgRight = tgX + tgW;
    const tgBottom = tgY + tgH;

    let maxChildRight = -Infinity;

    for (const sg of subGroups) {
      const { x: sgX, y: sgY } = positionOf(sg);
      const sgW = widthOf(sg);
      const sgCenterY = sgY + heightOf(sg) / 2;

      // 几何包含判定：subGroup 的 Y 中心在 titleGroup 的 Y 范围内
      if (sgCenterY >= tgY && sgCenterY <= tgBottom && sgX >= tgX - 10) {
        maxChildRight = Math.max(maxChildRight, sgX + sgW);
      }
    }

    // 也检查普通节点（非容器）是否溢出
    for (const n of nodes) {
      const tp = String(n.type || '');
      if (tp === 'titleGroup' || tp === 'subGroup') continue;
      const { x: nX, y: nY } = positionOf(n);
      const nW = widthOf(n);
      const nH = heightOf(n);
      const nCenterY = nY + nH / 2;
      if (nCenterY >= tgY && nCenterY <= tgBottom && nX >= tgX - 10) {
        maxChildRight = Math.max(maxChildRight, nX + nW);
      }
    }

    if (Number.isFinite(maxChildRight) && maxChildRight > tgRight) {
      const newW = Math.max(tgW, maxChildRight - tgX + padH);
      writeSize(tg, newW, tgH);
      anyExpanded = true;
    }
  }

  // 如果有域被扩展，重新统一所有域宽
  if (anyExpanded) {
    const maxW = Math.max(...titleGroups.map(widthOf));
    if (Number.isFinite(maxW) && maxW > 0) {
      for (const tg of titleGroups) {
        writeSize(tg, maxW, heightOf(tg));
      }
    }
  }

  return nodes;
}
