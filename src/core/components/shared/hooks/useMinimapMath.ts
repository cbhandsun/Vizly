import { extractValidNumber } from '../../../utils/nodeValidation';

export interface MinimapBounds {
  unionMinX: number;
  unionMinY: number;
  unionMaxX: number;
  unionMaxY: number;
  totalWidth: number;
  totalHeight: number;
}

/**
 * 安全数值验证函数，确保数值有效性
 * @param value - 待验证的数值
 * @param defaultValue - 默认值
 * @returns 有效的数值
 */
export const safeNumber = (value: any, defaultValue: number = 0): number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value) ? value : defaultValue;
};

/**
 * 计算 minimap 使用的统一世界坐标边界（内容 ∪ 视口）
 * 确保渲染、点击导航、拖动导航三者使用完全一致的坐标基准
 */
export const computeMinimapBounds = (
  nodes: any[],
  viewport: { x: number; y: number; zoom: number },
  visiblePixelWidth: number,
  visiblePixelHeight: number
): MinimapBounds | null => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Build lookup map for parentId chain traversal
  const nodeMap = new Map<string, any>();
  nodes.forEach(n => nodeMap.set(n.id, n));

  // Compute absolute position by walking the parentId chain.
  // internals.positionAbsolute is unavailable here (external API returns relative positions).
  const getAbsPos = (node: any): { x: number; y: number } => {
    let x = safeNumber(node.position?.x, 0);
    let y = safeNumber(node.position?.y, 0);
    let curr = node;
    let guard = 0;
    while (curr.parentId && guard++ < 20) {
      const parent = nodeMap.get(curr.parentId);
      if (!parent) break;
      x += safeNumber(parent.position?.x, 0);
      y += safeNumber(parent.position?.y, 0);
      curr = parent;
    }
    return { x, y };
  };

  nodes.forEach((n) => {
    const abs = getAbsPos(n);
    const w = extractValidNumber(n.measured?.width ?? n.width ?? n.style?.width, 200);
    const h = extractValidNumber(n.measured?.height ?? n.height ?? n.style?.height, 100);
    if (isFinite(abs.x) && isFinite(abs.y) && w > 0 && h > 0) {
      minX = Math.min(minX, abs.x);
      minY = Math.min(minY, abs.y);
      maxX = Math.max(maxX, abs.x + w);
      maxY = Math.max(maxY, abs.y + h);
    }
  });
  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) return null;

  const zoom = safeNumber(viewport.zoom, 1);
  const vxWorld = -safeNumber(viewport.x, 0) / zoom;
  const vyWorld = -safeNumber(viewport.y, 0) / zoom;
  const vWidthWorld = visiblePixelWidth / zoom;
  const vHeightWorld = visiblePixelHeight / zoom;

  const unionMinX = Math.min(minX, vxWorld);
  const unionMinY = Math.min(minY, vyWorld);
  const unionMaxX = Math.max(maxX, vxWorld + vWidthWorld);
  const unionMaxY = Math.max(maxY, vyWorld + vHeightWorld);
  const totalWidth = Math.max(1, safeNumber(unionMaxX - unionMinX, 1));
  const totalHeight = Math.max(1, safeNumber(unionMaxY - unionMinY, 1));

  return { unionMinX, unionMinY, unionMaxX, unionMaxY, totalWidth, totalHeight };
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
