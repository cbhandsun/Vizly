// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { createDisplayReverseLayoutFrame } from '../baseReactFlowDisplayReverseLayoutFrame';
import { getDisplayNodeRect } from '../baseReactFlowDisplayGeometry';
import { withDisplayAbsolutePositions } from '../baseReactFlowAbsolutePositions';

const nodes: Node[] = [
  { id: 'group', type: 'titleGroup', position: { x: 100, y: 100 }, measured: { width: 600, height: 600 }, data: {} },
  { id: 'a', parentId: 'group', position: { x: 40, y: 400 }, measured: { width: 120, height: 80 }, data: {} },
  { id: 'b', parentId: 'group', position: { x: 300, y: 50 }, measured: { width: 100, height: 60 }, data: {} },
];
const path = [{ x: 200, y: 500 }, { x: 200, y: 210 }, { x: 450, y: 210 }];
const makeEdges = (layoutDirection: unknown): Edge[] => [{
  id: 'a-b', source: 'a', target: 'b', sourceHandle: 'top', targetHandle: 'bottom',
  data: { layoutDirection, manualHandleSides: ['source', 'target'], computedPath: path,
    elkPath: path, treeRouting: { points: path }, waypoints: path, h: [123],
    __baseDisplayFinalizedSignature: 'old-frame', stablePathQuality: 'old-frame',
  },
}];

describe('reverse layout working frame', () => {
  it.each(['BT', 'RL'] as const)('reflects all geometric fields and preserves original hierarchy/intent for %s', direction => {
    const edges = makeEdges(direction);
    const before = structuredClone({ nodes, edges });
    const frame = createDisplayReverseLayoutFrame(nodes, edges);
    if (!frame) throw new Error('Expected reverse frame');
    expect(frame.edges[0].data?.layoutDirection).toBe('TB');
    expect(frame.nodes.every(node => !node.parentId)).toBe(true);
    const absolute = withDisplayAbsolutePositions(nodes, new Map(nodes.map(node => [node.id, node])));
    for (const [index, node] of frame.nodes.entries()) {
      const actual = getDisplayNodeRect(node);
      const original = getDisplayNodeRect(absolute[index]);
      if (!actual || !original) throw new Error('Missing rectangle');
      expect(actual.width).toBe(direction === 'RL' ? original.height : original.width);
      expect(actual.height).toBe(direction === 'RL' ? original.width : original.height);
      expect(actual.x).toBe(direction === 'RL' ? original.y : original.x);
      expect(actual.y).toBe(direction === 'BT' ? 800 - original.y - original.height : 800 - original.x - original.width);
    }
    const restored = frame.restoreEdges(frame.edges);
    expect(restored?.[0]).toMatchObject({
      sourceHandle: 'top', targetHandle: 'bottom',
      data: { layoutDirection: direction, manualHandleSides: ['source', 'target'],
        computedPath: path, elkPath: path, waypoints: path, treeRouting: { points: path } },
    });
    expect(restored?.[0].data?.h).toBeUndefined();
    expect(restored?.[0].data?.__baseDisplayFinalizedSignature).toBeUndefined();
    expect(restored?.[0].data?.stablePathQuality).toBeUndefined();
    expect({ nodes, edges }).toEqual(before);
  });

  it.each([undefined, null, '', 'TB', 'LR', 'bt', '<svg onload=alert(1)>', 42, {}])('ignores non-reversed intent %j', direction => {
    expect(createDisplayReverseLayoutFrame(nodes, makeEdges(direction))).toBeNull();
  });

  it.each(['BT', 'RL'] as const)('is independent of graph identifiers and translated coordinates for %s', direction => {
    const original = createDisplayReverseLayoutFrame(nodes, makeEdges(direction));
    const dx = -54321;
    const dy = 12345;
    const shiftedNodes = nodes.map(node => ({ ...node, id: `other-${node.id}`,
      ...(node.parentId ? { parentId: `other-${node.parentId}` } : {}),
      position: node.parentId ? node.position : { x: node.position.x + dx, y: node.position.y + dy },
    }));
    const shiftedPath = path.map(p => ({ x: p.x + dx, y: p.y + dy }));
    const shiftedEdges = makeEdges(direction).map(edge => ({ ...edge, id: 'unrelated-edge-id',
      source: `other-${edge.source}`, target: `other-${edge.target}`,
      data: { layoutDirection: direction, computedPath: shiftedPath },
    }));
    const shifted = createDisplayReverseLayoutFrame(shiftedNodes, shiftedEdges);
    if (!original || !shifted) throw new Error('Expected translated reverse frame');
    expect(shifted.nodes.map(node => node.position)).toEqual(original.nodes.map(node => ({
      x: node.position.x + (direction === 'RL' ? dy : dx), y: node.position.y + (direction === 'RL' ? dx : dy),
    })));
    expect(shifted.restoreEdges(shifted.edges)?.[0].data?.computedPath).toEqual(shiftedPath);
  });

  it('declines empty, mixed-direction and custom-port graphs', () => {
    expect(createDisplayReverseLayoutFrame([], makeEdges('BT'))).toBeNull();
    expect(createDisplayReverseLayoutFrame(nodes, [])).toBeNull();
    expect(createDisplayReverseLayoutFrame(nodes, [...makeEdges('BT'), ...makeEdges('RL')])).toBeNull();
    expect(createDisplayReverseLayoutFrame(nodes, makeEdges('BT').map(edge => ({ ...edge, sourceHandle: 'custom-top' })))).toBeNull();
  });

  it.each(['BT', 'RL'] as const)('reflects cached tree terminal roles with the %s frame', direction => {
    const edges = makeEdges(direction).map(edge => ({ ...edge, data: { ...edge.data,
      treeRouting: { points: path, effectiveSourceHandle: 't', effectiveTargetHandle: 'r' },
    } }));
    const frame = createDisplayReverseLayoutFrame(nodes, edges);
    expect(frame?.edges[0].data?.treeRouting).toMatchObject({
      effectiveSourceHandle: direction === 'BT' ? 'b' : 'l',
      effectiveTargetHandle: direction === 'RL' ? 't' : 'r',
    });
    expect(frame?.restoreEdges(frame.edges)?.[0].data?.treeRouting).toEqual(edges[0].data.treeRouting);
    expect(createDisplayReverseLayoutFrame(nodes, [{ ...edges[0], data: { ...edges[0].data,
      treeRouting: { effectiveSourceHandle: 'custom' },
    } }])).toBeNull();
    expect(createDisplayReverseLayoutFrame([...nodes, nodes[0]], edges)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity, 1e20])('declines unsafe geometry %s', bad => {
    expect(createDisplayReverseLayoutFrame([{ ...nodes[0], position: { x: bad, y: 0 } }], makeEdges('BT'))).toBeNull();
    expect(createDisplayReverseLayoutFrame([{ ...nodes[0], measured: { width: bad, height: 80 } }], makeEdges('BT'))).toBeNull();
    expect(createDisplayReverseLayoutFrame([{ ...nodes[0], ...{ positionAbsolute: { x: 0, y: bad } } }], makeEdges('BT'))).toBeNull();
  });

  it('rejects malformed/out-of-bounds paths and keeps special identifiers inert', () => {
    const edges = makeEdges('BT');
    const frame = createDisplayReverseLayoutFrame(nodes, edges);
    if (!frame) throw new Error('Expected reverse frame');
    for (const bad of [null, 'path', [{ x: 1 }], [{ x: NaN, y: 2 }], [{ x: 0, y: -1e9 }]]) {
      expect(frame.restoreEdges([{ ...edges[0], data: { computedPath: bad } }])).toBeNull();
    }
    const specialNodes = nodes.map(node => node.id === 'a' ? { ...node, id: '__proto__' } : node);
    const specialEdges = edges.map(edge => ({ ...edge, source: '__proto__', sourceHandle: 't' }));
    const special = createDisplayReverseLayoutFrame(specialNodes, specialEdges);
    expect(special?.edges[0].sourceHandle).toBe('b');
    expect(special?.restoreEdges(special.edges)?.[0].sourceHandle).toBe('t');
    expect(Object.prototype).not.toHaveProperty('computedPath');
  });
});
