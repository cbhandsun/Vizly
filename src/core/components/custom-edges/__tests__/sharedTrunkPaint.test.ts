import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  applySharedTrunkPaintPlan,
  createSharedTrunkBackboneFragments,
  createSharedTrunkHiddenFragments,
  createSharedTrunkJunctionFragments,
  createSharedTrunkPaintFragments,
  MIXED_SEMANTIC_SHARED_TRUNK_PAINT,
  readSharedTrunkPaintPlan,
} from '../../../rendering/sharedTrunkPaint';

const edge = ({
  id,
  source,
  target,
  points,
  stroke = '#47cacc',
  selected = false,
}: {
  id: string;
  source: string;
  target: string;
  points: Array<{ x: number; y: number }>;
  stroke?: string;
  selected?: boolean;
}): Edge => ({
  id,
  source,
  target,
  type: 'stablePath',
  selected,
  style: { stroke, strokeWidth: 2, strokeDasharray: '6 4' },
  data: { computedPath: points, sharedTrunkSynthesized: true },
});

const planFor = (edges: readonly Edge[], edgeId: string) => {
  const planned = applySharedTrunkPaintPlan(edges);
  return readSharedTrunkPaintPlan(planned.find(item => item.id === edgeId)?.data);
};

describe('shared trunk paint planning', () => {
  it('paints a compatible target trunk once and keeps each incoming branch visible', () => {
    const edges = [
      edge({
        id: 'a-owner',
        source: 'left',
        target: 'hub',
        points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }],
      }),
      edge({
        id: 'b-member',
        source: 'bottom',
        target: 'hub',
        points: [{ x: 50, y: 80 }, { x: 50, y: 0 }, { x: 100, y: 0 }],
      }),
      edge({
        id: 'c-member',
        source: 'top',
        target: 'hub',
        points: [{ x: 50, y: -80 }, { x: 50, y: 0 }, { x: 100, y: 0 }],
      }),
    ];
    const planned = applySharedTrunkPaintPlan(edges);
    const ownerPlan = readSharedTrunkPaintPlan(planned[0].data);
    const memberPlan = readSharedTrunkPaintPlan(planned[1].data);
    expect(ownerPlan?.memberships[0]).toMatchObject({
      role: 'target',
      ownerEdgeId: 'a-owner',
      edgeIds: ['a-owner', 'b-member', 'c-member'],
      commonLength: 50,
    });
    expect(ownerPlan?.hiddenRanges).toEqual([
      expect.objectContaining({ from: 50, to: 100, role: 'target', ownerEdgeId: 'a-owner' }),
    ]);
    expect(ownerPlan?.backboneRanges).toEqual([
      expect.objectContaining({
        from: 50,
        to: 100,
        role: 'target',
        ownerEdgeId: 'a-owner',
        paint: expect.objectContaining({ token: 'semantic', stroke: '#47CACC' }),
      }),
    ]);
    expect(memberPlan?.hiddenRanges).toEqual([
      expect.objectContaining({ from: 80, to: 130, role: 'target', ownerEdgeId: 'a-owner' }),
    ]);

    const fragments = createSharedTrunkPaintFragments(
      (planned[1].data as Record<string, unknown>).computedPath,
      memberPlan,
    );
    expect(fragments).toEqual([{
      points: [{ x: 50, y: 80 }, { x: 50, y: 0 }],
      startsAtSource: true,
      endsAtTarget: false,
    }]);
    expect(createSharedTrunkBackboneFragments(planned[0].data?.computedPath, ownerPlan)).toEqual([
      expect.objectContaining({
        points: [{ x: 50, y: 0 }, { x: 100, y: 0 }],
        from: 50,
        to: 100,
        roles: ['target'],
        paint: expect.objectContaining({ token: 'semantic', stroke: '#47CACC' }),
      }),
    ]);
    expect(createSharedTrunkJunctionFragments(planned[0].data?.computedPath, ownerPlan)).toEqual([
      expect.objectContaining({
        point: { x: 50, y: 0 },
        distance: 50,
        roles: ['target'],
        paint: expect.objectContaining({ token: 'semantic', stroke: '#47CACC' }),
      }),
    ]);
  });

  it('anchors a tolerant reverse target trunk junction to the exact member tap', () => {
    const planned = applySharedTrunkPaintPlan([
      edge({
        id: 'a-owner',
        source: 'forward-source',
        target: 'shared-target',
        points: [
          { x: 0, y: 80 },
          { x: 0, y: 0 },
          { x: 100.1125, y: 0 },
        ],
      }),
      edge({
        id: 'reverse-member',
        source: 'reverse-source',
        target: 'shared-target',
        points: [
          { x: 50, y: 80 },
          { x: 50, y: 0 },
          { x: 100, y: 0 },
        ],
      }),
    ]);
    const ownerPlan = readSharedTrunkPaintPlan(planned[0].data);

    expect(ownerPlan?.junctions).toEqual([
      expect.objectContaining({
        point: { x: 50, y: 0 },
        role: 'target',
        ownerEdgeId: 'a-owner',
      }),
    ]);
    expect(createSharedTrunkJunctionFragments(planned[0].data?.computedPath, ownerPlan)).toEqual([
      expect.objectContaining({
        point: { x: 50, y: 0 },
        roles: ['target'],
      }),
    ]);
  });

  it('uses one canonical backbone across semantic paints and restores paint after branching', () => {
    const edges = [
      edge({
        id: 'main',
        source: 'hub',
        target: 'one',
        stroke: '#ff5722',
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }],
      }),
      edge({
        id: 'data',
        source: 'hub',
        target: 'two',
        stroke: '#47cacc',
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -80 }],
      }),
    ];
    edges[0].style = { stroke: '#ff5722', strokeWidth: 3 };

    const planned = applySharedTrunkPaintPlan(edges);
    const mainPlan = readSharedTrunkPaintPlan(planned[0].data);
    const dataPlan = readSharedTrunkPaintPlan(planned[1].data);

    expect(mainPlan?.memberships).toEqual([
      expect.objectContaining({
        role: 'source',
        ownerEdgeId: 'main',
        edgeIds: ['data', 'main'],
        commonLength: 60,
      }),
    ]);
    expect(mainPlan?.hiddenRanges).toEqual([
      expect.objectContaining({ from: 0, to: 60, role: 'source', ownerEdgeId: 'main' }),
    ]);
    expect(mainPlan?.backboneRanges).toEqual([
      expect.objectContaining({
        from: 0,
        to: 60,
        paint: MIXED_SEMANTIC_SHARED_TRUNK_PAINT,
      }),
    ]);
    expect(dataPlan?.hiddenRanges).toEqual([
      expect.objectContaining({ from: 0, to: 60, role: 'source', ownerEdgeId: 'main' }),
    ]);
    expect(createSharedTrunkPaintFragments(planned[1].data?.computedPath, dataPlan)).toEqual([{
      points: [{ x: 60, y: 0 }, { x: 60, y: -80 }],
      startsAtSource: false,
      endsAtTarget: true,
    }]);
    expect(createSharedTrunkPaintFragments(planned[0].data?.computedPath, mainPlan)).toEqual([{
      points: [{ x: 60, y: 0 }, { x: 60, y: 80 }],
      startsAtSource: false,
      endsAtTarget: true,
    }]);
    expect(createSharedTrunkBackboneFragments(planned[0].data?.computedPath, mainPlan)).toEqual([
      expect.objectContaining({
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }],
        roles: ['source'],
        paint: MIXED_SEMANTIC_SHARED_TRUNK_PAINT,
      }),
    ]);
    expect(createSharedTrunkJunctionFragments(planned[0].data?.computedPath, mainPlan)).toEqual([
      expect.objectContaining({
        point: { x: 60, y: 0 },
        distance: 60,
        roles: ['source'],
        paint: MIXED_SEMANTIC_SHARED_TRUNK_PAINT,
      }),
    ]);
    expect(createSharedTrunkHiddenFragments(planned[1].data?.computedPath, dataPlan)).toEqual([
      expect.objectContaining({
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }],
        roles: ['source'],
        ownerEdgeIds: ['main'],
        membershipIds: ['source:hub:main'],
      }),
    ]);
    expect(planned[0].style).toEqual(edges[0].style);
    expect(planned[1].style).toEqual(edges[1].style);
  });

  it('preserves an edge that is both a source-trunk and target-trunk member', () => {
    const bridge = edge({
      id: 'bridge',
      source: 'source-hub',
      target: 'target-hub',
      points: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 60 },
        { x: 120, y: 60 },
      ],
    });
    const edges = [
      edge({
        id: 'a-source-owner',
        source: 'source-hub',
        target: 'source-branch',
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -80 }],
      }),
      edge({
        id: 'a-target-owner',
        source: 'target-branch',
        target: 'target-hub',
        points: [{ x: 60, y: 140 }, { x: 60, y: 60 }, { x: 120, y: 60 }],
      }),
      bridge,
    ];

    const plan = planFor(edges, 'bridge');
    expect(plan?.memberships.map(item => item.role).sort()).toEqual(['source', 'target']);
    expect(plan?.hiddenRanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 0, to: 60, role: 'source' }),
      expect.objectContaining({ from: 120, to: 180, role: 'target' }),
    ]));
    expect(createSharedTrunkPaintFragments(bridge.data?.computedPath, plan)).toEqual([{
      points: [{ x: 60, y: 0 }, { x: 60, y: 60 }],
      startsAtSource: false,
      endsAtTarget: false,
    }]);
  });

  it('keeps dual-role ownership deterministic when transient selection changes', () => {
    const bridge = edge({
      id: 'bridge',
      source: 'source-hub',
      target: 'target-hub',
      selected: true,
      points: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 60 },
        { x: 120, y: 60 },
      ],
    });
    const planned = applySharedTrunkPaintPlan([
      edge({
        id: 'a-source-owner',
        source: 'source-hub',
        target: 'source-branch',
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -80 }],
      }),
      edge({
        id: 'a-target-owner',
        source: 'target-branch',
        target: 'target-hub',
        points: [{ x: 60, y: 140 }, { x: 60, y: 60 }, { x: 120, y: 60 }],
      }),
      bridge,
    ]);
    const selected = planned.find(item => item.id === 'bridge');
    const plan = readSharedTrunkPaintPlan(selected?.data);

    expect(plan?.memberships.map(item => `${item.role}:${item.ownerEdgeId}`).sort()).toEqual([
      'source:a-source-owner',
      'target:a-target-owner',
    ]);
    expect(plan?.hiddenRanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'source', ownerEdgeId: 'a-source-owner' }),
      expect.objectContaining({ role: 'target', ownerEdgeId: 'a-target-owner' }),
    ]));
    expect(createSharedTrunkPaintFragments(selected?.data?.computedPath, plan)).toEqual([{
      points: [{ x: 60, y: 0 }, { x: 60, y: 60 }],
      startsAtSource: false,
      endsAtTarget: false,
    }]);
  });

  it('selects the same canonical backbone regardless of edge input order', () => {
    const semanticBranches = [
      edge({
        id: 'data-a',
        source: 'hub',
        target: 'data-target',
        stroke: '#47cacc',
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: -80 }],
      }),
      edge({
        id: 'main-z',
        source: 'hub',
        target: 'main-target',
        stroke: '#ff5722',
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }],
      }),
    ];
    semanticBranches[1].style = { stroke: '#ff5722', strokeWidth: 3 };

    const forward = planFor(semanticBranches, 'data-a');
    const reverse = planFor([...semanticBranches].reverse(), 'data-a');
    expect(forward).toEqual(reverse);
    expect(forward?.memberships[0]?.ownerEdgeId).toBe('main-z');
  });

  it('plans independent true stems at the same endpoint without combining them', () => {
    const edges = [
      edge({
        id: 'east-a',
        source: 'hub',
        target: 'east-top',
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -80 }],
      }),
      edge({
        id: 'east-b',
        source: 'hub',
        target: 'east-bottom',
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }],
      }),
      edge({
        id: 'west-a',
        source: 'hub',
        target: 'west-top',
        points: [{ x: 0, y: 0 }, { x: -60, y: 0 }, { x: -60, y: -80 }],
      }),
      edge({
        id: 'west-b',
        source: 'hub',
        target: 'west-bottom',
        points: [{ x: 0, y: 0 }, { x: -60, y: 0 }, { x: -60, y: 80 }],
      }),
    ];

    const planned = applySharedTrunkPaintPlan(edges);
    const eastPlan = readSharedTrunkPaintPlan(planned.find(item => item.id === 'east-a')?.data);
    const westPlan = readSharedTrunkPaintPlan(planned.find(item => item.id === 'west-a')?.data);
    expect(eastPlan?.memberships[0]?.edgeIds).toEqual(['east-a', 'east-b']);
    expect(westPlan?.memberships[0]?.edgeIds).toEqual(['west-a', 'west-b']);
  });

  it('deduplicates a nested stem after another semantic branch leaves the backbone', () => {
    const edges = [
      edge({
        id: 'main-root',
        source: 'hub',
        target: 'main-target',
        stroke: '#ff5722',
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -80 }],
      }),
      edge({
        id: 'data-a',
        source: 'hub',
        target: 'data-top',
        points: [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
          { x: 120, y: -80 },
        ],
      }),
      edge({
        id: 'data-b',
        source: 'hub',
        target: 'data-bottom',
        points: [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
          { x: 120, y: 80 },
        ],
      }),
    ];
    edges[0].style = { stroke: '#ff5722', strokeWidth: 3 };

    const planned = applySharedTrunkPaintPlan(edges);
    const dataAPlan = readSharedTrunkPaintPlan(planned[1].data);
    const dataBPlan = readSharedTrunkPaintPlan(planned[2].data);

    expect(dataAPlan?.memberships.map(membership => membership.ownerEdgeId)).toEqual([
      'main-root',
      'data-a',
    ]);
    expect(dataAPlan?.hiddenRanges).toEqual([
      expect.objectContaining({ from: 0, to: 60, ownerEdgeId: 'main-root' }),
      expect.objectContaining({ from: 60, to: 120, ownerEdgeId: 'data-a' }),
    ]);
    expect(dataAPlan?.backboneRanges).toEqual([
      expect.objectContaining({
        from: 60,
        to: 120,
        ownerEdgeId: 'data-a',
        paint: expect.objectContaining({ token: 'semantic', stroke: '#47CACC' }),
      }),
    ]);
    expect(dataBPlan?.hiddenRanges).toEqual([
      expect.objectContaining({ from: 0, to: 60, ownerEdgeId: 'main-root' }),
      expect.objectContaining({ from: 0, to: 120, ownerEdgeId: 'data-a' }),
    ]);
    expect(createSharedTrunkPaintFragments(planned[2].data?.computedPath, dataBPlan)).toEqual([{
      points: [{ x: 120, y: 0 }, { x: 120, y: 80 }],
      startsAtSource: false,
      endsAtTarget: true,
    }]);
  });

  it('merges adjacent backbone ranges and preserves overlapping source/target identities', () => {
    const orangePaint = {
      token: 'semantic',
      stroke: '#ff5722',
      strokeWidth: 3,
      strokeDasharray: '',
      opacity: 1,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    };
    const cyanPaint = {
      ...orangePaint,
      stroke: '#47cacc',
      strokeWidth: 2,
      strokeDasharray: '6 4',
    };
    const plan = readSharedTrunkPaintPlan({
      __vizlySharedTrunkPaint: {
        hiddenRanges: [],
        memberships: [
          {
            id: 'source:first',
            role: 'source',
            endpointId: 'source-hub',
            ownerEdgeId: 'bridge',
            edgeIds: ['bridge', 'source-peer'],
            commonLength: 30,
          },
          {
            id: 'source:second',
            role: 'source',
            endpointId: 'source-hub',
            ownerEdgeId: 'bridge',
            edgeIds: ['bridge', 'source-peer'],
            commonLength: 70,
          },
          {
            id: 'target:only',
            role: 'target',
            endpointId: 'target-hub',
            ownerEdgeId: 'bridge',
            edgeIds: ['bridge', 'target-peer'],
            commonLength: 70,
          },
        ],
        backboneRanges: [
          {
            from: 0,
            to: 30,
            role: 'source',
            ownerEdgeId: 'bridge',
            membershipId: 'source:first',
            paint: orangePaint,
          },
          {
            from: 30,
            to: 70,
            role: 'source',
            ownerEdgeId: 'bridge',
            membershipId: 'source:second',
            paint: orangePaint,
          },
          {
            from: 50,
            to: 120,
            role: 'target',
            ownerEdgeId: 'bridge',
            membershipId: 'target:only',
            paint: cyanPaint,
          },
        ],
      },
    });

    expect(createSharedTrunkBackboneFragments(
      [{ x: 0, y: 0 }, { x: 120, y: 0 }],
      plan,
    )).toEqual([
      expect.objectContaining({
        from: 0,
        to: 50,
        roles: ['source'],
        membershipIds: ['source:first', 'source:second'],
        paint: expect.objectContaining({ token: 'semantic', stroke: '#FF5722' }),
      }),
      expect.objectContaining({
        from: 50,
        to: 70,
        roles: ['source', 'target'],
        paint: MIXED_SEMANTIC_SHARED_TRUNK_PAINT,
      }),
      expect.objectContaining({
        from: 70,
        to: 120,
        roles: ['target'],
        paint: expect.objectContaining({ token: 'semantic', stroke: '#47CACC' }),
      }),
    ]);
  });

  it('rejects invalid and extreme path payloads without mutating edge data', () => {
    const invalid = edge({
      id: 'invalid',
      source: 'hub',
      target: 'one',
      points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }],
    });
    const extreme = edge({
      id: 'extreme',
      source: 'hub',
      target: 'two',
      points: Array.from({ length: 513 }, (_, index) => ({ x: index, y: 0 })),
    });
    extreme.style = { stroke: { malicious: '<script>' } as unknown as string };

    const edges = [invalid, extreme];
    expect(applySharedTrunkPaintPlan(edges)).toBe(edges);
    expect(readSharedTrunkPaintPlan({
      __vizlySharedTrunkPaint: {
        hiddenRanges: [{ from: '0', to: 10, role: 'source', ownerEdgeId: 'owner' }],
        memberships: [],
      },
    })?.hiddenRanges).toEqual([]);
    expect(readSharedTrunkPaintPlan({
      __vizlySharedTrunkPaint: {
        hiddenRanges: [],
        memberships: [{
          id: 'unsafe',
          role: 'source',
          endpointId: 'hub',
          ownerEdgeId: 'missing-owner',
          edgeIds: ['member-a', 'member-b'],
          commonLength: Number.POSITIVE_INFINITY,
        }],
      },
    })?.memberships).toEqual([]);
    expect(readSharedTrunkPaintPlan({
      __vizlySharedTrunkPaint: {
        hiddenRanges: [],
        memberships: [{
          id: 'source:unsafe',
          role: 'source',
          endpointId: 'hub',
          ownerEdgeId: 'owner',
          edgeIds: ['owner', 'member'],
          commonLength: 60,
        }],
        backboneRanges: [{
          from: 0,
          to: 60,
          role: 'source',
          ownerEdgeId: 'owner',
          membershipId: 'source:unsafe',
          paint: {
            token: 'semantic',
            stroke: 'url(javascript:alert(1))',
            strokeWidth: 999,
            opacity: Number.NaN,
          },
        }],
      },
    })).toBeNull();
    expect(readSharedTrunkPaintPlan({
      __vizlySharedTrunkPaint: {
        version: 1,
        edgeId: 'owner',
        hiddenRanges: [{ from: 0, to: 60, role: 'source', ownerEdgeId: 'owner' }],
        memberships: [{
          id: 'source:invalid-junction',
          role: 'source',
          endpointId: 'hub',
          ownerEdgeId: 'owner',
          edgeIds: ['owner', 'member'],
          commonLength: 60,
        }],
        backboneRanges: [{
          from: 0,
          to: 60,
          role: 'source',
          ownerEdgeId: 'owner',
          membershipId: 'source:invalid-junction',
          paint: {
            token: 'semantic',
            stroke: '#47cacc',
            strokeWidth: 2,
            strokeDasharray: '6 4',
            opacity: 1,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          },
        }],
        junctions: [{
          point: { x: Number.POSITIVE_INFINITY, y: 0 },
          distance: 60,
          role: 'source',
          ownerEdgeId: 'owner',
          membershipId: 'source:invalid-junction',
          paint: {
            token: 'semantic',
            stroke: '#47cacc',
            strokeWidth: 2,
            strokeDasharray: '6 4',
            opacity: 1,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          },
        }],
      },
    })).toBeNull();
    expect(readSharedTrunkPaintPlan({
      __vizlySharedTrunkPaint: {
        version: 1,
        edgeId: 'owner',
        hiddenRanges: [{
          from: 0,
          to: 60,
          role: 'source',
          ownerEdgeId: 'owner',
        }],
        memberships: [{
          id: 'source:orphan',
          role: 'source',
          endpointId: 'hub',
          ownerEdgeId: 'owner',
          edgeIds: ['owner', 'member'],
          commonLength: 60,
        }],
        backboneRanges: [],
      },
    })).toBeNull();

    const oversizedGroup = Array.from({ length: 129 }, (_, index) => edge({
      id: `edge-${index}`,
      source: 'hub',
      target: `target-${index}`,
      points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 + index }],
    }));
    expect(applySharedTrunkPaintPlan(oversizedGroup)).toBe(oversizedGroup);

    const duplicateIds = [
      edge({
        id: 'duplicate',
        source: 'hub',
        target: 'one',
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }],
      }),
      edge({
        id: 'duplicate',
        source: 'hub',
        target: 'two',
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -80 }],
      }),
    ];
    expect(applySharedTrunkPaintPlan(duplicateIds)).toBe(duplicateIds);
  });

  it('strips a stale legacy v0 plan from a graph that cannot form a trunk', () => {
    const original = edge({
      id: 'standalone',
      source: 'source',
      target: 'target',
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
    });
    const withStalePlan: Edge = {
      ...original,
      data: {
        ...original.data,
        preserved: 'keep-me',
        __vizlySharedTrunkPaint: {
          hiddenRanges: [{
            from: 0,
            to: 60,
            role: 'source',
            ownerEdgeId: 'orphan-owner',
          }],
          memberships: [],
        },
      },
    };

    const input = [withStalePlan];
    const planned = applySharedTrunkPaintPlan(input);

    expect(planned).not.toBe(input);
    expect(planned[0]).not.toBe(withStalePlan);
    expect(readSharedTrunkPaintPlan(planned[0].data)).toBeNull();
    expect(planned[0].data).toMatchObject({
      computedPath: original.data?.computedPath,
      preserved: 'keep-me',
      sharedTrunkSynthesized: true,
    });
    expect(planned[0].style).toBe(withStalePlan.style);
  });

  it('atomically removes stale v1 plans from every non-participating edge', () => {
    const first = edge({
      id: 'first',
      source: 'first-source',
      target: 'first-target',
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
    });
    const second = edge({
      id: 'second',
      source: 'second-source',
      target: 'second-target',
      points: [{ x: 0, y: 40 }, { x: 80, y: 40 }],
    });
    const stalePlan = (edgeId: string) => ({
      version: 1,
      edgeId,
      hiddenRanges: [{
        from: 0,
        to: 60,
        role: 'source',
        ownerEdgeId: 'removed-owner',
      }],
      memberships: [{
        id: 'source:removed-owner',
        role: 'source',
        endpointId: 'removed-endpoint',
        ownerEdgeId: 'removed-owner',
        edgeIds: ['removed-owner', edgeId],
        commonLength: 60,
      }],
      backboneRanges: [],
    });
    const input: Edge[] = [first, second].map(item => ({
      ...item,
      data: {
        ...item.data,
        preserved: item.id,
        __vizlySharedTrunkPaint: stalePlan(item.id),
      },
    }));

    const planned = applySharedTrunkPaintPlan(input);

    expect(planned).not.toBe(input);
    expect(planned.map(item => readSharedTrunkPaintPlan(item.data))).toEqual([null, null]);
    expect(planned.map(item => item.data?.preserved)).toEqual(['first', 'second']);
    expect(planned.map(item => item.data?.computedPath)).toEqual(
      input.map(item => item.data?.computedPath),
    );
  });

  it('rebuilds the whole graph instead of trusting stale versioned ownership', () => {
    const input = [
      edge({
        id: 'alpha',
        source: 'hub',
        target: 'alpha-target',
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: -80 }],
      }),
      edge({
        id: 'beta',
        source: 'hub',
        target: 'beta-target',
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }],
      }),
    ].map(item => ({
      ...item,
      data: {
        ...item.data,
        __vizlySharedTrunkPaint: {
          version: 1,
          edgeId: item.id,
          hiddenRanges: [],
          memberships: [{
            id: 'source:stale',
            role: 'source',
            endpointId: 'stale-hub',
            ownerEdgeId: 'stale-owner',
            edgeIds: ['stale-owner', item.id],
            commonLength: 999,
          }],
          backboneRanges: [],
        },
      },
    })) satisfies Edge[];

    const planned = applySharedTrunkPaintPlan(input);
    const alphaPlan = readSharedTrunkPaintPlan(planned[0].data);
    const betaPlan = readSharedTrunkPaintPlan(planned[1].data);

    expect(alphaPlan).toMatchObject({ version: 1, edgeId: 'alpha' });
    expect(betaPlan).toMatchObject({ version: 1, edgeId: 'beta' });
    expect(alphaPlan?.memberships[0]).toMatchObject({
      endpointId: 'hub',
      ownerEdgeId: 'alpha',
      edgeIds: ['alpha', 'beta'],
      commonLength: 80,
    });
    expect(betaPlan?.memberships[0]).toMatchObject({
      endpointId: 'hub',
      ownerEdgeId: 'alpha',
      edgeIds: ['alpha', 'beta'],
      commonLength: 80,
    });
    expect(alphaPlan?.memberships.some(item => item.ownerEdgeId === 'stale-owner')).toBe(false);
    expect(betaPlan?.memberships.some(item => item.ownerEdgeId === 'stale-owner')).toBe(false);
  });
});
