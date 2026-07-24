import { describe, expect, it } from 'vitest';
import { appendEndSideStepCandidates } from '../baseReactFlowDisplayEndpointEndCandidates';
import type { DisplayPoint, DisplaySegment } from '../baseReactFlowDisplayGeometry';

describe('appendEndSideStepCandidates', () => {
  it('adds alternatives for a short horizontal terminal stub', () => {
    const path: DisplayPoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 120, y: 100 },
    ];
    const candidates: DisplayPoint[][] = [];

    appendEndSideStepCandidates(path, [], candidate => candidates.push(candidate));

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(candidate => candidate.at(-1)?.x === 120 && candidate.at(-1)?.y === 100)).toBe(true);
  });

  it('does nothing for a sufficiently long terminal stub', () => {
    const path: DisplayPoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 180, y: 100 },
    ];
    const candidates: DisplayPoint[][] = [];
    const otherSegments: DisplaySegment[] = [];

    appendEndSideStepCandidates(path, otherSegments, candidate => candidates.push(candidate));
    expect(candidates).toEqual([]);
  });
});
