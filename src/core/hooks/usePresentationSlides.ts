/**
 * usePresentationSlides — 从当前节点自动生成演示幻灯片序列
 *
 * 策略：按域容器（titleGroup）的 Y/X 坐标排序，生成 slides
 * 每个 slide 聚焦一个域，包含该域下的所有子节点
 */
import { useMemo } from 'react';
import { getDescendantIds, buildChildrenMap } from '../components/diagrams/hooks/useCollapsibleGroups';

export interface PresentationSlide {
  /** 幻灯片标题（域名称） */
  title: string;
  /** 聚焦的节点 ID 列表 */
  nodeIds: string[];
  /** 容器节点 ID 列表（可选） */
  containerIds?: string[];
  /** 可选备注 */
  notes?: string;
}

interface SlideNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data?: { label?: string; description?: string; domainClass?: string; children?: string[] };
  parentId?: string;
}

/**
 * 从节点列表自动生成幻灯片序列
 * @param nodes 当前画布节点
 * @param direction 'vertical' 按 Y 排序 | 'horizontal' 按 X 排序
 */
export function generateSlides(
  nodes: SlideNode[],
  direction: 'vertical' | 'horizontal' = 'vertical'
): PresentationSlide[] {
  // 构建子节点关系查找表（支持 explicit parentId 和 semantic domain/subDomain 映射）
  const childrenMap = buildChildrenMap(nodes as any);

  // 第一步：找到所有主容器（titleGroup / group / subGroup / swimlane）
  const containers = nodes.filter(
    n => n.type === 'titleGroup' || n.type === 'titleGroupNode' || n.type === 'group' || n.type === 'subGroup' || n.type === 'subGroupNode' || n.type === 'swimlane'
  );

  if (containers.length === 0) {
    // 如果没有域容器，按节点类型分组
    return generateFlatSlides(nodes, direction);
  }

  // 按位置排序
  const sorted = [...containers].sort((a, b) =>
    direction === 'vertical'
      ? a.position.y - b.position.y || a.position.x - b.position.x
      : a.position.x - b.position.x || a.position.y - b.position.y
  );

  // 第零张：全局概览
  const slides: PresentationSlide[] = [
    {
      title: '全局概览',
      nodeIds: nodes.map(n => n.id),
      containerIds: containers.map(n => n.id),
      notes: `共 ${nodes.length} 个节点，${containers.length} 个域`,
    },
  ];

  // 为每个域容器生成一张幻灯片
  for (const container of sorted) {
    const title = container.data?.label || container.data?.description || container.id;

    // 找到该容器下的所有子代节点（深度递归）
    const descendantIds = getDescendantIds(nodes as any, container.id, childrenMap);

    // 过滤出子代中也是容器的节点，作为 containerIds
    const nestedContainerIds = nodes
      .filter(n => descendantIds.includes(n.id) && (
        n.type === 'titleGroup' || n.type === 'titleGroupNode' ||
        n.type === 'group' || n.type === 'subGroup' || n.type === 'subGroupNode' ||
        n.type === 'swimlane'
      ))
      .map(n => n.id);

    slides.push({
      title,
      nodeIds: [container.id, ...descendantIds],
      containerIds: [container.id, ...nestedContainerIds],
      notes: container.data?.description,
    });
  }

  return slides;
}

/**
 * 无域容器时的降级方案：将所有节点按位置分批
 */
function generateFlatSlides(
  nodes: SlideNode[],
  direction: 'vertical' | 'horizontal'
): PresentationSlide[] {
  const sorted = [...nodes].sort((a, b) =>
    direction === 'vertical'
      ? a.position.y - b.position.y
      : a.position.x - b.position.x
  );

  const slides: PresentationSlide[] = [
    { title: '全局概览', nodeIds: nodes.map(n => n.id), containerIds: [] },
  ];

  // 每 1 个节点一张，以产生良好的单步聚焦体验
  const chunkSize = 1;
  for (let i = 0; i < sorted.length; i += chunkSize) {
    const chunk = sorted.slice(i, i + chunkSize);
    const nodeNameArr = chunk.map(n => n.data?.label || n.data?.description || `Node ${n.id.slice(0, 4)}`);
    slides.push({
      title: `节点介绍: ${nodeNameArr.join(', ')}`,
      nodeIds: chunk.map(n => n.id),
      containerIds: [],
    });
  }

  return slides;
}

/**
 * React Hook — 响应式生成幻灯片
 */
export function usePresentationSlides(
  nodes: SlideNode[],
  direction: 'vertical' | 'horizontal' = 'vertical'
): PresentationSlide[] {
  return useMemo(
    () => generateSlides(nodes, direction),
    [nodes, direction]
  );
}
