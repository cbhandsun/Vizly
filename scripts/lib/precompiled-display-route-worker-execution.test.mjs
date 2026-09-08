// @vitest-environment node
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { measurePrecompiledWorkerExecution, projectPrecompiledWorkerExecution, assertPrecompiledWorkerExecutionCoverage }
  from './precompiled-display-route-worker-execution.mjs';

const timing = { postedMonotonicAt: 100, finalResponseMonotonicAt: 200 };
const execution = { readyAt: 1_120, receivedAt: 1_130, finishedAt: 1_180 };
describe('cold Worker execution evidence', () => {
  it('requires valid execution evidence for every sampled preset, rather than accepting missing observations', () => {
    const workerExecution = measurePrecompiledWorkerExecution(timing, execution, 1_000);
    expect(() => assertPrecompiledWorkerExecutionCoverage({ presets: [{ workerExecution }] })).not.toThrow();
    for (const sample of [null, {}, { presets: [] }, { presets: [{}] },
      ...['unavailable', 'invalid', 'clock-inconsistent'].map(status => ({
        presets: [{ workerExecution }, { workerExecution: { status } }],
      })), { presets: Array(33).fill({ workerExecution }) }]) {
      expect(() => assertPrecompiledWorkerExecutionCoverage(sample)).toThrow('Worker execution evidence');
    }
  });
  it('separates readiness, dispatch, execution and delivery in the injected projector', () => {
    const result = vm.runInNewContext(`(${measurePrecompiledWorkerExecution.toString()})(timing, execution, 1000)`,
      { timing, execution: { ...execution, secret: 'private' } });
    expect(result).toEqual({ status: 'available', handlerReadyAfterPostMs: 20,
      postReadyDispatchMs: 10, executionMs: 50, responseDeliveryMs: 20 });
    expect(JSON.stringify(result)).not.toMatch(/private|readyAt|receivedAt|finishedAt/);
  });
  it('supports prewarmed workers and accounts for bounded clock precision loss', () => {
    expect(measurePrecompiledWorkerExecution(timing, { ...execution, readyAt: 1 }, 1_000))
      .toMatchObject({ status: 'available', handlerReadyAfterPostMs: 0, postReadyDispatchMs: 30 });
    expect(measurePrecompiledWorkerExecution(timing, { ...execution, finishedAt: 1_200.5 }, 1_000))
      .toMatchObject({ status: 'available', responseDeliveryMs: 0 });
  });
  it('distinguishes missing, invalid and inconsistent clocks without fabricating zero measurements', () => {
    expect(measurePrecompiledWorkerExecution(timing, null, 1_000)).toEqual({ status: 'unavailable' });
    for (const value of [{}, [], 'private', { ...execution, readyAt: NaN },
      { ...execution, receivedAt: Infinity }, { ...execution, finishedAt: -1 }]) {
      expect(measurePrecompiledWorkerExecution(timing, value, 1_000)).toEqual({ status: 'invalid' });
    }
    for (const value of [{ ...execution, readyAt: 1_140 }, { ...execution, finishedAt: 1_100 },
      { ...execution, receivedAt: 900, readyAt: 800 }, { ...execution, finishedAt: 1_202 }]) {
      expect(measurePrecompiledWorkerExecution(timing, value, 1_000)).toEqual({ status: 'clock-inconsistent' });
    }
    expect(measurePrecompiledWorkerExecution({ ...timing, finalResponseMonotonicAt: 700_000 }, execution, 1_000))
      .toEqual({ status: 'clock-inconsistent' });
  });
  it('allowlists host evidence and rejects invalid durations and status fields', () => {
    const measured = measurePrecompiledWorkerExecution(timing, execution, 1_000);
    expect(projectPrecompiledWorkerExecution({ ...measured, cookie: 'private' })).toEqual(measured);
    expect(projectPrecompiledWorkerExecution({ status: 'invalid', raw: 'private' })).toEqual({ status: 'invalid' });
    for (const value of [{}, [], { status: 'private' }, { ...measured, executionMs: '50' },
      { ...measured, executionMs: Infinity }, { ...measured, executionMs: 600_001 }]) {
      expect(() => projectPrecompiledWorkerExecution(value)).toThrow('Invalid Worker execution');
    }
  });
});
