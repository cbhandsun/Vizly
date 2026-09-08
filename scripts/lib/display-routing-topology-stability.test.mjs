// @vitest-environment node
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { captureTopologyStabilityBaseline, readTopologyEditStability,
  assertTopologyEditStability, readTopologyVisibilityEvidence } from './display-routing-topology-stability.mjs';

const node = (id, parentId) => ({ id, parentId, position: { x: 0, y: 0 } });
const setup = () => {
  const graph = { nodes: [node('tms'), node('wms'), node('l-oms'), node('titlegroup-logistics')],
    edges: [{ id: 'edge', source: 'tms', target: 'wms', data: { computedPath: [{ x: 0, y: 0 }, { x: 10, y: 0 }] } }] };
  const window = { reactFlowInstance: { getNodes: () => graph.nodes, getEdges: () => graph.edges } };
  const session = { evaluate: source => vm.runInNewContext(source, { window }) };
  return { graph, window, session };
};

describe('topology edit stability', () => {
  it('reports missing endpoints and rendered membership without exporting graph identifiers', () => {
    const { graph, window } = setup();
    graph.edges[0].target = 'private-missing-node';
    const result = vm.runInNewContext(`(${readTopologyVisibilityEvidence.toString()})()`, {
      window, document: { querySelectorAll: () => [] },
    });
    expect(result).toEqual({ available: true, truncated: false, edges: [{ index: 0, rendered: false, hidden: false,
      sourceIndex: 0, targetIndex: -1, sourceHasPosition: true, targetHasPosition: false }] });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('bounds malformed and oversized diagnostic stores instead of treating them as empty diagrams', () => {
    for (const nodes of [undefined, null, {}, [null], Array(5_001).fill(node('private'))]) {
      const result = vm.runInNewContext(`(${readTopologyVisibilityEvidence.toString()})()`, {
        window: { reactFlowInstance: { getNodes: () => nodes, getEdges: () => [] } },
      });
      expect(result).toEqual({ available: false, truncated: false, edges: [] });
    }
    const { graph, window } = setup();
    graph.edges = Array(101).fill(graph.edges[0]);
    const result = vm.runInNewContext(`(${readTopologyVisibilityEvidence.toString()})()`, {
      window, document: { querySelectorAll: () => [] },
    });
    expect(result.available).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.edges).toHaveLength(100);
  });
  it('measures isolated additions/removals and enforces retained structure stability', async () => {
    const { graph, session } = setup();
    await captureTopologyStabilityBaseline(session);
    graph.nodes.push(node('routing-audit-isolated-node'));
    const added = await readTopologyEditStability(session, 'node-add', []);
    expect(added.intent).toMatchObject({ addedNodeCount: 1, movedNodeCount: 0, comparedEdgeCount: 1 });
    expect(() => assertTopologyEditStability('node-add', added)).not.toThrow();
    await captureTopologyStabilityBaseline(session);
    graph.nodes.pop();
    graph.nodes[0].position.x = 20;
    const removed = await readTopologyEditStability(session, 'node-remove', []);
    expect(removed.intent).toMatchObject({ removedNodeCount: 1, movedNodeCount: 1 });
    expect(() => assertTopologyEditStability('node-remove', removed)).toThrow('retained diagram');
  });

  it('reports affected routes separately instead of hiding changes inside the mutable group', async () => {
    const { graph, session } = setup();
    await captureTopologyStabilityBaseline(session);
    graph.edges[0].sourceHandle = 'right';
    graph.edges[0].data.computedPath[1].y = 20;
    const result = await readTopologyEditStability(session, 'port-policy', ['edge']);
    expect(result.intent).toMatchObject({ comparedEdgeCount: 1, changedPortCount: 1, changedGeometryCount: 1 });
    expect(result.outsideRoutingGroup).toMatchObject({ comparedEdgeCount: 0, changedPortCount: 0 });
    expect(result.observedMutableEdgeCount).toBe(1);
  });

  it('includes descendants in explicit movement and reports hidden route-set changes', async () => {
    const { graph, session } = setup();
    graph.nodes[0].parentId = 'titlegroup-logistics';
    await captureTopologyStabilityBaseline(session);
    graph.nodes[3].position.x = 30;
    const moved = await readTopologyEditStability(session, 'compound-subtree-move', ['edge']);
    expect(moved).toMatchObject({ explicitOrDescendantNodeCount: 2 });
    expect(moved.intent.movedNodeCount).toBe(0);
    await captureTopologyStabilityBaseline(session);
    graph.nodes[0].hidden = true;
    graph.edges[0].data.computedPath = null;
    const collapsed = await readTopologyEditStability(session, 'container-collapse', ['edge']);
    expect(collapsed).toMatchObject({ beforeHiddenNodeCount: 0, afterHiddenNodeCount: 1,
      beforeHiddenEdgeCount: 0, afterHiddenEdgeCount: 1 });
    expect(collapsed.intent).toMatchObject({ removedEdgeCount: 1, comparedEdgeCount: 0 });
  });

  it('keeps graph content local and clears baselines after invalid scope or missing route evidence', async () => {
    const { graph, session, window } = setup();
    graph.nodes[0].data = { label: 'private user contents' };
    await captureTopologyStabilityBaseline(session);
    const evidence = await readTopologyEditStability(session, 'edge-add', []);
    expect(JSON.stringify(evidence)).not.toMatch(/private|computedPath|titlegroup|sourceHandle/);
    expect(window.__vizlyTopologyStabilityBaseline).toBeUndefined();
    for (const scope of [null, [42], ['x'.repeat(513)], Array(5_001).fill('edge')]) {
      await captureTopologyStabilityBaseline(session);
      expect(() => readTopologyEditStability(session, 'edge-add', scope)).toThrow('Invalid');
      expect(window.__vizlyTopologyStabilityBaseline).toBeUndefined();
    }
    await captureTopologyStabilityBaseline(session);
    graph.edges[0].data.computedPath = null;
    expect(() => readTopologyEditStability(session, 'edge-add', [])).toThrow('Invalid');
    expect(window.__vizlyTopologyStabilityBaseline).toBeUndefined();
    expect(() => assertTopologyEditStability('node-add', null)).toThrow('Incomplete');
  });
});
