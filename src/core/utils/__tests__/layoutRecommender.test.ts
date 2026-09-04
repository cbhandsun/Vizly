import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { recommendLayout } from '../layoutRecommender';

const node = (id: string, domain?: string): Node => ({
  id,
  position: { x: 0, y: 0 },
  data: domain ? { domain } : {},
});

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

describe('recommendLayout', () => {
  it('selects cyclic domain lanes for a sparse cross-domain feedback loop', () => {
    const nodes = [
      node('a1', 'A'),
      node('a2', 'A'),
      node('b1', 'B'),
      node('b2', 'B'),
    ];
    const edges = [
      edge('a-b', 'a1', 'b1'),
      edge('b-a', 'b1', 'a2'),
    ];

    expect(recommendLayout(nodes, edges)).toMatchObject({
      domainStrategy: 'domain-lanes',
      nodeLayout: 'dagre',
      direction: 'LR',
      confidence: 0.92,
    });
  });

  it('keeps acyclic multi-domain flows in the standard domain layout', () => {
    const nodes = [node('a', 'A'), node('b', 'B'), node('c', 'C')];
    const edges = [edge('a-b', 'a', 'b'), edge('b-c', 'b', 'c')];

    expect(recommendLayout(nodes, edges)).toMatchObject({
      domainStrategy: 'domain-dagre',
      nodeLayout: 'dagre',
      direction: 'TB',
    });
  });

  it('recommends horizontal swimlanes for a long cross-domain process', () => {
    const nodes = Array.from({ length: 11 }, (_, index) => (
      node(`step-${index}`, index < 5 ? 'Planning' : index < 8 ? 'Allocation' : 'Execution')
    ));
    const edges = nodes.slice(1).map((current, index) => (
      edge(`step-${index}-${index + 1}`, nodes[index].id, current.id)
    ));

    expect(recommendLayout(nodes, edges)).toMatchObject({
      domainStrategy: 'domain-lanes',
      nodeLayout: 'dagre',
      direction: 'LR',
      confidence: 0.9,
    });
  });

  it('uses the longest branch depth instead of the shortest merge path', () => {
    const nodes = Array.from({ length: 12 }, (_, index) => (
      node(`step-${index}`, index < 6 ? 'Planning' : 'Execution')
    ));
    const edges = [
      edge('short-merge', 'step-0', 'step-10'),
      ...Array.from({ length: 10 }, (_, index) => (
        edge(`long-${index}`, `step-${index}`, `step-${index + 1}`)
      )),
      edge('finish', 'step-10', 'step-11'),
    ];

    expect(recommendLayout(nodes, edges)).toMatchObject({
      domainStrategy: 'domain-lanes',
      direction: 'LR',
    });
  });

  it('ignores duplicate and missing-endpoint edges when measuring process depth', () => {
    const nodes = Array.from({ length: 10 }, (_, index) => (
      node(`step-${index}`, index < 5 ? 'Planning' : 'Execution')
    ));
    const chain = nodes.slice(1).map((current, index) => (
      edge(`step-${index}-${index + 1}`, nodes[index].id, current.id)
    ));

    expect(recommendLayout(nodes, [
      ...chain,
      edge('duplicate', 'step-0', 'step-1'),
      edge('missing-source', 'missing', 'step-4'),
      edge('missing-target', 'step-4', 'missing'),
    ])).toMatchObject({
      domainStrategy: 'domain-lanes',
      direction: 'LR',
    });
  });

  it('selects compound layout directly for nested multi-domain DAGs', () => {
    const nodes = [
      node('a1', 'A'), node('a2', 'A'), node('b', 'B'), node('c1', 'C'), node('c2', 'C'),
      { ...node('domain-a', 'A'), type: 'titleGroup' },
      { ...node('domain-b', 'B'), type: 'titleGroup' },
      { ...node('domain-c', 'C'), type: 'titleGroup' },
      { ...node('sub-a', 'A'), type: 'subGroup' },
    ];
    const edges = [
      edge('a1-a2', 'a1', 'a2'),
      edge('a1-b', 'a1', 'b'),
      edge('a2-c1', 'a2', 'c1'),
      edge('b-c1', 'b', 'c1'),
      edge('b-c2', 'b', 'c2'),
    ];

    expect(recommendLayout(nodes, edges)).toMatchObject({
      domainStrategy: 'domain-compound-elk',
      direction: 'LR',
      confidence: 0.88,
    });
  });

  it('uses a flat tree layout for a domain-free hierarchy', () => {
    const nodes = [node('root'), node('left'), node('right')];
    const edges = [edge('root-left', 'root', 'left'), edge('root-right', 'root', 'right')];

    expect(recommendLayout(nodes, edges)).toMatchObject({
      domainStrategy: 'tree',
      nodeLayout: 'flow',
    });
  });
});
