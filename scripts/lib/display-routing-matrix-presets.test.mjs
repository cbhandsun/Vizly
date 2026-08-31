import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

import { DISPLAY_ROUTING_MATRIX_PRESET_TARGETS } from './display-routing-matrix-presets.mjs';
import { assertDisplayRoutingSemanticFlow, auditDisplayRoutingLayoutSemantics,
  readDisplayRoutingSemanticNodes } from './display-routing-semantic-audit.mjs';

describe('display routing matrix presets', () => {
  it('includes Logistics alongside both WMS fixtures and TMS', () => {
    expect(DISPLAY_ROUTING_MATRIX_PRESET_TARGETS.map(target => target.presetId)).toEqual([
      'logistics-architecture-v1',
      'wms-demand-allocation-strategy-v2',
      'wms-process-flow-v1',
      'tms-architecture-v1',
    ]);
  });

  it('keeps every source path bounded to standardized JSON fixtures', () => {
    for (const target of DISPLAY_ROUTING_MATRIX_PRESET_TARGETS) {
      expect(target.sourcePath).toMatch(/^src\/data\/standardized\/[A-Za-z]+\.json$/);
    }
  });

  it('binds every explicit main chain to real canonical nodes and directed edges', async () => {
    for (const target of DISPLAY_ROUTING_MATRIX_PRESET_TARGETS) {
      const graph = JSON.parse(await readFile(target.sourcePath, 'utf8'));
      expect(target.semanticChains.length).toBeGreaterThan(0);
      for (const chain of target.semanticChains) {
        expect(chain.length).toBeGreaterThan(1);
        expect(new Set(chain).size).toBe(chain.length);
        for (const id of chain) expect(graph.nodes.some(node => node.id === id)).toBe(true);
        for (let i = 1; i < chain.length; i += 1) {
          expect(graph.edges.some(edge => edge.source === chain[i - 1] && edge.target === chain[i])).toBe(true);
        }
      }
    }
  });
});

const semanticInput = (direction = 'TB') => {
  const horizontal = direction === 'LR' || direction === 'RL';
  const reverse = direction === 'BT' || direction === 'RL';
  return {
    direction, chains: [['start', 'middle', 'end']],
    nodes: ['start', 'middle', 'end'].map((id, index) => ({
      id, x: horizontal ? (reverse ? 2 - index : index) * 200 : 50,
      y: horizontal ? 50 : (reverse ? 2 - index : index) * 200, width: 80, height: 60,
    })),
    edges: [{ source: 'start', target: 'middle' }, { source: 'middle', target: 'end' },
      { source: 'end', target: 'start' }],
  };
};

describe('rendered business flow semantics', () => {
  it('reads actual DOM rectangles without interpolating node identifiers into selectors', () => {
    const id = '<img onerror=alert(1)>';
    const query = vi.fn(() => [{
      getAttribute: () => id,
      getBoundingClientRect: () => ({ x: -25, y: 40, width: 120, height: 60 }),
    }]);
    vi.stubGlobal('document', { querySelectorAll: query });
    try {
      expect(readDisplayRoutingSemanticNodes()).toEqual([{ id, x: -25, y: 40, width: 120, height: 60 }]);
      expect(query).toHaveBeenCalledWith('.react-flow__node[data-id]');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(['TB', 'BT', 'LR', 'RL'])('checks complete rectangle ordering in %s while allowing feedback', direction => {
    const input = semanticInput(direction);
    const before = structuredClone(input);
    expect(assertDisplayRoutingSemanticFlow(input)).toMatchObject({ status: 'passed', checkedStepCount: 2, direction });
    expect(input).toEqual(before);
    expect(() => assertDisplayRoutingSemanticFlow({ ...input, direction: { TB: 'BT', BT: 'TB', LR: 'RL', RL: 'LR' }[direction] }))
      .toThrow('contradicts');
  });

  it('rejects forward centers whose node rectangles still overlap along the flow axis', () => {
    const input = semanticInput();
    input.nodes[1].y = 30;
    expect(() => assertDisplayRoutingSemanticFlow(input)).toThrow('contradicts');
  });

  it('supports multiple branches and safely treats hostile identifiers as data', () => {
    const input = semanticInput('LR');
    input.nodes.push({ id: '__proto__', x: 200, y: 500, width: 80, height: 60 });
    input.nodes.push({ id: '<img onerror=alert(1)>', x: 400, y: 500, width: 80, height: 60 });
    input.edges.push({ source: 'start', target: '__proto__' }, { source: '__proto__', target: '<img onerror=alert(1)>' });
    input.chains.push(['start', '__proto__', '<img onerror=alert(1)>']);
    expect(assertDisplayRoutingSemanticFlow(input).checkedStepCount).toBe(4);
  });

  it.each([
    { direction: 'diagonal' }, { chains: [] }, { chains: [['start']] }, { chains: [['start', 'start']] },
    { chains: [['start', null]] }, { chains: Array.from({ length: 65 }, () => ['start', 'end']) },
    { chains: [Array.from({ length: 65 }, (_, i) => `n${i}`)] }, { nodes: null }, { nodes: [] },
    { nodes: Array(5001).fill({}) }, { edges: [] }, { edges: Array(5001).fill({}) },
    { edges: [{ source: 'start', target: 42 }] }, { edges: [null] },
  ])('fails closed for malformed or excessive input %j', patch => {
    expect(() => assertDisplayRoutingSemanticFlow({ ...semanticInput(), ...patch })).toThrow();
  });

  it.each([NaN, Infinity, -Infinity, '20', 10_000_001])('rejects invalid coordinate %s', value => {
    const input = semanticInput();
    input.nodes[0].x = value;
    expect(() => assertDisplayRoutingSemanticFlow(input)).toThrow('geometry');
  });

  it('rejects missing/duplicate nodes, zero sizes and missing directed edges without exposing IDs', () => {
    const input = semanticInput();
    for (const nodes of [input.nodes.slice(1), [...input.nodes, input.nodes[0]],
      input.nodes.map(node => ({ ...node, width: 0 })), input.nodes.map(node => ({ ...node, id: 'x'.repeat(501) }))]) {
      expect(() => assertDisplayRoutingSemanticFlow({ ...input, nodes })).toThrow();
    }
    expect(() => assertDisplayRoutingSemanticFlow({ ...input, edges: input.edges.slice(1) })).toThrow('step 1 is missing');
    expect(() => assertDisplayRoutingSemanticFlow({ ...input, chains: [['secret-user-content', 'end']] }))
      .toThrow('Semantic flow chain 0 step 1 is missing');
  });

  it('uses rendered browser rectangles and checks every requested swimlane direction', async () => {
    for (const direction of ['TB', 'BT', 'LR', 'RL']) {
      const input = semanticInput(direction);
      const expressions = [];
      const session = { evaluate: async expression => {
        expressions.push(expression);
        return expression.includes(readDisplayRoutingSemanticNodes.toString()) ? input.nodes : input.edges;
      } };
      expect(await auditDisplayRoutingLayoutSemantics(session, { id: `domain-lanes-${direction.toLowerCase()}` }, input.chains))
        .toMatchObject({ status: 'passed', direction });
      expect(expressions).toHaveLength(2);
      await expect(auditDisplayRoutingLayoutSemantics(session, { id: 'domain-lanes-tb' }, [])).rejects.toThrow();
    }
  });

  it('does not pretend non-swimlane layouts were audited, and propagates browser failure', async () => {
    const session = { evaluate: async () => { throw new Error('browser disconnected'); } };
    expect(await auditDisplayRoutingLayoutSemantics(session, { id: 'tree-tb' }, [])).toEqual({ status: 'not-applicable' });
    await expect(auditDisplayRoutingLayoutSemantics(session, { id: 'domain-lanes-tb' }, [['a', 'b']]))
      .rejects.toThrow('browser disconnected');
  });
});
