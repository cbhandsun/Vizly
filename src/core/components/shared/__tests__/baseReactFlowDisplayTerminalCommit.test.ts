// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { lockFinalDisplayComputedPaths } from '../baseReactFlowDisplayEdgeCore';
import { anchorComputedDisplayEdgeEndpoints } from '../baseReactFlowDisplayEndpointAnchoring';

const verticalNodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
  { id: 'target', position: { x: 0, y: 240 }, data: {}, measured: { width: 100, height: 60 } },
];

const verticalPath = [
  { x: 50, y: 60 },
  { x: 50, y: 120 },
  { x: 50, y: 180 },
  { x: 50, y: 240 },
];

describe('final display terminal commit', () => {
  it('materializes automatic terminal sides selected by finalized geometry', () => {
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'resolved-auto-terminals',
      source: 'source',
      target: 'target',
      data: {
        auto: ['source', 'target'],
        autoSource: true,
        autoTarget: true,
        runtimeHandleLock: { source: true, target: true },
        computedPath: verticalPath,
      },
    }], verticalNodes);
    const data = result.data as Record<string, unknown>;

    expect(result.sourceHandle).toBe('bottom');
    expect(result.targetHandle).toBe('top');
    expect(data.auto).toEqual(['source', 'target']);
    expect(data.autoSource).toBe(true);
    expect(data.autoTarget).toBe(true);
    expect(data.runtimeHandleLock).toEqual({ source: true, target: true });
  });

  it('locks finalized paths with explicit geometry-selected terminal handles', () => {
    const [result] = lockFinalDisplayComputedPaths([{
      id: 'committed-auto-terminals',
      source: 'source',
      target: 'target',
      data: { auto: ['source', 'target'], computedPath: verticalPath },
    }], verticalNodes);

    expect(result).toMatchObject({
      type: 'stablePath',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        auto: ['source', 'target'],
        layoutPathLocked: true,
        _layoutPathLocked: true,
      },
    });
  });
});
