import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { treeLayout } from '../../../utils/LayoutAlgorithms';

/**
 * useContainerAutoLayout — 容器内子节点自动布局
 *
 * 复用 LayoutAlgorithms.ts 中的 treeLayout（dagre 风格的层次布局）
 * 为指定容器的 childIds 子节点计算新位置，并转换为相对容器的坐标。
 */

const CONTAINER_TYPES = new Set(['titleGroup', 'subGroup', 'swimlane', 'group', 'domain']);
const CONTAINER_PADDING = 24;
const TITLE_BAR_HEIGHT = 48;

export function useContainerAutoLayout() {
  const { getNodes, getEdges, setNodes } = useReactFlow();

  /**
   * 对指定容器内的子节点执行自动布局
   * @param containerId 容器节点 ID
   * @param direction 布局方向（默认 'TB'）
   */
  const layoutContainer = useCallback((containerId: string, direction: 'TB' | 'LR' = 'TB') => {
    const allNodes = getNodes();
    const allEdges = getEdges();

    const container = allNodes.find(n => n.id === containerId);
    if (!container) return;

    // 收集子节点：通过 parentId 关系或 data.childIds
    const childIds = new Set<string>(
      (container.data as any)?.childIds as string[] || []
    );

    // 也收集通过 React Flow parentId 关联的子节点
    allNodes.forEach(n => {
      if ((n as any).parentId === containerId && !CONTAINER_TYPES.has(n.type || '')) {
        childIds.add(n.id);
      }
    });

    if (childIds.size === 0) return;

    // 提取子节点
    const childNodes = allNodes.filter(n => childIds.has(n.id));

    // 筛选子节点之间的边
    const childEdges = allEdges.filter(e =>
      childIds.has(e.source) && childIds.has(e.target)
    );

    // 调用 treeLayout（dagre 风格的层次布局算法）
    const positions = treeLayout(childNodes, childEdges, {
      direction,
      nodeSpacing: 40,
      levelSpacing: 80,
    });

    if (positions.size === 0) return;

    // 计算布局结果的边界
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    positions.forEach((pos, id) => {
      const node = childNodes.find(n => n.id === id);
      const w = node?.measured?.width || (node as any)?.width || 150;
      const h = node?.measured?.height || (node as any)?.height || 50;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + w);
      maxY = Math.max(maxY, pos.y + h);
    });

    // 偏移量：使子节点位置相对于容器内容区
    const contentTop = TITLE_BAR_HEIGHT + CONTAINER_PADDING;
    const offsetX = CONTAINER_PADDING - minX;
    const offsetY = contentTop - minY;

    // 计算容器需要的最小尺寸
    const contentWidth = maxX - minX + CONTAINER_PADDING * 2;
    const contentHeight = maxY - minY + contentTop + CONTAINER_PADDING;

    setNodes((nds) => nds.map(n => {
      // 更新子节点位置（相对容器偏移）
      if (childIds.has(n.id)) {
        const newPos = positions.get(n.id);
        if (newPos) {
          return {
            ...n,
            position: {
              x: Math.round(newPos.x + offsetX),
              y: Math.round(newPos.y + offsetY),
            },
          };
        }
      }

      // 自动扩展容器尺寸
      if (n.id === containerId) {
        const curW = Number(n.style?.width) || n.measured?.width || 400;
        const curH = Number(n.style?.height) || n.measured?.height || 300;
        return {
          ...n,
          style: {
            ...n.style,
            width: Math.max(curW, contentWidth),
            height: Math.max(curH, contentHeight),
          },
        };
      }

      return n;
    }));

  }, [getNodes, getEdges, setNodes]);

  return { layoutContainer };
}
