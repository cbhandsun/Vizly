// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readDisplayRoutingDebugState } from '../../../shared/baseReactFlowDisplayRoutingDebug';
import { createLayoutRoutingTransactionDiagnostics } from '../layoutRoutingTransactionDiagnostics';

describe('layout routing transaction phase diagnostics', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-vizly-display-routing');
    delete (window as Window & { __vizlyBaseReactFlowDisplayRouting?: unknown })
      .__vizlyBaseReactFlowDisplayRouting;
  });

  it('records only bounded phase, status, and monotonic aggregate timing fields', () => {
    const samples = [1_000, 1_025, 1_030, 1_055];
    const diagnostics = createLayoutRoutingTransactionDiagnostics(
      7,
      () => samples.shift() ?? 1_055,
    );

    diagnostics.beginPhase('command');
    diagnostics.finishPhase('command');
    diagnostics.beginPhase('worker-routing');
    diagnostics.finishPhase('worker-routing', 'failed');

    expect(readDisplayRoutingDebugState()?.layoutPhaseTrace).toEqual([
      {
        sequence: 1,
        phase: 'command',
        status: 'completed',
        startedAt: 1_000,
        durationMs: 25,
      },
      {
        sequence: 2,
        phase: 'worker-routing',
        status: 'failed',
        startedAt: 1_030,
        durationMs: 25,
      },
    ]);
  });

  it('marks async failures and all still-running phases without swallowing errors', async () => {
    let now = 2_000;
    const diagnostics = createLayoutRoutingTransactionDiagnostics(8, () => {
      now += 10;
      return now;
    });
    const failure = new Error('layout-routing-hard-quality-rejected');

    await expect(diagnostics.measurePhase('dynamic-import', async () => {
      throw failure;
    })).rejects.toBe(failure);
    diagnostics.beginPhase('layout-calculation');
    diagnostics.failed(failure);

    expect(readDisplayRoutingDebugState()).toMatchObject({
      layoutTransactionJobId: 8,
      layoutTransactionStatus: 'failed',
      layoutTransactionErrorCode: 'hard-quality-rejected',
      layoutPhaseTrace: [
        expect.objectContaining({ phase: 'dynamic-import', status: 'failed' }),
        expect.objectContaining({ phase: 'layout-calculation', status: 'failed' }),
      ],
    });
  });

  it('caps invalid and extreme clock values at the diagnostics boundary', () => {
    const readTime = vi.fn()
      .mockReturnValueOnce(Number.POSITIVE_INFINITY)
      .mockReturnValueOnce(999_999_999);
    const diagnostics = createLayoutRoutingTransactionDiagnostics(9, readTime);
    diagnostics.beginPhase('command');
    diagnostics.finishPhase('command');

    expect(readDisplayRoutingDebugState()?.layoutPhaseTrace?.[0]).toMatchObject({
      startedAt: 0,
      durationMs: 600_000,
    });
  });
});
