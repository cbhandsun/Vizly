import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createDisplayRoutingCorridorReservationPlan,
} from '../baseReactFlowDisplayRoutingCorridorReservations';
import {
  createDisplayRoutingTopologyPlan,
  type RoutingCorridorPlan,
  type RoutingFlowRole,
  type RoutingTerminalSide,
  type RoutingTopologyGroup,
} from '../baseReactFlowDisplayRoutingTopologyPlan';

const corridor = (
  axis: RoutingCorridorPlan['axis'],
  laneCenters: number[],
  start = 0,
  end = 100,
): RoutingCorridorPlan => ({
  axis,
  start,
  end,
  center: (start + end) / 2,
  capacity: laneCenters.length,
  laneCenters,
});

const group = (
  memberEdgeIndexes: number[],
  options: Readonly<{
    side?: RoutingTerminalSide;
    flowRole?: RoutingFlowRole;
    dualRoleMemberIndexes?: number[];
    trunkMode?: RoutingTopologyGroup['trunkMode'];
    endpointCenter?: Readonly<{ x: number; y: number }>;
  }> = {},
): RoutingTopologyGroup => ({
  kind: 'source',
  endpointId: `endpoint-${memberEdgeIndexes.join('-')}`,
  side: options.side ?? 'right',
  sector: options.side === 'left' ? 'w' : 'e',
  flowRole: options.flowRole ?? 'neutral',
  topologyPattern: 'o2m',
  trunkMode: options.trunkMode ?? 'single',
  laneDemand: memberEdgeIndexes.length,
  memberEdgeIndexes,
  dualRoleMemberIndexes: options.dualRoleMemberIndexes ?? [],
  endpointCenter: options.endpointCenter ?? { x: 0, y: 0 },
});

describe('baseReactFlowDisplayRoutingCorridorReservations', () => {
  it('reserves a centered contiguous lane block with stable edge assignments', () => {
    const plan = createDisplayRoutingCorridorReservationPlan(
      [group([5, 2])],
      [corridor('vertical', [20, 40, 60, 80])],
    );

    expect(plan).toEqual({
      reservations: [{
        groupIndex: 0,
        corridorIndex: 0,
        status: 'reserved',
        laneIndexes: [1, 2],
        memberAssignments: [
          { edgeIndex: 2, laneIndex: 1, laneCenter: 40 },
          { edgeIndex: 5, laneIndex: 2, laneCenter: 60 },
        ],
      }],
      exhaustedGroupIndexes: [],
    });
  });

  it('uses side and endpoint position to choose the facing corridor', () => {
    const plan = createDisplayRoutingCorridorReservationPlan([
      group([0], { side: 'right' }),
      group([1], { side: 'left' }),
    ], [
      corridor('vertical', [-50], -100, 0),
      corridor('vertical', [50], 0, 100),
    ]);

    expect(plan.reservations).toMatchObject([
      { groupIndex: 0, corridorIndex: 1, status: 'reserved' },
      { groupIndex: 1, corridorIndex: 0, status: 'reserved' },
    ]);
  });

  it('gives higher-priority flow roles first claim on bounded capacity', () => {
    const plan = createDisplayRoutingCorridorReservationPlan([
      group([0, 1], { flowRole: 'neutral' }),
      group([2, 3], { flowRole: 'main' }),
    ], [corridor('vertical', [33, 67])]);

    expect(plan.reservations).toMatchObject([
      { groupIndex: 0, status: 'exhausted', corridorIndex: null },
      { groupIndex: 1, status: 'reserved', corridorIndex: 0, laneIndexes: [0, 1] },
    ]);
    expect(plan.exhaustedGroupIndexes).toEqual([0]);
  });

  it('rolls back an entire dual component when either role cannot reserve', () => {
    const sourceDual = group([0], {
      dualRoleMemberIndexes: [0],
      trunkMode: 'dual',
    });
    const targetDual: RoutingTopologyGroup = {
      ...group([0], {
        side: 'top',
        dualRoleMemberIndexes: [0],
        trunkMode: 'dual',
      }),
      kind: 'target',
      topologyPattern: 'm2o',
      sector: 'n',
    };
    const plan = createDisplayRoutingCorridorReservationPlan(
      [sourceDual, targetDual, group([1])],
      [corridor('vertical', [50])],
    );

    expect(plan.reservations).toMatchObject([
      { groupIndex: 0, status: 'exhausted', corridorIndex: null },
      { groupIndex: 1, status: 'exhausted', corridorIndex: null },
      { groupIndex: 2, status: 'reserved', corridorIndex: 0, laneIndexes: [0] },
    ]);
    expect(plan.exhaustedGroupIndexes).toEqual([0, 1]);
  });

  it('commits both source and target reservations for a complete dual component', () => {
    const sourceDual = group([0], {
      dualRoleMemberIndexes: [0],
      trunkMode: 'dual',
    });
    const targetDual: RoutingTopologyGroup = {
      ...group([0], {
        side: 'top',
        dualRoleMemberIndexes: [0],
        trunkMode: 'dual',
      }),
      kind: 'target',
      topologyPattern: 'm2o',
      sector: 'n',
    };
    const plan = createDisplayRoutingCorridorReservationPlan(
      [sourceDual, targetDual],
      [corridor('vertical', [50]), corridor('horizontal', [50])],
    );

    expect(plan.reservations).toMatchObject([
      { groupIndex: 0, status: 'reserved', corridorIndex: 0 },
      { groupIndex: 1, status: 'reserved', corridorIndex: 1 },
    ]);
    expect(plan.exhaustedGroupIndexes).toEqual([]);
  });

  it('fails closed for empty, malformed, non-finite, and over-capacity inputs', () => {
    expect(createDisplayRoutingCorridorReservationPlan([], [])).toEqual({
      reservations: [],
      exhaustedGroupIndexes: [],
    });
    const malformed = {
      ...group([0]),
      laneDemand: 2,
    };
    const invalidCorridor = {
      ...corridor('vertical', [50]),
      center: Number.POSITIVE_INFINITY,
    };
    expect(createDisplayRoutingCorridorReservationPlan(
      [malformed, group([1, 2, 3])],
      [invalidCorridor, corridor('vertical', [33, 67])],
    )).toMatchObject({
      reservations: [
        { groupIndex: 0, status: 'exhausted' },
        { groupIndex: 1, status: 'exhausted' },
      ],
      exhaustedGroupIndexes: [0, 1],
    });
  });

  it('records target sectors from the target endpoint perspective', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'target', position: { x: 300, y: -100 }, measured: { width: 100, height: 60 }, data: {} },
    ];
    const edges: Edge[] = [0, 1].map(index => ({
      id: `edge-${index}`,
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: [{ x: 100, y: 30 }, { x: 300, y: -70 }] },
    }));
    const plan = createDisplayRoutingTopologyPlan(nodes, edges);

    expect(plan.groups.find(candidate => candidate.kind === 'source')).toMatchObject({
      sector: 'ne',
      endpointCenter: { x: 50, y: 30 },
    });
    expect(plan.groups.find(candidate => candidate.kind === 'target')).toMatchObject({
      sector: 'sw',
      endpointCenter: { x: 350, y: -70 },
    });
  });
});
