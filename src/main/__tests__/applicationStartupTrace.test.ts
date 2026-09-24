// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createStartupTrace, projectStartupMilestones } from '../applicationStartupTrace';

describe('bounded startup milestones', () => {
  it('keeps monotonic relative timestamps and returns detached snapshots', () => {
    const now = vi.fn().mockReturnValueOnce(12.6).mockReturnValueOnce(12.7).mockReturnValueOnce(30);
    const trace = createStartupTrace(10, now);
    trace.record('runtime-ready'); trace.record('readiness-ready'); trace.record('failed');
    expect(trace.snapshot()).toEqual([
      { stage: 'runtime-started', elapsedMs: 0 }, { stage: 'runtime-ready', elapsedMs: 3 },
      { stage: 'readiness-ready', elapsedMs: 3 }, { stage: 'failed', elapsedMs: 20 },
    ]);
    const copy = trace.snapshot(); copy.pop();
    expect(trace.snapshot()).toHaveLength(4);
    expect(projectStartupMilestones(trace.snapshot())).toEqual(trace.snapshot());
  });
  it('does not read the clock or grow the buffer for duplicate, stale or terminal events', () => {
    const now = vi.fn(() => 20); const trace = createStartupTrace(10, now);
    trace.record('runtime-ready'); trace.record('failed');
    for (let index = 0; index < 1000; index += 1) {
      trace.record('failed'); trace.record('mount-submitted'); trace.record('runtime-started');
    }
    expect(trace.snapshot()).toHaveLength(3);
    expect(now).toHaveBeenCalledTimes(2);
  });
  it.each([NaN, Infinity, -1, 600_001])('represents invalid timing as unavailable: %s', time => {
    const trace = createStartupTrace(0, () => time);
    expect(trace.record('failed')).toBeNull();
    expect(projectStartupMilestones(trace.snapshot())?.at(-1)?.elapsedMs).toBeNull();
  });
  it('survives a clock exception without capturing its payload', () => {
    const trace = createStartupTrace(0, () => { throw new Error('token=private'); });
    expect(trace.record('failed')).toBeNull();
    expect(JSON.stringify(trace.snapshot())).not.toContain('private');
  });
  it('projects only allowlisted fields and rejects malformed histories', () => {
    const first = { stage: 'runtime-started', elapsedMs: 0 };
    expect(projectStartupMilestones([{ ...first, token: 'private' }])).toEqual([first]);
    for (const value of [null, undefined, {}, [], Array(7).fill(first), [null], [first, first],
      [{ ...first, elapsedMs: '0' }], [{ ...first, elapsedMs: 0.1 }], [{ ...first, stage: '<script>' }],
      [{ stage: 'failed', elapsedMs: 10 }], [first, { stage: 'failed', elapsedMs: Infinity }],
      [first, { stage: 'runtime-ready', elapsedMs: 2 }, { stage: 'failed', elapsedMs: 1 }]]) {
      expect(projectStartupMilestones(value)).toBeNull();
    }
  });
});
