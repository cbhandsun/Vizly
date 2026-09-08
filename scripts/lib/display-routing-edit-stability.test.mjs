import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  captureDisplayRoutingEditBaseline, measureDisplayRoutingEditStability as measure,
  projectDisplayRoutingEditStability, readDisplayRoutingEditStability,
  summarizeDisplayRoutingEditStability,
} from './display-routing-edit-stability.mjs';
import { buildDisplayRoutingMachineResult } from './display-routing-browser-result.mjs';

const node = (id, x = 0, y = 0, parentId) => ({ id, position: { x, y }, parentId });
const edge = (id, source, target, path = [{ x: 0, y: 0 }, { x: 10, y: 0 }]) => ({
  id, source, target, sourceHandle: 'right', targetHandle: 'left', data: { computedPath: path },
});
const fixture = () => ({ nodes: [node('edited'), node('a'), node('b', 10)], edges: [edge('ab', 'a', 'b')] });

describe('incremental edit stability', () => {
  it('summarizes every sample and fails closed on missing, fractional counters or oversized data', () => {
    const metrics = measure(fixture(), fixture(), []);
    const summary = summarizeDisplayRoutingEditStability([metrics, {
      ...metrics, totalNodeDisplacement: 10, maxNodeDisplacement: 10,
    }]);
    expect(summary).toMatchObject({ sampleCount: 2, metrics: {
      maxNodeDisplacement: { min: 0, max: 10, mean: 5, p95: 10 },
    } });
    for (const invalid of [null, [], [null], [metrics, {}], Array(101).fill(metrics),
      [{ ...metrics, movedNodeCount: 0.5 }], [{ ...metrics, maxNodeDisplacement: Infinity }],
      [{ ...metrics, changedPortCount: 100 }], [{ ...metrics, maxNodeDisplacement: 1 }]]) {
      expect(() => summarizeDisplayRoutingEditStability(invalid)).toThrow(/stability samples/);
    }
  });
  it('measures exact unrelated displacement, port changes, detours and bends', () => {
    const before = fixture();
    const after = fixture();
    after.nodes[0].position.x = 100;
    after.nodes[1].position = { x: 3, y: 4 };
    after.edges[0].sourceHandle = 'bottom';
    after.edges[0].data.computedPath = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }];
    expect(measure(before, after, ['edited'])).toMatchObject({
      comparedNodeCount: 2, movedNodeCount: 1, totalNodeDisplacement: 5, maxNodeDisplacement: 5,
      comparedEdgeCount: 1, changedPortCount: 1, changedPathCount: 1,
      beforePathLength: 10, afterPathLength: 20, beforeBendCount: 0, afterBendCount: 1,
    });
  });

  it('uses absolute nested coordinates and excludes edges incident to edited nodes', () => {
    const before = fixture();
    before.nodes[1].parentId = 'edited';
    before.edges.push(edge('edit-a', 'edited', 'a'));
    const after = structuredClone(before);
    after.nodes[0].position.x = 20;
    after.edges[1].sourceHandle = 'top';
    expect(measure(before, after, ['edited'])).toMatchObject({
      movedNodeCount: 1, maxNodeDisplacement: 20, comparedEdgeCount: 1, changedPortCount: 0,
    });
  });

  it('separates additions, removals and rewiring from retained graph comparison', () => {
    const before = fixture();
    before.nodes.push(node('removed'));
    before.edges.push(edge('removed-edge', 'a', 'removed'));
    const after = fixture();
    after.nodes.push(node('added'));
    after.edges[0].target = 'added';
    after.edges.push(edge('new-edge', 'a', 'added'));
    expect(measure(before, after, ['added', 'removed'])).toMatchObject({
      addedNodeCount: 1, removedNodeCount: 1, addedEdgeCount: 1, removedEdgeCount: 1,
      rewiredEdgeCount: 1, comparedEdgeCount: 0,
    });
  });

  it('handles empty graphs, jitter tolerance, duplicate points and input ordering', () => {
    const empty = measure({ nodes: [], edges: [] }, { nodes: [], edges: [] }, []);
    expect(Object.values(empty).every(value => value === 0)).toBe(true);
    const before = fixture();
    const after = fixture();
    after.nodes.reverse();
    after.nodes[0].position.x += 0.001;
    expect(measure(before, after, [])).toMatchObject({ movedNodeCount: 0, changedPathCount: 0 });
    after.edges[0].data.computedPath.splice(1, 0, { x: 0, y: 0 });
    expect(measure(before, after, [])).toMatchObject({ afterPathLength: 10, afterBendCount: 0 });
  });

  it.each([
    snapshot => { snapshot.nodes = null; },
    snapshot => { snapshot.nodes = Array(5_001).fill(node('x')); },
    snapshot => { snapshot.nodes.push(node('a')); },
    snapshot => { snapshot.nodes[0].position.x = Infinity; },
    snapshot => { snapshot.nodes[0].position.x = NaN; },
    snapshot => { snapshot.nodes[0].position = null; },
    snapshot => { snapshot.nodes[0].position.x = '1'; },
    snapshot => { snapshot.nodes[0].position.x = 10_000_001; },
    snapshot => { snapshot.nodes[0].parentId = 'missing'; },
    snapshot => { snapshot.nodes[0].parentId = 'edited'; },
    snapshot => { snapshot.edges[0].target = 'missing'; },
    snapshot => { snapshot.edges[0].data.computedPath = []; },
    snapshot => { snapshot.edges[0].data.computedPath = Array(513).fill({ x: 0, y: 0 }); },
    snapshot => { snapshot.edges[0].sourceHandle = { secret: 'private' }; },
    snapshot => { snapshot.edges.push(snapshot.edges[0]); },
  ])('rejects invalid geometry and topology without echoing input', mutate => {
    const invalid = fixture();
    mutate(invalid);
    expect(() => measure(fixture(), invalid, [])).toThrow('Invalid edit stability snapshot');
  });

  it('rejects invalid selection and bounds ancestry depth', () => {
    for (const selected of [null, ['missing'], [42], ['x'.repeat(513)]]) {
      expect(() => measure(fixture(), fixture(), selected)).toThrow(/Invalid/);
    }
    const deep = { nodes: Array.from({ length: 130 }, (_, i) => node(String(i), 0, 0, i < 129 ? String(i + 1) : undefined)), edges: [] };
    expect(() => measure(deep, deep, [])).toThrow(/Invalid/);
  });

  it('keeps content in the browser and exports only allowlisted aggregate metrics', async () => {
    const graph = fixture();
    graph.nodes[0].data = { label: 'Bearer private content' };
    const window = {
      reactFlowInstance: { getNodes: () => graph.nodes, getEdges: () => graph.edges },
      __vizlyRoutingRequests: [{ requestId: 'request', nodes: graph.nodes, edges: graph.edges }],
      __vizlyRoutingResponses: [{ requestId: 'request', edges: graph.edges }],
      __vizlyBaseReactFlowDisplayRouting: { requestId: 'request' },
    };
    const context = vm.createContext({ window });
    const session = { evaluate: expression => vm.runInContext(expression, context) };
    expect(await captureDisplayRoutingEditBaseline(session)).toBe(true);
    graph.nodes[1].position.x = 5;
    const metrics = await readDisplayRoutingEditStability(session, ['edited']);
    expect(window.__vizlyEditStabilityBaseline).toBeUndefined();
    expect(metrics).toMatchObject({ movedNodeCount: 1, maxNodeDisplacement: 5, comparedEdgeCount: 1 });
    const safe = projectDisplayRoutingEditStability({ ...metrics, secret: 'Bearer private content' });
    expect(JSON.stringify(safe)).not.toMatch(/Bearer|private|computedPath|sourceHandle/);
    expect(projectDisplayRoutingEditStability({ ...metrics, changedPathCount: NaN })).toBeNull();
    expect(buildDisplayRoutingMachineResult([{ editStability: metrics }]).dragCases[0].editStability).toEqual(safe);
    await captureDisplayRoutingEditBaseline(session);
    window.__vizlyRoutingResponses = [];
    expect(() => readDisplayRoutingEditStability(session, ['edited'])).toThrow(/unavailable/);
    expect(window.__vizlyEditStabilityBaseline).toBeUndefined();
  });
});
