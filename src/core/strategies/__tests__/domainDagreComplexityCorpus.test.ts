// @vitest-environment jsdom
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { evaluateLayoutGeometry } from '../../algorithms/layoutGeometryConstraints';
import { projectBaseReactFlowDisplayWorkerInput } from '../../components/shared/baseReactFlowDisplayWorkerProjection';
import { LayoutType } from '../../types/layout';
import { DomainDagreLayoutStrategy } from '../DomainDagreLayoutStrategy';

vi.hoisted(() => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
}));

type NodeSpec = Readonly<{ id: string; domain: string; subDomain?: string }>;
type CorpusCase = Readonly<{ id: string; nodes: Node[]; edges: Edge[] }>;

const nodes = (specs: readonly NodeSpec[]): Node[] => specs.map((spec, index) => ({
  id: spec.id,
  type: 'custom',
  position: { x: index * 10, y: 0 },
  data: { domain: spec.domain, subDomain: spec.subDomain, description: spec.id },
  width: 180,
  height: 80,
  measured: { width: 180, height: 80 },
}));

const edges = (pairs: readonly (readonly [string, string])[], fixed = false): Edge[] =>
  pairs.map(([source, target], index) => ({
    id: `edge-${index}`,
    source,
    target,
    ...(fixed ? {
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { sourceHandleLocked: true, targetHandleLocked: true },
    } : {}),
  }));

const corpus: readonly CorpusCase[] = [
  {
    id: 'sparse-chain',
    nodes: nodes(['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map((id, index) => ({
      id, domain: String.fromCharCode(65 + Math.floor(index / 2)),
    }))),
    edges: edges([['a1', 'a2'], ['a2', 'b1'], ['b1', 'b2'], ['b2', 'c1'], ['c1', 'c2']]),
  },
  {
    id: 'dense-fan',
    nodes: nodes(['source', 'a', 'b', 'c', 'd', 'e', 'f', 'sink'].map((id, index) => ({
      id, domain: index === 0 ? 'A' : index === 7 ? 'C' : 'B',
    }))),
    edges: edges(['a', 'b', 'c', 'd', 'e', 'f'].flatMap(id => [
      ['source', id], [id, 'sink'],
    ] as const)),
  },
  {
    id: 'nested-subgroups',
    nodes: nodes(Array.from({ length: 8 }, (_, index) => ({
      id: `n${index}`,
      domain: index < 4 ? 'A' : 'B',
      subDomain: `${index < 4 ? 'A' : 'B'}-${index % 2}`,
    }))),
    edges: edges(Array.from({ length: 7 }, (_, index) => [`n${index}`, `n${index + 1}`] as const)),
  },
  {
    id: 'feedback-cycle',
    nodes: nodes(Array.from({ length: 6 }, (_, index) => ({
      id: `n${index}`, domain: index < 3 ? 'A' : 'B',
    }))),
    edges: edges([['n0', 'n1'], ['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n5'], ['n5', 'n1']]),
  },
  {
    id: 'fixed-ports',
    nodes: nodes(Array.from({ length: 6 }, (_, index) => ({
      id: `n${index}`, domain: index < 3 ? 'A' : 'B',
    }))),
    edges: edges(Array.from({ length: 5 }, (_, index) => [`n${index}`, `n${index + 1}`] as const), true),
  },
  {
    id: 'unbalanced-components',
    nodes: nodes([
      ...Array.from({ length: 8 }, (_, index) => ({ id: `a${index}`, domain: 'A' })),
      { id: 'b0', domain: 'B' },
      { id: 'c0', domain: 'C' },
    ]),
    edges: edges([
      ...Array.from({ length: 7 }, (_, index) => [`a${index}`, `a${index + 1}`] as const),
      ['b0', 'c0'],
    ]),
  },
];

const directions = ['TB', 'BT', 'LR', 'RL'] as const;

describe('domain Dagre generic complexity corpus', () => {
  it.each(corpus.flatMap(value => directions.map(direction => ({ value, direction }))))(
    'keeps $value.id geometry valid in $direction', async ({ value, direction }) => {
      const beforeNodes = structuredClone(value.nodes);
      const beforeEdges = structuredClone(value.edges);
      const result = await new DomainDagreLayoutStrategy().calculateLayout(value.nodes, value.edges, {
        type: LayoutType.DAGRE,
        nodeLayout: LayoutType.DAGRE,
        direction,
        domainPlacement: 'ordered-lanes',
        domainSubGroupDirection: direction,
        subDomainNodeDirection: direction,
        generateDomainGroups: true,
        generateSubDomainGroups: true,
        fitDomainContent: true,
        edgeRoutingQuality: 'interactive',
      });

      expect(evaluateLayoutGeometry(result.nodes).clean).toBe(true);
      expect(result.edges).toHaveLength(value.edges.length);
      expect(result.nodes.filter(node => node.type === 'custom')).toHaveLength(value.nodes.length);
      expect(value.nodes).toEqual(beforeNodes);
      expect(value.edges).toEqual(beforeEdges);
      if (value.id === 'fixed-ports') {
        expect(result.edges.every(edge => edge.sourceHandle === 'right' && edge.targetHandle === 'left')).toBe(true);
      }
    },
  );

  it.each(directions)('bounds nested subgroup flow-axis slack in %s', async direction => {
    const value = corpus.find(entry => entry.id === 'nested-subgroups');
    if (!value) throw new Error('Missing nested subgroup corpus case');
    const result = await new DomainDagreLayoutStrategy().calculateLayout(value.nodes, value.edges, {
      type: LayoutType.DAGRE,
      nodeLayout: LayoutType.DAGRE,
      direction,
      domainPlacement: 'ordered-lanes',
      domainSubGroupDirection: direction,
      subDomainNodeDirection: direction,
      generateDomainGroups: true,
      generateSubDomainGroups: true,
      fitDomainContent: true,
      edgeRoutingQuality: 'interactive',
    });
    const projected = projectBaseReactFlowDisplayWorkerInput({ nodes: result.nodes, edges: result.edges });
    const horizontal = direction === 'LR' || direction === 'RL';
    const flow = horizontal ? 'x' : 'y';
    const size = horizontal ? 'width' : 'height';
    const byParent = new Map<string | undefined, typeof projected.nodes>();
    for (const node of projected.nodes.filter(candidate => candidate.type === 'custom')) {
      byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]);
    }

    for (const group of projected.nodes.filter(node => node.type === 'subGroup')) {
      const members = byParent.get(group.id) ?? [];
      expect(members.length).toBeGreaterThan(0);
      const contentStart = Math.min(...members.map(node => node.positionAbsolute[flow]));
      const contentEnd = Math.max(...members.map(node => node.positionAbsolute[flow]
        + Number(node.measured?.[size] ?? node[size])));
      const groupStart = group.positionAbsolute[flow];
      const groupEnd = groupStart + Number(group.measured?.[size] ?? group[size]);
      expect(contentStart - groupStart).toBeGreaterThanOrEqual(0);
      expect(groupEnd - contentEnd).toBeGreaterThanOrEqual(0);
      expect((contentStart - groupStart) + (groupEnd - contentEnd)).toBeLessThanOrEqual(horizontal ? 56 : 114);
    }
  });
});
