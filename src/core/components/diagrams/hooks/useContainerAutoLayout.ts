import { useCallback } from 'react';
import { type Edge, type Node, useReactFlow } from '@xyflow/react';
import { treeLayout } from '../../../utils/LayoutAlgorithms';
import { hasMutationLockedNode } from '../nodeLockPolicy';

/**
 * useContainerAutoLayout — 容器内子节点自动布局
 *
 * 复用 LayoutAlgorithms.ts 中的 treeLayout（dagre 风格的层次布局）
 * 为指定容器的 childIds 子节点计算新位置，并转换为相对容器的坐标。
 */

const CONTAINER_TYPES = new Set(['titleGroup', 'subGroup', 'swimlane', 'group', 'domain']);
const CONTAINER_PADDING = 24;
const TITLE_BAR_HEIGHT = 48;

export interface ContainerAutoLayoutOptions {
  nodes: Node[];
  edges: Edge[];
  containerId: string;
  direction?: 'TB' | 'LR';
}

export const createContainerAutoLayoutPlan = ({
  nodes: allNodes,
  edges: allEdges,
  containerId,
  direction = 'TB',
}: ContainerAutoLayoutOptions): Node[] | null => {
    const container = allNodes.find(n => n.id === containerId);
    if (!container) return null;

    const rawChildIds = container.data?.childIds;
    const childIds = new Set<string>(
      Array.isArray(rawChildIds)
        ? rawChildIds.filter((id): id is string => typeof id === 'string')
        : []
    );

    allNodes.forEach(n => {
      if (n.parentId === containerId && !CONTAINER_TYPES.has(n.type || '')) {
        childIds.add(n.id);
      }
    });

    if (childIds.size === 0) return null;

    const childNodes = allNodes.filter(n => childIds.has(n.id));
    if (childNodes.length === 0 || hasMutationLockedNode([container, ...childNodes])) return null;

    const childEdges = allEdges.filter(e =>
      childIds.has(e.source) && childIds.has(e.target)
    );
    const positions = treeLayout(childNodes, childEdges, {
      direction,
      nodeSpacing: 40,
      levelSpacing: 80,
    });

    if (positions.size === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    positions.forEach((pos, id) => {
      const node = childNodes.find(n => n.id === id);
      if (!node || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
      const w = node.measured?.width || node.width || 150;
      const h = node.measured?.height || node.height || 50;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + w);
      maxY = Math.max(maxY, pos.y + h);
    });
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;

    const contentTop = TITLE_BAR_HEIGHT + CONTAINER_PADDING;
    const offsetX = CONTAINER_PADDING - minX;
    const offsetY = contentTop - minY;
    const contentWidth = maxX - minX + CONTAINER_PADDING * 2;
    const contentHeight = maxY - minY + contentTop + CONTAINER_PADDING;
    let changed = false;

    const nextNodes = allNodes.map(n => {
      if (childIds.has(n.id)) {
        const newPos = positions.get(n.id);
        if (newPos) {
          const position = {
            x: Math.round(newPos.x + offsetX),
            y: Math.round(newPos.y + offsetY),
          };
          if (position.x !== n.position.x || position.y !== n.position.y) {
            changed = true;
            return { ...n, position };
          }
        }
      }

      if (n.id === containerId) {
        const curW = Number(n.style?.width) || n.measured?.width || 400;
        const curH = Number(n.style?.height) || n.measured?.height || 300;
        const width = Math.max(curW, contentWidth);
        const height = Math.max(curH, contentHeight);
        if (width !== curW || height !== curH) {
          changed = true;
          return { ...n, style: { ...n.style, width, height } };
        }
      }

      return n;
    });

    return changed ? nextNodes : null;
};

export function useContainerAutoLayout(takeSnapshot: (nodes: Node[], edges: Edge[]) => void) {
  const { getNodes, getEdges, setNodes } = useReactFlow();

  /**
   * 对指定容器内的子节点执行自动布局
   * @param containerId 容器节点 ID
   * @param direction 布局方向（默认 'TB'）
   */
  const layoutContainer = useCallback((containerId: string, direction: 'TB' | 'LR' = 'TB') => {
    const allNodes = getNodes();
    const allEdges = getEdges();
    const plan = createContainerAutoLayoutPlan({
      nodes: allNodes,
      edges: allEdges,
      containerId,
      direction,
    });
    if (!plan) return;

    takeSnapshot(allNodes, allEdges);
    setNodes(plan);
  }, [getEdges, getNodes, setNodes, takeSnapshot]);

  return { layoutContainer };
}
