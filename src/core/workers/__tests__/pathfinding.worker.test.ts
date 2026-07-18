// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  isValidBatchPathfindingWorkerMessage,
  isValidSinglePathfindingWorkerMessage,
} from '../pathfinding.worker';
import type { PathFindingJob } from '../../types/routing';

vi.stubGlobal('self', {
  postMessage: vi.fn(),
});

const job = (overrides: Partial<PathFindingJob> = {}): PathFindingJob => ({
  jobId: 'job-a',
  edgeId: 'edge-a',
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  ...overrides,
});

describe('pathfinding.worker message guards', () => {
  it('accepts valid batch worker messages', () => {
    expect(isValidBatchPathfindingWorkerMessage({
      mode: 'batch',
      jobId: 'batch-a',
      context: { nodes: [], edges: [], obstacles: [], config: {} },
      tasks: [job()],
    })).toBe(true);
  });

  it('rejects malformed batch worker messages before routing', () => {
    expect(isValidBatchPathfindingWorkerMessage(null)).toBe(false);
    expect(isValidBatchPathfindingWorkerMessage({
      mode: 'batch',
      jobId: 'batch-a',
      context: undefined,
      tasks: [job()],
    })).toBe(false);
    expect(isValidBatchPathfindingWorkerMessage({
      mode: 'batch',
      jobId: 'batch-a',
      context: {},
      tasks: [],
    })).toBe(false);
    expect(isValidBatchPathfindingWorkerMessage({
      mode: 'batch',
      jobId: 'batch-a',
      context: {},
      tasks: [job({ sourceX: Number.NaN })],
    })).toBe(false);
  });

  it('accepts valid single worker messages in request and legacy shapes', () => {
    expect(isValidSinglePathfindingWorkerMessage({
      type: 'CALCULATE_PATH',
      job: job(),
      graph: { nodes: [], edges: [], obstacles: [], config: {} },
    })).toBe(true);

    expect(isValidSinglePathfindingWorkerMessage({
      ...job(),
      nodes: [],
      edges: [],
      obstacles: [],
      config: {},
    })).toBe(true);
  });

  it('rejects malformed single worker messages', () => {
    expect(isValidSinglePathfindingWorkerMessage('bad')).toBe(false);
    expect(isValidSinglePathfindingWorkerMessage({ job: job() })).toBe(false);
    expect(isValidSinglePathfindingWorkerMessage({
      job: job({ targetY: Number.POSITIVE_INFINITY }),
      graph: {},
    })).toBe(false);
  });
});
