import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { materializeDisplayTerminalHandles } from '../baseReactFlowDisplayTerminalCommit';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 100, data: {} },
  { id: 'target', position: { x: 200, y: 200 }, width: 100, height: 100, data: {} },
];

const bottomToTopPath = [
  { x: 50, y: 100 },
  { x: 50, y: 150 },
  { x: 250, y: 150 },
  { x: 250, y: 200 },
];

describe('materializeDisplayTerminalHandles', () => {
  it('commits geometry-selected sides over stale automatic side tokens', () => {
    const edge: Edge = {
      id: 'automatic',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: bottomToTopPath },
    };

    const [resolved] = materializeDisplayTerminalHandles([edge], nodes);

    expect(resolved.sourceHandle).toBe('bottom');
    expect(resolved.targetHandle).toBe('top');
  });

  it('preserves source-authored fixed terminal sides', () => {
    const edge: Edge = {
      id: 'fixed',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: bottomToTopPath,
        sourcePortPolicy: 'fixed',
        targetPortPolicy: 'fixed',
      },
    };

    const [resolved] = materializeDisplayTerminalHandles([edge], nodes);

    expect(resolved).toBe(edge);
  });
});
