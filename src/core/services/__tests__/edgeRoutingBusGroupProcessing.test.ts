import { describe, expect, it, vi } from 'vitest';

import type {
  PathFindingJob,
  SharedGraphContext,
} from '../../types/routing';
import { assignBusRoutingMetadata } from '../edgeRoutingBusGroupProcessing';

const job = (
  edgeId: string,
  source: string,
  target: string,
  sourceY = 0,
): PathFindingJob => ({
  jobId: `job-${edgeId}`,
  edgeId,
  source,
  target,
  sourceX: 0,
  sourceY,
  targetX: 0,
  targetY: 0,
});

const graph = (
  nodes: unknown[],
  edges: unknown[],
): SharedGraphContext => ({
  nodes,
  edges,
  obstacles: [],
  config: {},
});

describe('edgeRoutingBusGroupProcessing', () => {
  it('assigns O2M metadata through the complete orchestration boundary', () => {
    const jobs = [
      job('out-a', 'hub', 'peer-a'),
      job('out-b', 'hub', 'peer-b'),
    ];
    const onClassification = vi.fn();
    const onTrunk = vi.fn();
    assignBusRoutingMetadata(jobs, graph(
      [
        { id: 'hub', position: { x: 0, y: 0 }, width: 100, height: 80 },
        { id: 'peer-a', position: { x: 300, y: -80 }, width: 80, height: 40 },
        { id: 'peer-b', position: { x: 300, y: 100 }, width: 80, height: 40 },
      ],
      [
        { id: 'out-a', source: 'hub', target: 'peer-a' },
        { id: 'out-b', source: 'hub', target: 'peer-b' },
      ],
    ), { onClassification, onTrunk });

    expect(jobs.every(item => item.isOneToMany)).toBe(true);
    expect(jobs.every(item => item.outgoingCount === 1)).toBe(true);
    expect(jobs.every(item => item.o2mTrunk)).toBe(true);
    expect(jobs.every(item => item.busRoutingPlan?.portFrozen)).toBe(true);
    expect(onClassification).toHaveBeenCalledTimes(2);
    expect(onTrunk).toHaveBeenCalled();
  });

  it('separates O2M and M2O bundles that occupy the same hub side', () => {
    const outgoing = [
      job('out-a', 'hub', 'out-peer-a'),
      job('out-b', 'hub', 'out-peer-b'),
    ];
    const incoming = [
      job('in-a', 'in-peer-a', 'hub'),
      job('in-b', 'in-peer-b', 'hub'),
    ];
    const jobs = [...outgoing, ...incoming];
    const edges = jobs.map(item => ({
      id: item.edgeId,
      source: item.source,
      target: item.target,
    }));
    assignBusRoutingMetadata(jobs, graph(
      [
        { id: 'hub', position: { x: 0, y: 0 }, width: 100, height: 80 },
        { id: 'out-peer-a', position: { x: 300, y: -60 } },
        { id: 'out-peer-b', position: { x: 320, y: 80 } },
        { id: 'in-peer-a', position: { x: 300, y: -40 } },
        { id: 'in-peer-b', position: { x: 320, y: 100 } },
      ],
      edges,
    ));

    expect(outgoing.every(item => item.outgoingCount === 2)).toBe(true);
    expect(incoming.every(item => item.incomingCount === 2)).toBe(true);
    expect(incoming.every(item => item.m2oTrunk)).toBe(true);
    expect(new Set(outgoing.map(item => item.outgoingIndex)).size).toBe(1);
    expect(new Set(incoming.map(item => item.incomingIndex)).size).toBe(1);
    expect(outgoing[0].outgoingIndex).not.toBe(incoming[0].incomingIndex);
  });

  it('assigns deterministic target-side indices to non-bus jobs', () => {
    const jobs = [
      job('single-b', 'source-b', 'target-b', 20),
      job('single-a', 'source-a', 'target-a', 10),
    ];
    assignBusRoutingMetadata(jobs, graph(
      [
        { id: 'source-a', position: { x: 0, y: 0 } },
        { id: 'target-a', position: { x: 200, y: 0 } },
        { id: 'source-b', position: { x: 0, y: 100 } },
        { id: 'target-b', position: { x: 200, y: 100 } },
      ],
      [],
    ));

    expect(jobs.every(item => item.isOneToMany === false)).toBe(true);
    expect(jobs.every(item => item.isManyToOne === false)).toBe(true);
    expect(jobs.every(item => item.incomingIndex === 0)).toBe(true);
    expect(jobs.every(item => item.incomingCount === 1)).toBe(true);
  });
});
