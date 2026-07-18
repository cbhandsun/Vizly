import { describe, expect, it } from 'vitest';

import type { PathFindingJob, Point, Rectangle } from '../../../types/routing';
import { createDefaultRoutingConfig, Position } from '../../../types/routing';
import {
  buildWorkerPostProcessContext,
  buildWorkerRoutingResult,
  calculateWorkerPathPresentation,
} from '../edgeRoutingWorkerResult';

const job = (overrides: Partial<PathFindingJob> = {}): PathFindingJob => ({
  jobId: 'job-edge',
  edgeId: 'edge',
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  ...overrides,
});

const rect = (x: number, y: number): Rectangle => ({
  x,
  y,
  width: 100,
  height: 60,
});

describe('edgeRoutingWorkerResult', () => {
  it('builds typed post-processing metadata without dynamic job casts', () => {
    const config = createDefaultRoutingConfig();
    const context = buildWorkerPostProcessContext({
      job: job({
        isManyToOne: true,
        bidirectionalChannel: 1,
        bidirectionalSpacing: 12,
        bidirectionalCount: 3,
        peerGroupSize: 4,
      }),
      config,
      obstacles: [],
      sourceRect: rect(0, 0),
      targetRect: rect(300, 0),
      startPosition: Position.Right,
      endPosition: Position.Left,
      strategyName: 'A* Grid',
      hasSharedTrunk: true,
    });

    expect(context.metadata).toMatchObject({
      isManyToOne: true,
      bidirectionalChannel: 1,
      bidirectionalSpacing: 12,
      bidirectionalCount: 3,
      peerGroupSize: 4,
      strategy: 'A* Grid',
      hasSharedTrunk: true,
    });
  });

  it('places the label on the longest segment and calculates path quality', () => {
    const presentation = calculateWorkerPathPresentation([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 30 },
    ]);

    expect(presentation).toEqual({
      labelPosition: { x: 10, y: 15 },
      bendCount: 1,
      pathLength: 40,
      efficiencyRatio: 0.79,
    });
  });

  it('does not count redundant collinear points as bends', () => {
    const presentation = calculateWorkerPathPresentation([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);

    expect(presentation.bendCount).toBe(0);
    expect(presentation.pathLength).toBe(20);
    expect(presentation.efficiencyRatio).toBe(1);
  });

  it('returns stable metrics for an incomplete path', () => {
    expect(calculateWorkerPathPresentation([{ x: 4, y: 8 }])).toEqual({
      labelPosition: { x: 0, y: 0 },
      bendCount: 0,
      pathLength: 0,
      efficiencyRatio: 1,
    });
  });

  it('assembles routing metadata and exact shared-trunk diagnostics', () => {
    const finalPoints: Point[] = [
      { x: 100, y: 30 },
      { x: 200, y: 30 },
      { x: 200, y: 230 },
    ];
    const result = buildWorkerRoutingResult({
      job: job({
        layoutDirection: 'LR',
        isManyToOne: true,
        busTrunkSource: { x: 200, y: 30 },
        busTrunkTarget: { x: 200, y: 230 },
      }),
      svgPath: 'M 100 30 L 200 30 L 200 230',
      finalPoints,
      rawPoints: finalPoints,
      strategyName: 'Trunk Direct',
      debugData: {},
      routingObstacles: [],
      sourceRect: rect(0, 0),
      targetRect: rect(300, 200),
      startPosition: Position.Right,
      endPosition: Position.Left,
      hasExplicitSource: false,
      hasExplicitTarget: true,
      hasPrecomputedTrunk: true,
      busPeerGroupSize: 3,
      busPeerGroupKey: 'm2o:target',
      busPeerGroupMembers: ['edge', 'edge-2', 'edge-3'],
    });

    expect(result).toMatchObject({
      jobId: 'job-edge',
      edgeId: 'edge',
      labelX: 200,
      labelY: 130,
      sourcePos: Position.Right,
      targetPos: Position.Left,
      metadata: {
        strategy: 'Trunk Direct',
        bendCount: 1,
        pathLength: 300,
        efficiencyRatio: 0.75,
      },
      debugInfo: {
        algorithmDebug: {
          portSelection: {
            hasPrecomputedTrunk: true,
            peerGroupSize: 3,
            peerGroupKey: 'm2o:target',
            trunkAxis: 200,
            trunkVertical: true,
            hasExplicitTarget: true,
          },
        },
      },
    });
  });
});
