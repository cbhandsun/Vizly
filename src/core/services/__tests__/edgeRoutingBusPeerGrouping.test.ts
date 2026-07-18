import { describe, expect, it } from 'vitest';

import type { Rectangle } from '../../algorithms/pathfinding';
import type { PathFindingJob } from '../../types/routing';
import {
  groupBusPeersByHemisphere,
  type BusPeerEdge,
} from '../edgeRoutingBusPeerGrouping';

const rect = (x: number, y: number, width = 10, height = 10): Rectangle => ({
  x,
  y,
  width,
  height,
});

const edge = (
  id: string,
  source = 'hub',
  target = id,
): BusPeerEdge => ({ id, source, target });

const job = (edgeId: string, isReverseEdge = false): PathFindingJob => ({
  jobId: `job-${edgeId}`,
  edgeId,
  source: 'hub',
  target: edgeId,
  sourceX: 0,
  sourceY: 0,
  targetX: 0,
  targetY: 0,
  isReverseEdge,
});

const groupWithRects = (
  peers: readonly unknown[],
  rectangles: Record<string, Rectangle>,
  jobs: PathFindingJob[] = [],
  isManyToOne = false,
) => groupBusPeersByHemisphere({
  hubRect: rect(0, 0),
  busGroupJobs: jobs,
  globalPeers: peers,
  getNodeRect: id => rectangles[id],
  isManyToOne,
});

describe('edgeRoutingBusPeerGrouping', () => {
  it('uses vertical hemispheres while allowing multiple strong side outliers to escape', () => {
    const peers = [
      edge('bottom-a'),
      edge('bottom-b'),
      edge('bottom-c'),
      edge('bottom-d'),
      edge('right-a'),
      edge('right-b'),
    ];
    const result = groupWithRects(peers, {
      'bottom-a': rect(0, 180),
      'bottom-b': rect(10, 200),
      'bottom-c': rect(-10, 220),
      'bottom-d': rect(0, 240),
      'right-a': rect(200, 30),
      'right-b': rect(220, 40),
    });

    expect(result.flow).toBe('vertical');
    expect(result.groups.get('bottom')?.map(item => item.id)).toEqual([
      'bottom-a',
      'bottom-b',
      'bottom-c',
      'bottom-d',
    ]);
    expect(result.groups.get('right')?.map(item => item.id)).toEqual([
      'right-a',
      'right-b',
    ]);
  });

  it('keeps explicit reverse edges in the true flow hemisphere', () => {
    const peers = [
      edge('bottom-a'),
      edge('bottom-b'),
      edge('bottom-c'),
      edge('reverse'),
    ];
    const result = groupWithRects(peers, {
      'bottom-a': rect(0, 180),
      'bottom-b': rect(10, 200),
      'bottom-c': rect(-10, 220),
      reverse: rect(200, 30),
    }, [job('reverse', true)]);

    expect(result.flow).toBe('vertical');
    expect(result.classifications.find(item => item.edge.id === 'reverse')?.side)
      .toBe('bottom');
    expect(result.groups.get('bottom')?.map(item => item.id)).toContain('reverse');
    expect(result.groups.has('right')).toBe(false);
  });

  it('uses horizontal hemispheres and supports cross-axis escape', () => {
    const peers = [
      edge('right-a'),
      edge('right-b'),
      edge('right-c'),
      edge('right-d'),
      edge('top-a'),
      edge('top-b'),
    ];
    const result = groupWithRects(peers, {
      'right-a': rect(180, 0),
      'right-b': rect(200, 10),
      'right-c': rect(220, -10),
      'right-d': rect(240, 0),
      'top-a': rect(30, -200),
      'top-b': rect(40, -220),
    });

    expect(result.flow).toBe('horizontal');
    expect(result.groups.get('right')).toHaveLength(4);
    expect(result.groups.get('top')).toHaveLength(2);
  });

  it('uses only valid unique peers for the escape threshold', () => {
    const peers = [
      edge('bottom-a'),
      edge('bottom-b'),
      edge('outlier'),
      edge('outlier'),
      edge('missing'),
      { id: '', source: 'hub', target: 'invalid' },
    ];
    const result = groupWithRects(peers, {
      'bottom-a': rect(0, 180),
      'bottom-b': rect(10, 200),
      outlier: rect(200, 30),
    });

    expect(result.classifications).toHaveLength(3);
    expect(result.classifications.find(item => item.edge.id === 'outlier')?.side)
      .toBe('bottom');
    expect(result.groups.has('right')).toBe(false);
  });

  it('selects source peers for many-to-one groups', () => {
    const peers = [
      edge('incoming-a', 'source-a', 'hub'),
      edge('incoming-b', 'source-b', 'hub'),
    ];
    const result = groupWithRects(peers, {
      'source-a': rect(-100, 0),
      'source-b': rect(-120, 10),
      hub: rect(500, 500),
    }, [], true);

    expect(result.classifications.map(item => item.peerId)).toEqual([
      'source-a',
      'source-b',
    ]);
    expect(result.groups.get('left')).toHaveLength(2);
  });

  it('merges a non-reverse adjacent singleton back into the largest group', () => {
    const peers = [
      edge('bottom-a'),
      edge('bottom-b'),
      edge('bottom-c'),
      edge('outlier'),
    ];
    const result = groupWithRects(peers, {
      'bottom-a': rect(0, 180),
      'bottom-b': rect(10, 200),
      'bottom-c': rect(-10, 220),
      outlier: rect(200, 30),
    });

    expect(result.classifications.find(item => item.edge.id === 'outlier')?.side)
      .toBe('right');
    expect(result.groups.has('right')).toBe(false);
    expect(result.groups.get('bottom')).toHaveLength(4);
  });

  it('returns an empty result for missing peers or an invalid hub rectangle', () => {
    const missing = groupWithRects([edge('missing')], {});
    expect(missing).toEqual({
      groups: new Map(),
      classifications: [],
      flow: undefined,
    });

    const invalidHub = groupBusPeersByHemisphere({
      hubRect: rect(Number.NaN, 0),
      busGroupJobs: [],
      globalPeers: [edge('peer')],
      getNodeRect: () => rect(0, 100),
      isManyToOne: false,
    });
    expect(invalidHub.classifications).toEqual([]);
    expect(invalidHub.groups.size).toBe(0);
  });
});
