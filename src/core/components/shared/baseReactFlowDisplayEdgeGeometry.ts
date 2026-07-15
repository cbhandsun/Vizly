import type { Edge, Node } from '@xyflow/react';

import { expandHandle } from '../../routing/utils/handleUtils';
import { isFinitePoint } from './baseReactFlowDisplayCache';

export type NodeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnchorSide = 'left' | 'right' | 'top' | 'bottom';

export const isVerticalHandle = (handle?: string | null) => {
  const s = String(handle || '').toLowerCase();
  return s === 'top' || s === 'bottom' || s === 't' || s === 'b';
};

export const getNodeX = (node: Node | undefined) => {
  const pos = (node as any)?.positionAbsolute ?? node?.position ?? { x: 0 };
  return Number(pos.x || 0);
};

const getNodePosition = (
  node: Node | undefined,
  nodeById?: Map<string, Node>,
): { x: number; y: number } | null => {
  if (!node) return null;
  const hasAbsolutePosition = Boolean((node as any).positionAbsolute);
  const pos = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  let x = Number(pos.x || 0);
  let y = Number(pos.y || 0);
  if (!hasAbsolutePosition && nodeById) {
    const visited = new Set<string>();
    let parentId = (node as any).parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nodeById.get(parentId);
      if (!parent) break;
      const parentHasAbsolutePosition = Boolean((parent as any).positionAbsolute);
      const parentPos = (parent as any).positionAbsolute ?? parent.position ?? { x: 0, y: 0 };
      x += Number(parentPos.x || 0);
      y += Number(parentPos.y || 0);
      if (parentHasAbsolutePosition) break;
      parentId = (parent as any).parentId;
    }
  }
  return { x, y };
};

export const getNodeRect = (node: Node | undefined, nodeById?: Map<string, Node>): NodeRect | null => {
  const pos = getNodePosition(node, nodeById);
  if (!node || !pos) return null;
  const width = (node as any).measured?.width ?? node.width ?? (node.style as any)?.width ?? 0;
  const height = (node as any).measured?.height ?? node.height ?? (node.style as any)?.height ?? 0;
  return {
    x: pos.x,
    y: pos.y,
    width: Number(width || 0),
    height: Number(height || 0),
  };
};

export const anchorForHandle = (rect: NodeRect, handle?: string | null) => {
  const h = (expandHandle(String(handle || '')) || '').toLowerCase();
  if (h === 'left') return { x: rect.x, y: rect.y + rect.height / 2 };
  if (h === 'right') return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  if (h === 'top') return { x: rect.x + rect.width / 2, y: rect.y };
  if (h === 'bottom') return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

export const sideForHandle = (handle?: string | null): AnchorSide | null => {
  const h = (expandHandle(String(handle || '')) || '').toLowerCase();
  if (h === 'left' || h === 'right' || h === 'top' || h === 'bottom') return h as AnchorSide;
  return null;
};

const autoAnchorSide = (sourceRect: NodeRect, targetRect: NodeRect): { source: AnchorSide; target: AnchorSide } => {
  const sourceCenter = {
    x: sourceRect.x + sourceRect.width / 2,
    y: sourceRect.y + sourceRect.height / 2,
  };
  const targetCenter = {
    x: targetRect.x + targetRect.width / 2,
    y: targetRect.y + targetRect.height / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) > Math.abs(dy) * 0.45) {
    return dx >= 0
      ? { source: 'right', target: 'left' }
      : { source: 'left', target: 'right' };
  }

  return dy >= 0
    ? { source: 'bottom', target: 'top' }
    : { source: 'top', target: 'bottom' };
};

export const compactOrthogonalPath = (path: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> => {
  const deduped = path.filter((point, index) => {
    if (index === 0) return true;
    const prev = path[index - 1];
    return Math.abs(point.x - prev.x) > 0.5 || Math.abs(point.y - prev.y) > 0.5;
  });
  if (deduped.length < 3) return deduped;
  const compacted: Array<{ x: number; y: number }> = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const prev = compacted[compacted.length - 1];
    const point = deduped[index];
    const next = deduped[index + 1];
    const sameX = Math.abs(prev.x - point.x) <= 0.5 && Math.abs(point.x - next.x) <= 0.5;
    const sameY = Math.abs(prev.y - point.y) <= 0.5 && Math.abs(point.y - next.y) <= 0.5;
    if (!sameX && !sameY) compacted.push(point);
  }
  compacted.push(deduped[deduped.length - 1]);
  return compacted;
};

export const synthesizeStableFallbackPath = ({
  edge,
  nodeById,
}: {
  edge: Edge;
  nodeById: Map<string, Node>;
}): Edge => {
  const data = ((edge.data || {}) as Record<string, any>);
  if (String(edge.type || '').toLowerCase() !== 'stablepath') return edge;
  if (Array.isArray(data.computedPath) && data.computedPath.length >= 2 && data.computedPath.every(isFinitePoint)) {
    return edge;
  }

  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect || !sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) {
    return edge;
  }

  const autoSides = autoAnchorSide(sourceRect, targetRect);
  const sourceSide = sideForHandle(edge.sourceHandle) || autoSides.source;
  const targetSide = sideForHandle(edge.targetHandle) || autoSides.target;
  const source = anchorForHandle(sourceRect, sourceSide);
  const target = anchorForHandle(targetRect, targetSide);
  const useHorizontalSpine = sourceSide === 'left'
    || sourceSide === 'right'
    || targetSide === 'left'
    || targetSide === 'right';
  const path = useHorizontalSpine
    ? compactOrthogonalPath([
      source,
      { x: (source.x + target.x) / 2, y: source.y },
      { x: (source.x + target.x) / 2, y: target.y },
      target,
    ])
    : compactOrthogonalPath([
      source,
      { x: source.x, y: (source.y + target.y) / 2 },
      { x: target.x, y: (source.y + target.y) / 2 },
      target,
    ]);

  if (path.length < 2) return edge;
  return {
    ...edge,
    data: {
      ...data,
      computedPath: path,
      layoutPathLocked: true,
      _layoutPathLocked: true,
      algorithm: data.algorithm || 'display-stable-fallback',
    },
  };
};

export const isNearPoint = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  tolerance = 80,
) => Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;

export const hasLockedComputedPath = (edge: Edge): boolean => {
  const data = ((edge.data || {}) as Record<string, any>);
  const isStablePath = String(edge.type || '').toLowerCase() === 'stablepath';
  return (data.layoutPathLocked === true || data._layoutPathLocked === true || isStablePath)
    && Array.isArray(data.computedPath)
    && data.computedPath.length >= 2
    && data.computedPath.every(isFinitePoint);
};
