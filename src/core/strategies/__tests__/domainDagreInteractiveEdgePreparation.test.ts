import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { LayoutType } from '../../types/layout';
import { prepareDomainDagreInteractiveEdges } from '../domainDagreInteractiveEdgePreparation';
import type { RoutingNode } from '../domainDagreEdgePreparationSupport';

const node = (id: string, x: number, y: number): RoutingNode => ({
  id,
  position: { x, y },
  positionAbsolute: { x, y },
  data: {},
  style: { width: 120, height: 60 },
  measured: { width: 120, height: 60 },
});

const domainNode = (
  id: string,
  x: number,
  y: number,
  domain: string,
): RoutingNode => ({ ...node(id, x, y), data: { domain } });

const pathOf = (edge: Edge | undefined): Array<{ x: number; y: number }> => {
  const path = edge?.data?.computedPath;
  return Array.isArray(path) ? path as Array<{ x: number; y: number }> : [];
};

const segmentLength = (
  first: { x: number; y: number },
  second: { x: number; y: number },
): number => Math.abs(second.x - first.x) + Math.abs(second.y - first.y);

describe('prepareDomainDagreInteractiveEdges', () => {
  it('replaces generated default handles with the live reverse-flow direction', () => {
    const nodes = [node('lower-source', 100, 300), node('upper-target', 100, 40)];
    const edges: Edge[] = [{
      id: 'feedback',
      source: 'lower-source',
      target: 'upper-target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    }];

    const [feedback] = prepareDomainDagreInteractiveEdges({
      nodes,
      edges,
      options: { type: LayoutType.DAGRE, direction: 'TB' },
      nodeById: new Map(nodes.map(item => [item.id, item])),
    });
    const path = pathOf(feedback);

    expect(feedback.sourceHandle).toBe('top');
    expect(feedback.targetHandle).toBe('bottom');
    expect(feedback.data?.autoSource).toBe(true);
    expect(feedback.data?.autoTarget).toBe(true);
    expect(path[1].y).toBeLessThan(path[0].y);
  });

  it('preserves source-authored handles in interactive routing', () => {
    const nodes = [node('source', 100, 300), node('target', 100, 40)];
    const edges: Edge[] = [{
      id: 'manual',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { manualHandleSides: ['source', 'target'] },
    }];

    const [manual] = prepareDomainDagreInteractiveEdges({
      nodes,
      edges,
      options: { type: LayoutType.DAGRE, direction: 'TB' },
      nodeById: new Map(nodes.map(item => [item.id, item])),
    });

    expect(manual.sourceHandle).toBe('bottom');
    expect(manual.targetHandle).toBe('top');
    expect(manual.data?.autoSource).toBe(false);
    expect(manual.data?.autoTarget).toBe(false);
  });

  it('uses the cross-lane geometry for cross-domain edges in ordered lanes', () => {
    const nodes = [
      domainNode('upper', 100, 40, 'A'),
      domainNode('lower', 100, 300, 'B'),
    ];

    const [crossLane] = prepareDomainDagreInteractiveEdges({
      nodes,
      edges: [{ id: 'cross-lane', source: 'upper', target: 'lower' }],
      options: {
        type: LayoutType.DAGRE,
        direction: 'LR',
        domainPlacement: 'ordered-lanes',
      },
      nodeById: new Map(nodes.map(item => [item.id, item])),
    });
    const path = pathOf(crossLane);

    expect(crossLane.sourceHandle).toBe('bottom');
    expect(crossLane.targetHandle).toBe('top');
    expect(segmentLength(path[0], path[1])).toBeGreaterThanOrEqual(56);
    expect(segmentLength(path.at(-2)!, path.at(-1)!)).toBeGreaterThanOrEqual(56);
  });

  it('keeps a deterministic fallback when an endpoint is unavailable', () => {
    const nodes = [node('source', 0, 0)];
    const [edge] = prepareDomainDagreInteractiveEdges({
      nodes,
      edges: [{ id: 'missing-target', source: 'source', target: 'missing' }],
      options: { type: LayoutType.DAGRE, direction: 'LR' },
      nodeById: new Map(nodes.map(item => [item.id, item])),
    });

    expect(edge.sourceHandle).toBe('right');
    expect(edge.targetHandle).toBe('left');
    expect(edge.data?.algorithm).toBe('domain-dagre-interactive');
  });
});
