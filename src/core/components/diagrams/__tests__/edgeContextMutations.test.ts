import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  convertDiagramEdgeToEditable,
  resetDiagramEdgeWaypoints,
  reverseDiagramEdge,
  stopEditingDiagramEdge,
} from '../edgeContextMutations';

const edge = (overrides: Partial<Edge> = {}): Edge => ({
  id: 'edge-1',
  source: 'source',
  target: 'target',
  sourceHandle: 'source-bottom',
  targetHandle: 'target-top',
  type: 'smoothstep',
  label: 'Order flow',
  data: { waypoints: [{ x: 10, y: 20 }] },
  ...overrides,
});

describe('edge context mutations', () => {
  it('reverses endpoints, swaps handles, and clears stale waypoints', () => {
    const current = [edge()];
    const result = reverseDiagramEdge(current, 'edge-1');

    expect(result.changed).toBe(true);
    expect(result.edges[0]).toMatchObject({
      source: 'target',
      target: 'source',
      sourceHandle: 'target-top',
      targetHandle: 'source-bottom',
      data: { waypoints: [] },
    });
    expect(current[0].source).toBe('source');
  });

  it('does not create mutations for missing targets or already-reset paths', () => {
    const current = [edge({ data: { waypoints: [] } })];

    expect(resetDiagramEdgeWaypoints(current, undefined)).toEqual({ changed: false, edges: current });
    expect(resetDiagramEdgeWaypoints(current, 'missing')).toEqual({ changed: false, edges: current });
    expect(resetDiagramEdgeWaypoints(current, 'edge-1')).toEqual({ changed: false, edges: current });
  });

  it('converts and restores an editable edge without leaking internal metadata', () => {
    const current = [edge()];
    const editable = convertDiagramEdgeToEditable(current, 'edge-1');

    expect(editable.edges[0]).toMatchObject({
      type: 'editable',
      selected: true,
      label: 'Order flow',
      data: { originalType: 'smoothstep' },
    });
    expect(convertDiagramEdgeToEditable(editable.edges, 'edge-1').changed).toBe(false);

    const restored = stopEditingDiagramEdge(editable.edges, 'edge-1');
    expect(restored.edges[0]).toMatchObject({ type: 'smoothstep', selected: false, label: 'Order flow' });
    expect(restored.edges[0].data).not.toHaveProperty('originalType');
    expect(stopEditingDiagramEdge(restored.edges, 'edge-1').changed).toBe(false);
  });
});
