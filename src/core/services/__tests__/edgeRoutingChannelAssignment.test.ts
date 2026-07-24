import type {
  PathFindingJob,
  SharedGraphContext,
} from '../../types/routing';
import { describe, expect, it } from 'vitest';

import {
  assignBidirectionalRoutingChannels,
  assignGlobalRoutingChannels,
  injectRoutingCongestionContext,
} from '../edgeRoutingChannelAssignment';

const job = (
  edgeId: string,
  source: string,
  target: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): PathFindingJob => ({
  jobId: `job-${edgeId}`,
  edgeId,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  isOneToMany: false,
  isManyToOne: false,
});

describe('edgeRoutingChannelAssignment', () => {
  it('assigns bidirectional channels independently of input order', () => {
    const first = [
      job('b', 'B', 'A', 100, 0, 0, 0),
      job('a2', 'A', 'B', 0, 0, 100, 0),
      job('a1', 'A', 'B', 0, 10, 100, 10),
    ];
    const second = [first[2], first[0], first[1]].map(item => ({ ...item }));
    assignBidirectionalRoutingChannels(first, 30);
    assignBidirectionalRoutingChannels(second, 30);
    const snapshot = (items: PathFindingJob[]) => items
      .map(item => [
        item.edgeId,
        item.bidirectionalChannel,
        item.bidirectionalSpacing,
        (item as PathFindingJob & { bidirectionalCount?: number }).bidirectionalCount,
      ])
      .sort();
    expect(snapshot(first)).toEqual(snapshot(second));
    expect(first.every(item => item.bidirectionalSpacing === 30)).toBe(true);
  });

  it('assigns stable spatial bands and sanitizes invalid coordinates', () => {
    const jobs = [
      job('horizontal-a', 'A', 'B', 0, 10, 200, 20),
      job('horizontal-b', 'C', 'D', 200, 20, 0, 10),
      job('vertical', 'E', 'F', Number.NaN, Number.NEGATIVE_INFINITY, 0, 200),
    ];
    (jobs[0] as any)._graphConfig = { algorithm: { gridSize: -20 } };
    assignGlobalRoutingChannels(jobs, Number.NaN);
    expect(jobs.slice(0, 2).map(item => item.globalChannelType)).toEqual([
      'horizontal',
      'horizontal',
    ]);
    expect(jobs.slice(0, 2).map(item => item.globalChannelCount)).toEqual([2, 2]);
    expect(jobs[2].globalChannelType).toBe('vertical');
    expect(Number.isFinite(jobs[2].globalChannelIndex)).toBe(true);
  });

  it('injects congestion without empty endpoint keys', () => {
    const graph = {
      nodes: [],
      edges: [],
      obstacles: [],
      config: {},
    } as SharedGraphContext;
    injectRoutingCongestionContext([
      job('a', ' A ', 'B', 0, 0, 1, 1),
      job('b', 'A', '', 0, 0, 1, 1),
    ], graph);
    expect((graph.config as any).portCongestion).toEqual({ A: 2, B: 1 });
  });
});
