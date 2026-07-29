import { describe, expect, it } from 'vitest';

import type {
  StandardDiagramData,
  StandardNodeData,
} from '@/core/models/DiagramModels';
import {
  buildLocalDiagramPreview,
  prepareLocalDiagramPreviewNodes,
} from '../localDiagramPreview';

const createNode = (
  id: string,
  position?: { x: number; y: number },
  parentId?: string,
): StandardNodeData => ({
  id,
  type: 'custom',
  description: `Node ${id}`,
  domain: 'test',
  position,
  parentId,
});

const createDiagram = (
  nodes: StandardNodeData[],
): StandardDiagramData => ({
  id: 'preview-test',
  name: 'Preview test',
  type: 'flowchart',
  version: '1.0.0',
  nodes,
  edges: nodes.length >= 2
    ? nodes.slice(1).map((node, index) => ({
        id: `edge-${index}`,
        source: nodes[index].id,
        target: node.id,
        type: 'default',
      }))
    : [],
  layout: {
    type: 'hierarchical',
    direction: 'LR',
    spacing: {
      horizontal: 80,
      vertical: 72,
    },
    padding: {
      horizontal: 40,
      vertical: 40,
    },
  },
  theme: {
    name: 'test',
    displayName: 'Test',
    domains: {},
  },
});

describe('local diagram preview', () => {
  it('keeps distinct explicit positions unchanged', () => {
    const diagram = createDiagram([
      createNode('a', { x: 10, y: 20 }),
      createNode('b', { x: 340, y: 80 }),
    ]);

    const nodes = prepareLocalDiagramPreviewNodes(diagram, []);

    expect(nodes.map(node => node.position)).toEqual([
      { x: 10, y: 20 },
      { x: 340, y: 80 },
    ]);
  });

  it('resolves parent-relative positions before rendering', () => {
    const diagram = createDiagram([
      createNode('parent', { x: 100, y: 200 }),
      createNode('child', { x: 30, y: 40 }, 'parent'),
    ]);

    const nodes = prepareLocalDiagramPreviewNodes(diagram, []);

    expect(nodes.map(node => node.position)).toEqual([
      { x: 100, y: 200 },
      { x: 130, y: 240 },
    ]);
  });

  it('lays out nodes that have no saved positions instead of overlapping them', () => {
    const diagram = createDiagram([
      createNode('a'),
      createNode('b'),
      createNode('c'),
    ]);

    const nodes = prepareLocalDiagramPreviewNodes(diagram, diagram.edges);
    const uniquePositions = new Set(
      nodes.map(node => `${node.position.x}:${node.position.y}`),
    );

    expect(uniquePositions.size).toBe(3);
    expect(nodes[1].position.x).toBeGreaterThan(nodes[0].position.x);
    expect(nodes[2].position.x).toBeGreaterThan(nodes[1].position.x);
    expect(buildLocalDiagramPreview(diagram)?.dataUrl).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,/,
    );
  });

  it('rebuilds invalid and degenerate positions safely', () => {
    const diagram = createDiagram([
      createNode('a', { x: 0, y: 0 }),
      createNode('b', { x: 0, y: 0 }),
      createNode('c', { x: Number.POSITIVE_INFINITY, y: 0 }),
    ]);

    const nodes = prepareLocalDiagramPreviewNodes(diagram, diagram.edges);

    expect(nodes.every(node => Number.isFinite(node.position.x))).toBe(true);
    expect(new Set(nodes.map(node => `${node.position.x}:${node.position.y}`)).size).toBe(3);
  });

  it('returns no preview for an empty diagram', () => {
    expect(buildLocalDiagramPreview(createDiagram([]))).toBeNull();
  });
});
