import { describe, expect, it } from 'vitest';

import { parseDisplayEdgesWorkerRequest } from '../baseReactFlowDisplayWorkerProtocol';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';

const validRepairRequest = {
  operation: 'repair',
  requestId: 'repair-1',
  edges: [{
    id: 'edge',
    source: 'source',
    target: 'target',
    data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  }],
  nodes: [
    { id: 'source', position: { x: 0, y: 0 }, data: {} },
    { id: 'target', position: { x: 100, y: 0 }, data: {} },
  ],
  repairMode: 'bounded',
} as const;

describe('baseReactFlowDisplayWorker repair protocol', () => {
  it('rejects missing or unknown repair modes at the worker boundary', () => {
    const { repairMode: _repairMode, ...missingMode } = validRepairRequest;
    expect(parseDisplayEdgesWorkerRequest(missingMode)).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      repairMode: 'unbounded',
    })).toBeNull();
  });

  it('coerces only the optional boolean obstacle-failure boundary', () => {
    const inputIdentity = createDisplayRoutingIdentity(
      '1234',
      `geometry-v1:${'a'.repeat(32)}`,
    );
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      inputIdentity,
      stopAfterObstacleFailure: true,
    })).toMatchObject({ stopAfterObstacleFailure: true });
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      inputIdentity,
    })).toMatchObject({ stopAfterObstacleFailure: false });
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      inputIdentity,
      stopAfterObstacleFailure: 'true',
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      inputIdentity,
      repairMode: 'finalized',
      stopAfterObstacleFailure: true,
    })).toBeNull();
  });
});
