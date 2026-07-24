import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { Rectangle } from '../../algorithms/pathfinding';
import type { PathFindingJob } from '../../types/routing';
import {
  assignBusTrunkGeometry,
  type BusTrunkGeometry,
} from '../edgeRoutingTrunkAssignment';

const rect = (x: number, y: number, width = 10, height = 10): Rectangle => ({
  x,
  y,
  width,
  height,
});

const job = (edgeId: string, source = 'hub', target = edgeId): PathFindingJob => ({
  jobId: `job-${edgeId}`,
  edgeId,
  source,
  target,
  sourceX: 0,
  sourceY: 0,
  targetX: 0,
  targetY: 0,
});

const verticalTrunk = (
  overrides: Partial<BusTrunkGeometry> = {},
): BusTrunkGeometry => ({
  axis: 50,
  direction: 'vertical',
  range: { min: 20, max: 120 },
  suggestedPort: 'bottom',
  ...overrides,
});

describe('edgeRoutingTrunkAssignment', () => {
  it('assigns deterministic O2M order, geometry and typed routing plans', () => {
    const jobs = [job('late'), job('early')];
    const result = assignBusTrunkGeometry({
      edges: [
        { id: 'late', source: 'hub', target: 'peer-late' },
        { id: 'early', source: 'hub', target: 'peer-early' },
      ],
      jobs,
      trunk: verticalTrunk(),
      layoutDirection: 'TB',
      getNodeRect: id => ({
        'peer-late': rect(100, 100),
        'peer-early': rect(0, 40),
      })[id],
      isManyToOne: false,
      peerGroupKeyOverride: 'o2m:hub:bottom',
      trunkPortTangent: 55,
    });

    expect(result).toEqual({
      assignedEdgeIds: ['late', 'early'],
      orderedEdgeIds: ['early', 'late'],
    });
    expect(jobs[0]).toMatchObject({
      trunkOrderIndex: 1,
      trunkOrderCount: 2,
      trunkBranchCoord: 105,
      outgoingCount: 1,
      outgoingIndex: 0,
      incomingCount: 1,
      incomingIndex: 0,
      o2mTrunk: {
        source: { x: 50, y: 20 },
        target: { x: 50, y: 120 },
      },
      o2mTrunkPort: Position.Bottom,
      busTrunkSource: { x: 50, y: 20 },
      busTrunkTarget: { x: 50, y: 120 },
      layoutDirection: 'TB',
    });
    expect(jobs[0].busRoutingPlan).toMatchObject({
      busIndex: 1,
      peerGroupKey: 'o2m:hub:bottom',
      o2mPeerGroupKey: 'o2m:hub:bottom',
      peerGroupSize: 2,
      peerGroupMembers: ['early', 'late'],
      trunkPort: Position.Bottom,
      trunkPortTangent: 55,
      trunkBranchCoord: 105,
      portFrozen: true,
    });
  });

  it('uses M2O source peers, normalizes reversed ranges and clamps conflict slots', () => {
    const jobs = [
      job('incoming-a', 'peer-a', 'hub'),
      job('incoming-b', 'peer-b', 'hub'),
    ];
    assignBusTrunkGeometry({
      edges: [
        { id: 'incoming-a', source: 'peer-a', target: 'hub' },
        { id: 'incoming-b', source: 'peer-b', target: 'hub' },
      ],
      jobs,
      trunk: verticalTrunk({
        range: { min: 150, max: 30 },
        suggestedPort: 'top',
      }),
      layoutDirection: '',
      getNodeRect: id => ({
        'peer-a': rect(0, 20),
        'peer-b': rect(0, 80),
      })[id],
      isManyToOne: true,
      hubPortConflict: true,
      hubPortSlot: 99,
      trunkPortTangent: Number.NaN,
    });

    expect(jobs[0]).toMatchObject({
      incomingCount: 2,
      incomingIndex: 1,
      outgoingCount: 1,
      outgoingIndex: 0,
      m2oTrunk: {
        source: { x: 50, y: 30 },
        target: { x: 50, y: 150 },
      },
      m2oTrunkPort: Position.Top,
      layoutDirection: 'LR',
    });
    expect(jobs[0].busRoutingPlan).toMatchObject({
      peerGroupKey: 'hub',
      m2oPeerGroupKey: 'hub',
      trunkPortTangent: 0,
    });
  });

  it('rejects non-finite trunk geometry without mutating jobs', () => {
    const jobs = [job('edge-a')];
    const before = structuredClone(jobs);
    const result = assignBusTrunkGeometry({
      edges: [{ id: 'edge-a', source: 'hub', target: 'edge-a' }],
      jobs,
      trunk: verticalTrunk({ axis: Number.NaN }),
      layoutDirection: 'LR',
      getNodeRect: () => rect(0, 100),
      isManyToOne: false,
    });

    expect(result).toEqual({ assignedEdgeIds: [], orderedEdgeIds: [] });
    expect(jobs).toEqual(before);
  });

  it('deduplicates edges and ignores invalid or unmatched entries', () => {
    const jobs = [job('valid')];
    const result = assignBusTrunkGeometry({
      edges: [
        { id: 'valid', source: 'hub', target: 'peer' },
        { id: 'valid', source: 'hub', target: 'peer' },
        { id: 'unmatched', source: 'hub', target: 'other' },
        { id: '', source: 'hub', target: 'invalid' },
        null,
      ],
      jobs,
      trunk: verticalTrunk(),
      layoutDirection: 'LR',
      getNodeRect: () => undefined,
      isManyToOne: false,
    });

    expect(result.orderedEdgeIds).toEqual(['unmatched', 'valid']);
    expect(result.assignedEdgeIds).toEqual(['valid']);
    expect(jobs[0].trunkBranchCoord).toBe(0);
    expect(jobs[0].busRoutingPlan?.peerGroupSize).toBe(2);
  });

  it('does not share mutable trunk point objects between jobs', () => {
    const jobs = [job('a'), job('b')];
    assignBusTrunkGeometry({
      edges: [
        { id: 'a', source: 'hub', target: 'a' },
        { id: 'b', source: 'hub', target: 'b' },
      ],
      jobs,
      trunk: verticalTrunk(),
      layoutDirection: 'LR',
      getNodeRect: id => rect(0, id === 'a' ? 50 : 100),
      isManyToOne: false,
    });

    expect(jobs[0].o2mTrunk).not.toBe(jobs[1].o2mTrunk);
    expect(jobs[0].o2mTrunk?.source).not.toBe(jobs[1].o2mTrunk?.source);
    expect(jobs[0].busTrunkSource).not.toBe(jobs[1].busTrunkSource);
  });
});
