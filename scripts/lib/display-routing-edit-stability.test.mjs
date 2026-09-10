import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  captureDisplayRoutingEditBaseline, measureDisplayRoutingEditStability as measure,
  projectDisplayRoutingEditStability, readDisplayRoutingEditStability,
  summarizeDisplayRoutingEditStability,
  projectDisplayRoutingTopologyStability,
} from './display-routing-edit-stability.mjs';
import { buildDisplayRoutingMachineResult } from './display-routing-browser-result.mjs';

const node = (id, x = 0, y = 0, parentId) => ({ id, position: { x, y }, parentId });
const edge = (id, source, target, path = [{ x: 0, y: 0 }, { x: 10, y: 0 }]) => ({
  id, source, target, sourceHandle: 'right', targetHandle: 'left', data: { computedPath: path },
});
const fixture = () => ({ nodes: [node('edited'), node('a'), node('b', 10)], edges: [edge('ab', 'a', 'b')] });

describe('incremental edit stability', () => {
  it('measures topology with pending paths without fabricating route evidence', () => {
    const before = fixture();
    const after = fixture();
    before.edges[0].data.computedPath = null;
    after.edges[0].data.computedPath = undefined;
    after.nodes[1].position = { x: 3, y: 4 };
    const original = structuredClone({ before, after });
    const measured = measure(before, after, [], [], 'topology');
    expect(measured).toMatchObject({ comparedNodeCount: 3, movedNodeCount: 1,
      totalNodeDisplacement: 5, maxNodeDisplacement: 5, comparedEdgeCount: 1 });
    expect(measured).not.toHaveProperty('changedGeometryCount');
    expect(projectDisplayRoutingEditStability(measured)).toBeNull();
    expect(projectDisplayRoutingTopologyStability({ ...measured, secret: 'private' })).toEqual(measured);
    expect({ before, after }).toEqual(original);
    expect(() => measure(before, after, [])).toThrow('Invalid edit stability snapshot');
  });

  it('keeps topology validation strict for malformed, extreme and disconnected inputs', () => {
    const badPosition = fixture(); badPosition.nodes[0].position.x = Infinity;
    const missingParent = fixture(); missingParent.nodes[0].parentId = 'missing';
    const duplicate = fixture(); duplicate.nodes.push(duplicate.nodes[0]);
    const disconnected = fixture(); disconnected.edges[0].source = 'missing';
    const oversized = fixture(); oversized.nodes = Array.from({ length: 5001 }, (_, i) => node(String(i)));
    for (const invalid of [null, {}, badPosition, missingParent, duplicate, disconnected, oversized]) {
      expect(() => measure(fixture(), invalid, [], [], 'topology')).toThrow('Invalid edit stability snapshot');
    }
    expect(() => measure(fixture(), fixture(), [], [], 'unknown')).toThrow('Invalid edit stability snapshot');
  });

  it('rejects incomplete or inconsistent topology summaries', () => {
    const valid = measure(fixture(), fixture(), [], [], 'topology');
    for (const invalid of [null, {}, { ...valid, comparedNodeCount: -1 }, { ...valid, movedNodeCount: 4 },
      { ...valid, movedNodeCount: 0.5 }, { ...valid, maxNodeDisplacement: 1 }, { ...valid, addedEdgeCount: NaN }]) {
      expect(projectDisplayRoutingTopologyStability(invalid)).toBeNull();
    }
  });

  it('summarizes every sample and fails closed on missing, fractional counters or oversized data', () => {
    const metrics = measure(fixture(), fixture(), []);
    const summary = summarizeDisplayRoutingEditStability([metrics, {
      ...metrics, totalNodeDisplacement: 10, maxNodeDisplacement: 10,
    }]);
    expect(summary).toMatchObject({ sampleCount: 2, metrics: {
      maxNodeDisplacement: { min: 0, max: 10, mean: 5, p95: 10 },
    }, derived: {
      meanNodeDisplacement: { min: 0, max: 10 / 3, mean: 5 / 3, p95: 10 / 3 },
      movedNodeRatio: { min: 0, max: 0, mean: 0, p95: 0 },
    } });
    for (const invalid of [null, [], [null], [metrics, {}], Array(101).fill(metrics),
      [{ ...metrics, movedNodeCount: 0.5 }], [{ ...metrics, maxNodeDisplacement: Infinity }],
      [{ ...metrics, changedPortCount: 100 }], [{ ...metrics, maxNodeDisplacement: 1 }]]) {
      expect(() => summarizeDisplayRoutingEditStability(invalid)).toThrow(/stability samples/);
    }
  });

  it('summarizes derived edit stability ratios, route deltas and bend deltas', () => {
    const stable = measure(fixture(), fixture(), []);
    const before = fixture();
    const after = fixture();
    after.nodes[1].position = { x: 3, y: 4 };
    after.edges[0].sourceHandle = 'bottom';
    after.edges[0].data.computedPath = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }];
    const changed = measure(before, after, []);
    const summary = summarizeDisplayRoutingEditStability([stable, changed]);
    expect(summary.derived).toMatchObject({
      meanNodeDisplacement: { min: 0, max: 5 / 3, mean: 5 / 6, p95: 5 / 3 },
      movedNodeRatio: { min: 0, max: 1 / 3, mean: 1 / 6, p95: 1 / 3 },
      changedPortRatio: { min: 0, max: 1, mean: 0.5, p95: 1 },
      changedPathRatio: { min: 0, max: 1, mean: 0.5, p95: 1 },
      changedGeometryRatio: { min: 0, max: 1, mean: 0.5, p95: 1 },
      routeLengthDelta: { min: 0, max: 10, mean: 5, p95: 10 },
      routeLengthDeltaRatio: { min: 0, max: 1, mean: 0.5, p95: 1 },
      bendDelta: { min: 0, max: 1, mean: 0.5, p95: 1 },
      bendDeltaRatio: { min: 0, max: 1, mean: 0.5, p95: 1 },
    });
  });

  it('keeps derived edit stability finite for empty graphs and route improvements', () => {
    const empty = measure({ nodes: [], edges: [] }, { nodes: [], edges: [] }, []);
    expect(summarizeDisplayRoutingEditStability([empty]).derived).toMatchObject({
      meanNodeDisplacement: { min: 0, max: 0, mean: 0, p95: 0 },
      changedPortRatio: { min: 0, max: 0, mean: 0, p95: 0 },
      routeLengthDeltaRatio: { min: 0, max: 0, mean: 0, p95: 0 },
    });

    const before = fixture();
    before.edges[0].data.computedPath = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }];
    const after = fixture();
    const summary = summarizeDisplayRoutingEditStability([measure(before, after, [])]);
    expect(summary.derived).toMatchObject({
      routeLengthDelta: { min: -10, max: -10, mean: -10, p95: -10 },
      routeLengthDeltaRatio: { min: -0.5, max: -0.5, mean: -0.5, p95: -0.5 },
      bendDelta: { min: -1, max: -1, mean: -1, p95: -1 },
      bendDeltaRatio: { min: -1, max: -1, mean: -1, p95: -1 },
    });
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

  it('separates point subdivision from geometry changes without hiding retracing or detours', () => {
    const before = fixture();
    const after = fixture();
    after.edges[0].data.computedPath = [{ x: 0, y: 0 }, { x: 0, y: 0 },
      { x: 5, y: 0 }, { x: 10, y: 0 }];
    expect(measure(before, after, [])).toMatchObject({ changedPathCount: 1, changedGeometryCount: 0 });
    after.edges[0].data.computedPath = [{ x: 0, y: 0 }, { x: 8, y: 0 },
      { x: 4, y: 0 }, { x: 10, y: 0 }];
    expect(measure(before, after, [])).toMatchObject({ changedPathCount: 1, changedGeometryCount: 1 });
    after.edges[0].data.computedPath = [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 10, y: 0 }];
    expect(measure(before, after, [])).toMatchObject({ changedGeometryCount: 1 });
    before.edges[0].data.computedPath = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    after.edges[0].data.computedPath = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }];
    expect(measure(before, after, [])).toMatchObject({ changedPathCount: 1, changedGeometryCount: 0 });
    after.edges[0].data.computedPath.reverse();
    expect(measure(before, after, [])).toMatchObject({ changedGeometryCount: 1 });
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
    for (const excluded of [null, ['missing'], [42], Array(5_001).fill('edge')]) {
      expect(() => measure(fixture(), fixture(), [], excluded)).toThrow(/Invalid/);
    }
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
    expect(projectDisplayRoutingEditStability({ ...metrics, changedGeometryCount: metrics.changedPathCount + 1 })).toBeNull();
    expect(projectDisplayRoutingEditStability({ ...metrics, changedGeometryCount: undefined })).toBeNull();
    expect(buildDisplayRoutingMachineResult([{ editStability: metrics }]).dragCases[0].editStability).toEqual(safe);
    await captureDisplayRoutingEditBaseline(session);
    window.__vizlyRoutingResponses = [];
    expect(() => readDisplayRoutingEditStability(session, ['edited'])).toThrow(/unavailable/);
    expect(window.__vizlyEditStabilityBaseline).toBeUndefined();
  });
});
