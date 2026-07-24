import type { Node, XYPosition } from '@xyflow/react';

interface SwimlaneLane {
  id: string;
  label: string;
  color?: string;
}

const DEFAULT_SWIMLANE_LANES: SwimlaneLane[] = [
  { id: 'lane-1', label: '用户', color: '#3b82f6' },
  { id: 'lane-2', label: '系统', color: '#10b981' },
  { id: 'lane-3', label: '第三方', color: '#f59e0b' },
];

export const coerceSwimlaneLanes = (value: unknown): SwimlaneLane[] => {
  if (!Array.isArray(value)) return DEFAULT_SWIMLANE_LANES;
  const lanes = value.slice(0, 20).flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim().slice(0, 80) : '';
    if (!label) return [];
    const id = typeof record.id === 'string' && record.id.trim()
      ? record.id.trim().slice(0, 80)
      : `lane-${index + 1}`;
    const color = typeof record.color === 'string' && /^#[0-9a-f]{6}$/i.test(record.color)
      ? record.color
      : undefined;
    return [{ id, label, ...(color ? { color } : {}) }];
  });
  return lanes.length > 0 ? lanes : DEFAULT_SWIMLANE_LANES;
};

export const createSwimlaneDropNodes = ({
  containerId,
  position,
  label,
  config,
  layerId,
}: {
  containerId: string;
  position: XYPosition;
  label: string;
  config: Record<string, unknown>;
  layerId: string;
}): Node[] => {
  const lanes = coerceSwimlaneLanes(config.lanes);
  const width = 800;
  const height = 500;
  const headerHeight = 36;
  const direction = config.direction === 'vertical' ? 'vertical' : 'horizontal';
  const horizontal = direction === 'horizontal';
  const laneWidth = horizontal ? width : Math.floor(width / lanes.length);
  const laneHeight = horizontal ? Math.floor((height - headerHeight) / lanes.length) : height - headerHeight;
  const container: Node = {
    id: containerId,
    type: 'swimlane',
    position,
    data: { label: label || 'Swimlane', direction, layer: layerId, laneCount: lanes.length },
    style: { width, height },
    zIndex: -2,
  };
  const children = lanes.map((lane, index): Node => ({
    id: `${containerId} -${lane.id} `,
    type: 'titleGroup',
    position: horizontal
      ? { x: 0, y: headerHeight + index * laneHeight }
      : { x: index * laneWidth, y: headerHeight },
    parentId: containerId,
    extent: 'parent',
    data: {
      label: lane.label,
      description: lane.label,
      themeColor: lane.color || '#6366f1',
      titleBarHeight: 28,
      layer: layerId,
      isLane: true,
      domainClass: 'core',
    },
    style: { width: laneWidth, height: laneHeight },
    zIndex: -1,
  }));
  return [container, ...children];
};
