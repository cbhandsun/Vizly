import { describe, expect, it, vi } from 'vitest';

import { buildWorkerDualTrunkPath } from '../edgeRoutingWorkerDualTrunk';

const clearAnalyzer = () => ({
  intersectsAnyObstacle: vi.fn(() => false),
});

describe('edgeRoutingWorkerDualTrunk', () => {
  it('uses a shared handoff coordinate for overlapping parallel trunks', () => {
    const path = buildWorkerDualTrunkPath({
      sourceTrunk: {
        source: { x: 100, y: 0 },
        target: { x: 100, y: 300 },
      },
      targetTrunk: {
        source: { x: 300, y: 100 },
        target: { x: 300, y: 400 },
      },
      startPoint: { x: 0, y: 0 },
      startOffset: { x: 10, y: 0 },
      endOffset: { x: 390, y: 400 },
      endPoint: { x: 400, y: 400 },
      obstacles: [],
      analyzer: clearAnalyzer(),
    });

    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 300 },
      { x: 300, y: 300 },
      { x: 300, y: 400 },
      { x: 390, y: 400 },
      { x: 400, y: 400 },
    ]);
  });

  it('connects perpendicular trunks with an orthogonal handoff', () => {
    const path = buildWorkerDualTrunkPath({
      sourceTrunk: {
        source: { x: 100, y: 0 },
        target: { x: 100, y: 200 },
      },
      targetTrunk: {
        source: { x: 100, y: 300 },
        target: { x: 400, y: 300 },
      },
      startPoint: { x: 0, y: 0 },
      startOffset: { x: 10, y: 0 },
      endOffset: { x: 400, y: 300 },
      endPoint: { x: 410, y: 300 },
      obstacles: [],
      analyzer: clearAnalyzer(),
    });

    expect(path).toContainEqual({ x: 100, y: 200 });
    expect(path).toContainEqual({ x: 100, y: 300 });
    for (let index = 1; index < (path?.length ?? 0); index += 1) {
      const previous = path![index - 1];
      const current = path![index];
      expect(previous.x === current.x || previous.y === current.y).toBe(true);
    }
  });

  it('rejects the composite route when the final path is obstructed', () => {
    const path = buildWorkerDualTrunkPath({
      sourceTrunk: {
        source: { x: 100, y: 0 },
        target: { x: 100, y: 300 },
      },
      targetTrunk: {
        source: { x: 300, y: 0 },
        target: { x: 300, y: 300 },
      },
      startPoint: { x: 0, y: 0 },
      startOffset: { x: 10, y: 0 },
      endOffset: { x: 390, y: 300 },
      endPoint: { x: 400, y: 300 },
      obstacles: [{ x: 150, y: 100, width: 50, height: 50 }],
      analyzer: { intersectsAnyObstacle: vi.fn(() => true) },
    });

    expect(path).toBeNull();
  });
});
