import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairDisplayMicroArtifacts } from '../edgeDisplayMicroCleanup';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';

describe('repairDisplayMicroArtifacts shared trunks', () => {
  it('borrows a same-source readable trunk instead of keeping a tiny crossing dodge', () => {
    const edges: Edge[] = [
      {
        id: 'e_md_asn',
        source: 'master-data',
        target: 'asn',
        data: {
          sharedTrunkAware: true,
          computedPath: [
            { x: 4351, y: 496 },
            { x: 4243, y: 496 },
            { x: 4243, y: 614 },
            { x: 2386, y: 614 },
            { x: 2386, y: 686 },
            { x: 918, y: 686 },
            { x: 918, y: 486 },
            { x: 776, y: 486 },
          ],
        },
      },
      {
        id: 'e_md_erp',
        source: 'master-data',
        target: 'erp',
        data: {
          sharedTrunkAware: true,
          computedPath: [
            { x: 4351, y: 496 },
            { x: 4255, y: 496 },
            { x: 4255, y: 686 },
            { x: 4243, y: 686 },
            { x: 4243, y: 698 },
            { x: 347, y: 698 },
            { x: 347, y: 638 },
            { x: 291, y: 638 },
          ],
        },
      },
      {
        id: 'e_so_inv',
        source: 'so',
        target: 'inventory-view',
        data: {
          computedPath: [
            { x: 5401, y: 506 },
            { x: 5312, y: 506 },
            { x: 5312, y: 686 },
            { x: 2374, y: 686 },
            { x: 2374, y: 526 },
            { x: 2290, y: 526 },
            { x: 2290, y: 217 },
            { x: 2386, y: 217 },
          ],
        },
      },
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);
    const repairedPath = (repaired.find(edge => edge.id === 'e_md_erp')?.data as any)?.computedPath;

    expect(baseline.tinyInteriorDoglegs).toBe(2);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
    expect(repairedPath).toEqual([
      { x: 4351, y: 496 },
      { x: 4243, y: 496 },
      { x: 4243, y: 614 },
      { x: 2386, y: 614 },
      { x: 2386, y: 686 },
      { x: 2242, y: 686 },
      { x: 2242, y: 638 },
      { x: 291, y: 638 },
    ]);
  });
});
