import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  commitComputedDisplayEdgeTerminals,
} from '../baseReactFlowDisplayEndpointAnchoring';
import { fastDisplayHardSafetyIsClean } from '../baseReactFlowFastEdgeSafety';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
  { id: 'target', position: { x: 300, y: 200 }, data: {}, measured: { width: 100, height: 60 } },
];

describe('baseReactFlowDisplayEndpointAnchoring terminal commit', () => {
  it('extends an available terminal lane to 48px without adding a tiny dogleg', () => {
    const [result] = commitComputedDisplayEdgeTerminals([{
      id: 'short-available-terminal-lane',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 50, y: 60 },
          { x: 50, y: 300 },
          { x: 260, y: 300 },
          { x: 260, y: 270 },
          { x: 299, y: 270 },
          { x: 299, y: 230 },
        ],
      },
    }], nodes);

    expect(result.data?.computedPath).toEqual([
      { x: 50, y: 60 },
      { x: 50, y: 300 },
      { x: 252, y: 300 },
      { x: 252, y: 270 },
      { x: 252, y: 230 },
      { x: 300, y: 230 },
    ]);
  });

  it('removes zero-length segments while committing endpoint anchors', () => {
    const [result] = commitComputedDisplayEdgeTerminals([{
      id: 'degenerate-anchor-segment',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 50, y: 61 },
          { x: 50, y: 120 },
          { x: 50, y: 120 },
          { x: 350, y: 120 },
          { x: 350, y: 200 },
        ],
      },
    }], nodes);

    expect(result.data?.computedPath).toEqual([
      { x: 50, y: 60 },
      { x: 50, y: 120 },
      { x: 350, y: 120 },
      { x: 350, y: 200 },
    ]);
    expect(fastDisplayHardSafetyIsClean([result], nodes)).toBe(true);
  });
});
