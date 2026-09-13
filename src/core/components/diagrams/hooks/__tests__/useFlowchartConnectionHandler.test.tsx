/** @vitest-environment jsdom */
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFlowchartConnectionHandler } from '../useFlowchartConnectionHandler';

const node = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: {} });
const edge = (id: string): Edge => ({
  id,
  source: 'a',
  target: 'b',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {},
});

const dataOf = (candidate: Edge): Record<string, unknown> => (
  candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)
    ? candidate.data as Record<string, unknown>
    : {}
);

describe('useFlowchartConnectionHandler', () => {
  it('applies parallel edge presentation when creating a second connection between the same nodes', () => {
    const existingEdge = edge('edge-existing');
    const setEdgesMock = vi.fn((action: SetStateAction<Edge[]>) => (
      typeof action === 'function' ? action([existingEdge]) : action
    ));
    const setEdges: Dispatch<SetStateAction<Edge[]>> = setEdgesMock;
    const takeSnapshot = vi.fn();
    const nodesRef = { current: [node('a'), node('b')] };
    const edgesRef = { current: [existingEdge] };

    const { result } = renderHook(() => useFlowchartConnectionHandler({
      nodesRef,
      edgesRef,
      setEdges,
      takeSnapshot,
      relationshipLabel: '关系',
    }));

    result.current({
      source: 'a',
      target: 'b',
      sourceHandle: 'right-secondary',
      targetHandle: 'left-secondary',
    });

    const nextEdges = setEdgesMock.mock.results[0]?.value as Edge[];

    expect(nextEdges).toHaveLength(2);
    expect(takeSnapshot).toHaveBeenCalledWith(nodesRef.current, edgesRef.current);
    expect(dataOf(nextEdges[0])).toMatchObject({
      parallelLaneIndex: 0,
      parallelLaneCount: 2,
      autoParallelLabelOffset: true,
    });
    expect(dataOf(nextEdges[1])).toMatchObject({
      parallelLaneIndex: 1,
      parallelLaneCount: 2,
      autoParallelLabelOffset: true,
    });
  });
});
