import { describe, expect, it } from 'vitest';

import { parseDisplayEdgesWorkerRequest } from '../baseReactFlowDisplayWorkerProtocol';

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
});
