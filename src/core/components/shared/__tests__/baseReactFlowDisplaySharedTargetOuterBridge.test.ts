import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import { findDisplayStrictCrossingHits } from '../baseReactFlowDisplayGeometry';
import { buildSharedTargetOuterBridgeCandidates } from '../baseReactFlowDisplaySharedTargetOuterBridge';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  type: 'process',
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

describe('shared-target outer bridge candidates', () => {
  it('preserves the source trunk and merges into an existing target trunk', () => {
    const edges: Edge[] = [
      {
        id: 'incoming', source: 'loms', target: 'visibility',
        sourceHandle: 'right', targetHandle: 'top',
        data: { computedPath: [
          { x: 1005.5, y: 593 }, { x: 1061.5, y: 593 },
          { x: 1061.5, y: 58.5 }, { x: 1843, y: 58.5 },
          { x: 1843, y: 1360 }, { x: 1216, y: 1360 }, { x: 1216, y: 1539 },
        ] },
      },
      {
        id: 'outgoing', source: 'visibility', target: 'downstream',
        sourceHandle: 'top', targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1312, y: 1539 }, { x: 1312, y: 1483 },
          { x: 1711, y: 1483 }, { x: 1711, y: 179.5 },
        ] },
      },
      {
        id: 'sibling', source: 'wms', target: 'visibility',
        sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [
          { x: 149, y: 931 }, { x: 149, y: 1020 }, { x: 286, y: 1020 },
          { x: 286, y: 1483 }, { x: 1216, y: 1483 }, { x: 1216, y: 1539 },
        ] },
      },
      {
        id: 'source-sibling', source: 'loms', target: 'customs',
        sourceHandle: 'right', targetHandle: 'top',
        data: { computedPath: [
          { x: 1005.5, y: 593 }, { x: 1061.5, y: 593 },
          { x: 1061.5, y: 72 }, { x: 1531, y: 72 },
          { x: 1531, y: 742 }, { x: 1428, y: 742 }, { x: 1428, y: 822 },
        ] },
      },
    ];
    const nodes = [
      node('graph-left', 0, 300, 80, 80),
      node('loms', 826, 533, 179.5, 120),
      node('visibility', 1126.2, 1539, 371.6, 119),
      node('downstream', 1631, 60.5, 160, 119),
      node('wms', 59, 811, 180, 120),
      node('customs', 1338, 822, 180, 119),
    ];
    const crossing = findDisplayStrictCrossingHits(edges)[0];
    expect(crossing).toBeDefined();
    if (!crossing) return;

    const candidates = [
      ...buildSharedTargetOuterBridgeCandidates(edges, crossing.a, crossing.b, nodes),
      ...buildSharedTargetOuterBridgeCandidates(edges, crossing.b, crossing.a, nodes),
    ];
    const clean = candidates.find(candidate => (
      calculateEdgePathQualityScore(candidate).strictCrossings === 0
      && countDisplayObstacleHits(candidate, nodes) === 0
    ));
    expect(clean).toBeDefined();
    if (!clean) return;
    const path = (clean[0].data as { computedPath: Array<{ x: number; y: number }> }).computedPath;

    expect(path.slice(0, 3)).toEqual(
      (edges[0].data as { computedPath: Array<{ x: number; y: number }> }).computedPath.slice(0, 3),
    );
    const siblingSuffix = (edges[2].data as {
      computedPath: Array<{ x: number; y: number }>;
    }).computedPath.slice(-3);
    expect(path.slice(-2)).toEqual(siblingSuffix.slice(-2));
    expect(path[path.length - 3].y).toBe(siblingSuffix[0].y);
    expect(path[path.length - 3].x).toBeLessThanOrEqual(siblingSuffix[0].x);
    expect(clean[0].sourceHandle).toBe('right');
    expect(clean[0].targetHandle).toBe('top');
  });
});
