import { describe, expect, it } from 'vitest';

import type { ProjectedProTimelineTask } from '../timeline-pro/proTimelineTaskProjection';
import {
  buildProTaskTooltipModel,
  clampProTaskProgress,
  isProTaskSelected,
} from '../timeline-pro/proTaskPresentationModel';

const task = (overrides: Partial<ProjectedProTimelineTask> = {}): ProjectedProTimelineTask => ({
  id: 'task-1',
  name: 'Task',
  startDate: '2026-07-20',
  endDate: '2026-07-22',
  ...overrides,
});

describe('pro task presentation model', () => {
  it('builds a bounded tooltip model for valid task data', () => {
    expect(buildProTaskTooltipModel(task({
      progress: 40,
      status: 'active',
      color: '#1890ff',
    }))).toEqual({
      name: 'Task',
      startDate: '2026-07-20',
      endDate: '2026-07-22',
      durationDays: 2,
      progress: 40,
      status: '🔵 进行中',
      color: '#1890ff',
    });
  });

  it('omits invalid or reversed date ranges and non-finite progress', () => {
    expect(buildProTaskTooltipModel(task({
      startDate: 'invalid',
      endDate: '2026-07-19',
      progress: Number.POSITIVE_INFINITY,
    }))).toMatchObject({
      endDate: undefined,
      durationDays: undefined,
      progress: undefined,
    });
  });

  it('clamps extreme progress and requires an explicit selected boolean', () => {
    expect(clampProTaskProgress(-10)).toBe(0);
    expect(clampProTaskProgress(120)).toBe(100);
    expect(clampProTaskProgress('50')).toBeUndefined();
    expect(isProTaskSelected(task({ _rawSelected: true }))).toBe(true);
    expect(isProTaskSelected(task({ _rawSelected: false }))).toBe(false);
  });
});
