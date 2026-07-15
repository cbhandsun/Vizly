import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairResidualHairpinBridges } from '../edgeHairpinBridgeWidenRepair';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';

const path = [
  { x: 4351, y: 496 },
  { x: 4351, y: 105 },
  { x: 4822, y: 105 },
  { x: 4822, y: 73 },
  { x: 291, y: 73 },
  { x: 291, y: 638 },
];

const edge = (id: string, points: Array<{ x: number; y: number }>): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  sourceHandle: 'left',
  targetHandle: 'right',
  data: { computedPath: points },
});

describe('repairResidualHairpinBridges', () => {
  it('widens the shortest safe internal bridge while preserving both endpoints', () => {
    const original = edge('master-data-erp', path);
    expect(calculateEdgePathQualityScore([original]).hairpins).toBe(1);

    const [repaired] = repairResidualHairpinBridges([original], []);
    const repairedPath = (repaired.data as any).computedPath as typeof path;
    const quality = calculateEdgePathQualityScore([repaired]);

    expect(repairedPath[0]).toEqual(path[0]);
    expect(repairedPath.at(-1)).toEqual(path.at(-1));
    expect(repairedPath[2]).toEqual({ x: 4822, y: 105 });
    expect(repairedPath[3]).toEqual({ x: 4822, y: -35 });
    expect(repairedPath[4]).toEqual({ x: 291, y: -35 });
    expect((repaired.data as any).hairpinBridgeWidened).toBe(true);
    expect(quality.hairpins).toBe(0);
    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.reverseOverlap).toBe(0);
  });

  it('keeps the original bridge when every widened lane creates a strict crossing', () => {
    const original = edge('master-data-erp', path);
    const blocker = edge('blocker', [
      { x: 1000, y: -120 },
      { x: 1000, y: 0 },
    ]);
    expect(calculateEdgePathQualityScore([original, blocker]).strictCrossings).toBe(0);

    const [repaired] = repairResidualHairpinBridges([original, blocker], []);

    expect((repaired.data as any).computedPath).toEqual(path);
    expect((repaired.data as any).hairpinBridgeWidened).toBeUndefined();
    expect(calculateEdgePathQualityScore([repaired, blocker]).strictCrossings).toBe(0);
  });
});
