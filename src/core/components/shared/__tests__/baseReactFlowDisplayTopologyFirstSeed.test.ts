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

const pathOf = (candidate: Edge | undefined): Array<{ x: number; y: number }> => {
  const path = candidate?.data?.computedPath;
  return Array.isArray(path) ? path as Array<{ x: number; y: number }> : [];
};

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
  it('materializes an O2M source trunk before repair without introducing hard defects', () => {
    const edges: Edge[] = [
      {
        id: 'hub-left',
        source: 'hub',
        target: 'left',
        data: { computedPath: [
          { x: 1218, y: 1199 },
          { x: 1218, y: 1239 },
          { x: 1024, y: 1239 },
          { x: 1024, y: 1377 },
        ] },
      },
      {
        id: 'hub-right',
        source: 'hub',
        target: 'right',
        data: { computedPath: [
          { x: 1428, y: 1199 },
          { x: 1428, y: 1239 },
          { x: 1923, y: 1239 },
          { x: 1923, y: 1921 },
        ] },
      },
      {
        id: 'hub-middle',
        source: 'hub',
        target: 'middle',
        data: { computedPath: [
          { x: 1323, y: 1199 },
          { x: 1323, y: 1259 },
          { x: 1665, y: 1259 },
          { x: 1665, y: 1377 },
        ] },
      },
    ];
    const plan: RoutingTopologyPlan = {
      ...emptyPlan,
      edgeCount: edges.length,
      groups: [{
        ...sharedPlan.groups[0],
        laneDemand: edges.length,
        memberEdgeIndexes: [0, 1, 2],
      }],
    };

    const result = createDisplayTopologyFirstSeed(edges, [], plan);
    const paths = result.edges.map(pathOf);

    expect(result.applied).toBe(true);
    expect(result.edges).not.toBe(edges);
    expect(paths.map(path => path[0])).toEqual([
      { x: 1323, y: 1199 },
      { x: 1323, y: 1199 },
      { x: 1323, y: 1199 },
    ]);
    expect(paths.map(path => path[1])).toEqual([
      { x: 1323, y: 1239 },
      { x: 1323, y: 1239 },
      { x: 1323, y: 1239 },
    ]);
    expect(result.quality).toMatchObject({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
    });
  });

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
