import type { InternalNode, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  EDITABLE_EDGE_MINIMUM_ZOOM,
  getEditableEdgeFocusCenter,
  shouldFocusEditableEdge,
} from '../edgeEditingViewport';

const makeNode = (id: string, x: number, y: number): InternalNode => {
  const userNode: Node = {
    id,
    position: { x, y },
    data: {},
    measured: { width: 100, height: 40 },
  };
  return {
    ...userNode,
    measured: { width: 100, height: 40 },
    internals: {
      positionAbsolute: { x, y },
      userNode,
      z: 0,
      handleBounds: undefined,
      bounds: undefined,
    },
  };
};

describe('editable edge viewport policy', () => {
  it('focuses low, empty, and invalid zoom values conservatively', () => {
    expect(shouldFocusEditableEdge(0.32)).toBe(true);
    expect(shouldFocusEditableEdge(EDITABLE_EDGE_MINIMUM_ZOOM)).toBe(false);
    expect(shouldFocusEditableEdge(Number.NaN)).toBe(true);
    expect(shouldFocusEditableEdge(undefined)).toBe(true);
  });

  it('centers the edit viewport between absolute node centers', () => {
    expect(getEditableEdgeFocusCenter(
      makeNode('source', 100, 200),
      makeNode('target', 300, 400),
    )).toEqual({ x: 250, y: 320 });
  });

  it('rejects a missing endpoint', () => {
    expect(getEditableEdgeFocusCenter(makeNode('source', 0, 0), undefined)).toBeNull();
  });
});
