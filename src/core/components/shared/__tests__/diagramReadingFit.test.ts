// @vitest-environment node
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { computeDiagramReadingViewport, inferDiagramReadingDirection } from '../diagramReadingFit';

const node = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 60,
  extra: Partial<Node> = {},
): Node => ({
  id,
  position: { x, y },
  width,
  height,
  data: {},
  ...extra,
});

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

describe('diagram reading fit', () => {
  it('fits leaf content instead of a large swimlane background', () => {
    const nodes = [
      node('lane', 0, 0, 4000, 800, { type: 'titleGroup' }),
      node('start', 120, 160),
      node('finish', 520, 160),
    ];
    const viewport = computeDiagramReadingViewport({
      nodes,
      edges: [edge('flow', 'start', 'finish')],
      viewportSize: { width: 1200, height: 800 },
      leftSidebarOffset: 0,
      rightSidebarOffset: 0,
    });

    expect(viewport?.zoom).toBeGreaterThan(1);
    expect(viewport?.direction).toBe('LR');
  });

  it('uses selected container descendants as the reading target', () => {
    const nodes = [
      node('lane-a', 0, 0, 1200, 600, { type: 'titleGroup', selected: true }),
      node('lane-b', 2000, 0, 1200, 600, { type: 'titleGroup' }),
      node('a1', 100, 120, 120, 70, { parentId: 'lane-a' }),
      node('a2', 500, 120, 120, 70, { parentId: 'lane-a' }),
      node('b1', 2100, 120, 120, 70, { parentId: 'lane-b' }),
    ];
    const viewport = computeDiagramReadingViewport({
      nodes,
      edges: [edge('flow', 'a1', 'a2')],
      selectedNodeIds: ['lane-a'],
      viewportSize: { width: 1000, height: 700 },
      leftSidebarOffset: 0,
      rightSidebarOffset: 0,
    });

    expect(viewport).not.toBeNull();
    expect(viewport?.zoom).toBeGreaterThan(1);
    expect(viewport?.direction).toBe('LR');
  });

  it.each([
    ['LR', [node('a', 0, 0), node('b', 300, 0)], [edge('e', 'a', 'b')]],
    ['RL', [node('a', 300, 0), node('b', 0, 0)], [edge('e', 'a', 'b')]],
    ['TB', [node('a', 0, 0), node('b', 0, 300)], [edge('e', 'a', 'b')]],
    ['BT', [node('a', 0, 300), node('b', 0, 0)], [edge('e', 'a', 'b')]],
  ] as const)('infers %s from committed edge geometry', (expected, nodes, edges) => {
    expect(inferDiagramReadingDirection(nodes, edges)).toBe(expected);
  });

  it('rejects invalid viewport sizes without throwing', () => {
    expect(computeDiagramReadingViewport({
      nodes: [node('a', 0, 0)],
      edges: [],
      viewportSize: { width: 0, height: 700 },
    })).toBeNull();
  });
});
