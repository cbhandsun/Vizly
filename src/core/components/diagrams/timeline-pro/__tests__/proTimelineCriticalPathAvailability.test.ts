import { describe, expect, it } from 'vitest';

import { getProTimelineCriticalPathUnavailableReason } from '../proTimelineCriticalPathAvailability';

describe('getProTimelineCriticalPathUnavailableReason', () => {
  it('allows analysis when at least one critical task is available', () => {
    expect(getProTimelineCriticalPathUnavailableReason({
      taskCount: 2,
      criticalTaskCount: 1,
      cyclicTaskCount: 0,
    })).toBeUndefined();
  });

  it('explains empty, cyclic, and non-computable schedules', () => {
    expect(getProTimelineCriticalPathUnavailableReason({
      taskCount: 0,
      criticalTaskCount: 0,
      cyclicTaskCount: 0,
    })).toBe('请先添加至少一个排期任务');
    expect(getProTimelineCriticalPathUnavailableReason({
      taskCount: 2,
      criticalTaskCount: 0,
      cyclicTaskCount: 2,
    })).toBe('请先解决循环依赖后再查看关键路径');
    expect(getProTimelineCriticalPathUnavailableReason({
      taskCount: 1,
      criticalTaskCount: 0,
      cyclicTaskCount: 0,
    })).toBe('当前排期没有可计算的关键路径');
  });
});
