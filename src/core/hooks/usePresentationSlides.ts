/**
 * usePresentationSlides — 从当前节点自动生成演示幻灯片序列
 *
 * 策略：按域容器（titleGroup）的 Y/X 坐标排序，生成 slides
 * 每个 slide 聚焦一个域，包含该域下的所有子节点
 */
import { useMemo } from 'react';

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
  // 第一步：找到所有域容器（titleGroup / group / domain）
  const containers = nodes.filter(
    n => n.type === 'titleGroup' || n.type === 'titleGroupNode' || n.type === 'group'
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
      notes: `共 ${nodes.length} 个节点，${containers.length} 个域`,
    },
  ];

  // 为每个域容器生成一张幻灯片
  for (const container of sorted) {
    const title = container.data?.label || container.data?.description || container.id;

    // 找到该容器下的所有子节点
    const childIds = nodes
      .filter(n => n.parentId === container.id)
      .map(n => n.id);

    slides.push({
      title,
      nodeIds: [container.id, ...childIds],
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
    { title: '全局概览', nodeIds: nodes.map(n => n.id) },
  ];

  // 每 1 个节点一张，以产生良好的单步聚焦体验
  const chunkSize = 1;
  for (let i = 0; i < sorted.length; i += chunkSize) {
    const chunk = sorted.slice(i, i + chunkSize);
    const nodeNameArr = chunk.map(n => n.data?.label || n.data?.description || `Node ${n.id.slice(0, 4)}`);
    slides.push({
      title: `节点介绍: ${nodeNameArr.join(', ')}`,
      nodeIds: chunk.map(n => n.id),
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
