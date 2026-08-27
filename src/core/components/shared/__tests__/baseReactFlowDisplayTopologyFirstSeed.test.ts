import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createDisplayTopologyFirstSeed,
  displayTopologyFirstSeedDoesNotRegress,
} from '../baseReactFlowDisplayTopologyFirstSeed';
import type { RoutingTopologyPlan } from '../baseReactFlowDisplayRoutingTopologyPlan';

const edge = (
  id: string,
  y: number,
): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: {
    computedPath: [
      { x: 0, y },
      { x: 100, y },
    ],
  },
});

const emptyPlan: RoutingTopologyPlan = {
  nodeCount: 0,
  edgeCount: 2,
  groups: [],
  candidateAxes: { x: [], y: [] },
  corridors: [],
  corridorReservations: { reservations: [], exhaustedGroupIndexes: [] },
};

const sharedPlan: RoutingTopologyPlan = {
  ...emptyPlan,
  groups: [{
    kind: 'source',
    endpointId: 'source',
    side: 'right',
    sector: 'e',
    flowRole: 'neutral',
    topologyPattern: 'o2m',
    trunkMode: 'single',
    laneDemand: 2,
    memberEdgeIndexes: [0, 1],
    dualRoleMemberIndexes: [],
    endpointCenter: null,
  }],
};

describe('baseReactFlowDisplayTopologyFirstSeed', () => {
  it('preserves exact input identity when the topology plan has no shared group', () => {
    const edges = [edge('first', 0), edge('second', 100)];

    expect(createDisplayTopologyFirstSeed(edges, [], emptyPlan)).toEqual({
      edges,
      applied: false,
    });
    expect(createDisplayTopologyFirstSeed(edges, [], emptyPlan).edges).toBe(edges);
  });

  it('rejects a candidate that introduces a penalized unrelated overlap', () => {
    const baseline = [edge('first', 0), edge('second', 100)];
    const regressingCandidate = [edge('first', 0), edge('second', 3)];

    expect(displayTopologyFirstSeedDoesNotRegress(baseline, regressingCandidate)).toBe(false);
    expect(displayTopologyFirstSeedDoesNotRegress(baseline, baseline)).toBe(true);
  });

  it('does not replace a complete locked layout baseline with an optional topology seed', () => {
    const lockedEdges = [edge('first', 0), edge('second', 100)].map(candidate => ({
      ...candidate,
      data: { ...candidate.data, layoutPathLocked: true },
    }));

    expect(createDisplayTopologyFirstSeed(lockedEdges, [], sharedPlan)).toEqual({
      edges: lockedEdges,
      applied: false,
    });
    expect(createDisplayTopologyFirstSeed(lockedEdges, [], sharedPlan).edges).toBe(lockedEdges);
  });

});
