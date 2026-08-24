import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { projectProTimelineTasks } from '../proTimelineTaskProjection';

const timelineNode = (id: string, data: Node['data']): Node => ({
  id,
  type: 'timelineNode',
  position: { x: 0, y: 0 },
  data,
});

describe('projectProTimelineTasks type semantics', () => {
  it.each(['event', 'milestone'] as const)('repairs legacy ranged %s data at the UI boundary', (type) => {
    const [task] = projectProTimelineTasks([timelineNode(type, {
      type,
      label: type,
      date: '2026-08-24',
      endDate: '2026-09-30',
      progress: 88,
    })], []);

    expect(task).toMatchObject({
      type,
      startDate: '2026-08-24',
      endDate: '2026-08-24',
    });
    expect(task.progress).toBeUndefined();
  });

  it('preserves a phase range and clamps its imported progress', () => {
    const [task] = projectProTimelineTasks([timelineNode('phase', {
      type: 'phase',
      label: 'Delivery',
      date: '2026-08-24',
      endDate: '2026-08-31',
      progress: 180,
    })], []);

    expect(task).toMatchObject({
      type: 'phase',
      startDate: '2026-08-24',
      endDate: '2026-08-31',
      progress: 100,
    });
  });
});
