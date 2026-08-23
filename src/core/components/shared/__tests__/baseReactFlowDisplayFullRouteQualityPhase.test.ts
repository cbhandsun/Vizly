import { describe, expect, it } from 'vitest';

import { shouldMaterializeDetachedMicroAlternative } from '../baseReactFlowDisplayFullRouteQualityPhase';
import {
  changedDisplayPathIndexes,
  collectResidualMicroCandidateEdgeIndexes,
} from '../baseReactFlowDisplayOverlapRepair';

describe('baseReactFlowDisplayFullRouteQualityPhase', () => {
  it('does not duplicate the micro repair family after endpoint-first progress', () => {
    expect(shouldMaterializeDetachedMicroAlternative(false)).toBe(false);
    expect(shouldMaterializeDetachedMicroAlternative(true)).toBe(true);
  });

  it('identifies only geometry-changing residual derivatives', () => {
    const edge = (id: string, middleX: number) => ({
      id,
      source: `${id}-source`,
      target: `${id}-target`,
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: middleX, y: 0 },
          { x: middleX, y: 100 },
        ],
      },
    });
    const baseline = [edge('first', 40), edge('second', 80)];

    expect(changedDisplayPathIndexes(baseline, baseline.map(item => ({
      ...item,
      data: { ...item.data },
    })))).toEqual([]);
    expect(changedDisplayPathIndexes(baseline, [edge('first', 40), edge('second', 96)]))
      .toEqual([1]);
    expect(changedDisplayPathIndexes(baseline, [edge('second', 80), edge('first', 40)]))
      .toEqual([0, 1]);
  });

  it('promotes a geometrically interacting peer into derivative cleanup', () => {
    const baseline = [
      {
        id: 'changed',
        source: 'changed-source',
        target: 'changed-target',
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      },
      {
        id: 'peer',
        source: 'peer-source',
        target: 'peer-target',
        data: { computedPath: [{ x: 50, y: 200 }, { x: 50, y: 300 }] },
      },
    ];
    const derivative = [
      {
        ...baseline[0],
        data: { computedPath: [{ x: 0, y: 250 }, { x: 100, y: 250 }] },
      },
      baseline[1],
    ];

    expect(collectResidualMicroCandidateEdgeIndexes(baseline, derivative))
      .toEqual([0, 1]);
  });
});
