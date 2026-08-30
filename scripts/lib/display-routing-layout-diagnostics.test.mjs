import { describe, expect, it } from 'vitest';

import { readDisplayRoutingLayoutDiagnostics } from './display-routing-layout-diagnostics.mjs';

describe('readDisplayRoutingLayoutDiagnostics', () => {
  it('keeps bounded phase, seed, and heartbeat aggregates', () => {
    expect(readDisplayRoutingLayoutDiagnostics({
      routingValue: {
        layoutPhaseTrace: [{
          sequence: 1,
          phase: 'worker-routing',
          status: 'completed',
          startedAt: 100,
          durationMs: 20,
        }],
        layoutSeedTerminalsAttached: true,
        layoutSeedTerminalsAnchored: false,
        layoutSeedObstacleHits: 22,
        layoutSeedStrictCrossings: 8,
      },
      heartbeatValue: [
        { sampledAt: 90, elapsedMs: 1, workerInstanceId: 'outside' },
        { sampledAt: 110, elapsedMs: 10, workerInstanceId: 'worker-1' },
        { sampledAt: 120, elapsedMs: 20, workerInstanceId: 'worker-1' },
      ],
      clickedAt: 100,
      confirmedAt: 130,
    })).toEqual({
      phaseTrace: [{
        sequence: 1,
        phase: 'worker-routing',
        status: 'completed',
        startedAt: 100,
        durationMs: 20,
      }],
      layoutSeedAudit: {
        terminalsAttached: true,
        terminalsAnchored: false,
        obstacleHits: 22,
        strictCrossings: 8,
      },
      workerHeartbeatCount: 2,
      workerHeartbeatMaxElapsedMs: 20,
      workerInstanceCount: 1,
    });
  });

  it('drops invalid and extreme values without exposing payload fields', () => {
    const result = readDisplayRoutingLayoutDiagnostics({
      routingValue: {
        layoutPhaseTrace: [{
          sequence: -1,
          phase: 'x'.repeat(100),
          privatePayload: 'secret',
          durationMs: Number.POSITIVE_INFINITY,
        }],
        layoutSeedObstacleHits: 100_001,
      },
      heartbeatValue: [{ sampledAt: 1, elapsedMs: 5, privatePayload: 'secret' }],
      clickedAt: Number.NaN,
      confirmedAt: 10,
    });
    expect(result.workerHeartbeatCount).toBe(0);
    expect(result.phaseTrace[0]).toMatchObject({ sequence: null, durationMs: null });
    expect(result.layoutSeedAudit.obstacleHits).toBeNull();
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
