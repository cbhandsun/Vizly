import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type {
  PathFindingJob,
  SharedGraphContext,
} from '../../types/routing';
import {
  assignNonBusIncomingIndices,
  collectHubPortGroups,
  prepareBusRoutingContext,
} from '../edgeRoutingBusPreparation';

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
  layoutDirection: unknown = 'LR',
): SharedGraphContext => ({
  nodes,
  edges,
  obstacles: [],
  config: {},
  layoutDirection,
} as SharedGraphContext);

describe('edgeRoutingBusPreparation', () => {
  it('consolidates graph and batch topology before assigning bus flags', () => {
    const jobs = [
      job('batch-only', 'hub', 'peer-b'),
      job('incoming', 'peer-c', 'hub'),
    ];
    const context = prepareBusRoutingContext(jobs, graph(
      [
        { id: 'hub', position: { x: 0, y: 0 }, width: 100, height: 60 },
        { id: 'peer-a', position: { x: 200, y: 0 } },
        { id: 'peer-b', position: { x: 200, y: 100 } },
        { id: 'peer-c', position: { x: -200, y: 0 } },
      ],
      [
        { id: 'graph-edge', source: 'hub', target: 'peer-a' },
        { id: 'incoming-other', source: 'peer-a', target: 'hub' },
      ],
      'TB',
    ));

    expect(context.allEdges.map(edge => edge.id)).toEqual([
      'graph-edge',
      'incoming-other',
      'batch-only',
      'incoming',
    ]);
    expect(jobs[0].isOneToMany).toBe(true);
    expect(jobs[1].isManyToOne).toBe(true);
    expect(context.sourceGroups.get('hub')).toEqual([jobs[0]]);
    expect(context.targetGroups.get('hub')).toEqual([jobs[1]]);
    expect(context.layoutDirection).toBe('TB');
  });

  it('resolves nested absolute rectangles and excludes container obstacles', () => {
    const jobs = [job('nested-edge', 'child', 'peer')];
    const context = prepareBusRoutingContext(jobs, graph([
      {
        id: 'container',
        type: 'group',
        computed: { positionAbsolute: { x: 100, y: 200 } },
        width: 400,
        height: 300,
      },
      {
        id: 'child',
        parentId: 'container',
        position: { x: 20, y: 30 },
        measured: { width: 80, height: 40 },
      },
      {
        id: 'peer',
        positionAbsolute: { x: 500, y: 600 },
        width: 0,
        height: Number.NaN,
      },
    ], []));

    expect(jobs[0].sourceRect).toEqual({
      x: 120,
      y: 230,
      width: 80,
      height: 40,
    });
    expect(jobs[0].targetRect).toEqual({
      x: 500,
      y: 600,
      width: 150,
      height: 80,
    });
    expect(context.trunkObstacles).toHaveLength(2);
    expect(context.trunkObstacles).not.toContainEqual(expect.objectContaining({
      width: 400,
      height: 300,
    }));
  });

  it('bounds cyclic parent chains instead of recursing indefinitely', () => {
    const jobs = [job('cycle-edge', 'a', 'b')];
    const context = prepareBusRoutingContext(jobs, graph([
      { id: 'a', parentId: 'b', position: { x: 10, y: 20 } },
      { id: 'b', parentId: 'a', position: { x: 30, y: 40 } },
    ], []));

    const sourceRect = context.getNodeRect('a');
    const targetRect = context.getNodeRect('b');
    expect(sourceRect).toEqual(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
    }));
    expect(targetRect).toEqual(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
    }));
    expect(Number.isFinite(sourceRect?.x)).toBe(true);
    expect(Number.isFinite(targetRect?.y)).toBe(true);
  });

  it('ignores invalid topology records and defaults invalid layout input', () => {
    const jobs = [job('valid', 'source', 'target')];
    const context = prepareBusRoutingContext(jobs, graph(
      [{ id: '' }, null],
      [
        null,
        { id: '', source: 'source', target: 'target' },
        { id: 'missing-target', source: 'source' },
      ],
      42,
    ));

    expect(context.allEdges.map(edge => edge.id)).toEqual(['valid']);
    expect(context.layoutDirection).toBe('LR');
    expect(jobs[0].sourceRect).toBeUndefined();
    expect(jobs[0].targetRect).toBeUndefined();
  });

  it('collects occupied ports with finite averaged tangents', () => {
    const first = job('first', 'hub', 'a');
    first.busRoutingPlan = {
      busIndex: 0,
      peerGroupKey: 'group',
      peerGroupSize: 2,
      peerGroupMembers: ['first', 'second'],
      trunkPort: Position.Bottom,
      trunkPortTangent: 20,
      portFrozen: true,
    };
    const second = job('second', 'hub', 'b') as PathFindingJob & {
      trunkPort?: string;
      trunkPortTangent?: number;
    };
    second.trunkPort = 'bottom';
    second.trunkPortTangent = 40;
    const invalid = job('invalid', 'hub', 'c') as PathFindingJob & {
      trunkPort?: string;
    };
    invalid.trunkPort = 'diagonal';

    const groups = collectHubPortGroups([first, second, invalid]);
    expect(groups.get('bottom')).toEqual({
      tangent: 30,
      jobs: [first, second],
    });
    expect(groups.size).toBe(1);
  });

  it('indexes non-bus incoming edges independently by target side', () => {
    const upper = job('upper', 'source-upper', 'hub', 10);
    const lower = job('lower', 'source-lower', 'hub', 20);
    const right = job('right', 'source-right', 'hub', 15);
    upper.sourceRect = { x: -100, y: -20, width: 10, height: 10 };
    lower.sourceRect = { x: -100, y: 20, width: 10, height: 10 };
    right.sourceRect = { x: 100, y: 0, width: 10, height: 10 };
    for (const item of [upper, lower, right]) {
      item.targetRect = { x: 0, y: 0, width: 10, height: 10 };
    }

    assignNonBusIncomingIndices([lower, right, upper]);
    expect(upper.incomingIndex).toBe(0);
    expect(lower.incomingIndex).toBe(1);
    expect(upper.incomingCount).toBe(2);
    expect(lower.incomingCount).toBe(2);
    expect(right.incomingIndex).toBe(0);
    expect(right.incomingCount).toBe(1);
  });
});
