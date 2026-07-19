import { describe, expect, it } from 'vitest';

import { createWorkerRoutingErrorResult } from '../edgeRoutingWorkerFinalization';

describe('edgeRoutingWorkerFinalization', () => {
  it('creates a bounded empty result without echoing the failed job payload', () => {
    expect(createWorkerRoutingErrorResult({
      jobId: 'job',
      edgeId: 'edge',
      source: 'source',
      target: 'target',
      sourceX: 0,
      sourceY: 0,
      targetX: 1,
      targetY: 1,
      sourceHandle: 'secret-handle',
    }, 'route failed')).toEqual({
      jobId: 'job',
      edgeId: 'edge',
      path: '',
      points: [],
      labelX: 0,
      labelY: 0,
      error: 'route failed',
    });
  });
});
