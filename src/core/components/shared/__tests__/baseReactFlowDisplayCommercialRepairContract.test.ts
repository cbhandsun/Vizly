import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { commercialRepairOutputIsEquivalent } from '../baseReactFlowDisplayCommercialRepairContract';

const edge = (computedPath: Array<{ x: number; y: number }>, repaired = false): Edge => ({
  id: 'edge',
  source: 'source',
  target: 'target',
  data: {
    computedPath,
    displayNodeClearanceRepaired: repaired,
  },
});

describe('commercial repair output contract', () => {
  const path = [{ x: 0, y: 0 }, { x: 80, y: 0 }];

  it('accepts equivalent routing geometry and routing-owned repair flags', () => {
    expect(commercialRepairOutputIsEquivalent([edge(path)], [edge([...path])])).toBe(true);
  });

  it('rejects changed geometry', () => {
    expect(commercialRepairOutputIsEquivalent(
      [edge(path)],
      [edge([{ x: 0, y: 0 }, { x: 96, y: 0 }])],
    )).toBe(false);
  });

  it('rejects a routing-owned repair flag change even when geometry matches', () => {
    expect(commercialRepairOutputIsEquivalent([edge(path)], [edge(path, true)])).toBe(false);
  });
});
