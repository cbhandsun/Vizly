import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  scheduleWorkspaceInventoryLoad,
  WORKSPACE_INVENTORY_DEFER_MS,
} from '../workspaceInventorySchedule';

describe('workspace inventory scheduling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('defers inventory work until after the initial workspace chrome settles', () => {
    vi.useFakeTimers();
    const run = vi.fn();

    scheduleWorkspaceInventoryLoad(run);
    vi.advanceTimersByTime(WORKSPACE_INVENTORY_DEFER_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancels stale route work before it starts', () => {
    vi.useFakeTimers();
    const run = vi.fn();

    const cancel = scheduleWorkspaceInventoryLoad(run);
    cancel();
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
  });
});
