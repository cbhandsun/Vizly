import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { finalizeFailClosedDisplayTransaction } from '../baseReactFlowDisplayFinalTransaction';

const nodes = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    positionAbsolute: { x: 0, y: 0 },
    width: 100,
    height: 100,
    measured: { width: 100, height: 100 },
    data: {},
  },
  {
    id: 'target',
    position: { x: 300, y: 0 },
    positionAbsolute: { x: 300, y: 0 },
    width: 100,
    height: 100,
    measured: { width: 100, height: 100 },
    data: {},
  },
] as Node[];

const edgeWithPath = (computedPath: Array<{ x: number; y: number }>): Edge[] => [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: { computedPath },
}];

describe('finalizeFailClosedDisplayTransaction', () => {
  it('marks a fully clean terminal transaction as finalized', () => {
    const result = finalizeFailClosedDisplayTransaction(
      edgeWithPath([{ x: 100, y: 50 }, { x: 300, y: 50 }]),
      nodes,
      'clean-signature',
    );

    expect((result[0].data as any).__baseDisplayFinalizedSignature).toBe('clean-signature');
  });

  it('does not finalize a transaction with detached terminals', () => {
    const result = finalizeFailClosedDisplayTransaction(
      edgeWithPath([{ x: 150, y: 50 }, { x: 250, y: 50 }]),
      nodes,
      'unsafe-signature',
    );

    expect((result[0].data as any).__baseDisplayFinalizedSignature).toBeUndefined();
  });

  it('removes redundant collinear waypoints before the final commit', () => {
    const result = finalizeFailClosedDisplayTransaction(
      edgeWithPath([
        { x: 100, y: 50 }, { x: 180, y: 50 },
        { x: 200, y: 50 }, { x: 300, y: 50 },
      ]),
      nodes,
      'compact-signature',
    );

    expect((result[0].data as any).computedPath).toEqual([
      { x: 100, y: 50 }, { x: 300, y: 50 },
    ]);
    expect((result[0].data as any).__baseDisplayFinalizedSignature).toBe('compact-signature');
  });
});
