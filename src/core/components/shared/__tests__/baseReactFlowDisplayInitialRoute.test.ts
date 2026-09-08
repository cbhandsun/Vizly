import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { seedObstacleAwareDisplayRoutes } from '../baseReactFlowDisplayInitialRoute';
import { getDisplayComputedPath, getDisplayNodeRect } from '../baseReactFlowDisplayGeometry';
import { segmentToClearanceRectDistance } from '../../../strategies/shared/edgeNodeClearanceGeometry';
import { createDisplayTerminalValidationSnapshot } from '../baseReactFlowTerminalValidation';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';

const node = (id: string, x: number, y: number): Node => ({
  id, position: { x, y }, width: 100, height: 60, data: {},
});
const edge: Edge = { id: 'edge', source: 'source', target: 'target', type: 'advanced-smart-step' };
const expectClearance = (routed: Edge, blocker: Node) => {
  const rect = getDisplayNodeRect(blocker);
  expect(rect).not.toBeNull();
  if (!rect) throw new Error('Test obstacle must have geometry');
  const path = getDisplayComputedPath(routed);
  expect(path.length).toBeGreaterThanOrEqual(2);
  for (let index = 1; index < path.length; index += 1) {
    expect(segmentToClearanceRectDistance({ a: path[index - 1], b: path[index] }, rect))
      .toBeGreaterThanOrEqual(48);
  }
};

describe('initial obstacle-aware display routing', () => {
  it.each([
    [0, 300, 'bottom', 'top'], [0, -300, 'top', 'bottom'],
    [300, 0, 'right', 'left'], [-300, 0, 'left', 'right'],
  ] as const)('chooses matching outward ports for a straight route to %i,%i', (x, y, source, target) => {
    const nodes = [node('source', 0, 0), node('target', x, y)];
    const original = structuredClone({ nodes, edge });
    const result = seedObstacleAwareDisplayRoutes([edge], nodes);
    expect(result[0]).toMatchObject({ sourceHandle: source, targetHandle: target });
    expect(getDisplayComputedPath(result[0])).toHaveLength(2);
    expect(createDisplayTerminalValidationSnapshot(nodes).validateEdge(result[0]))
      .toMatchObject({ attached: true, anchored: true });
    expect({ nodes, edge }).toEqual(original);
  });

  it('selects another port when the nearest facing corridor cannot keep node clearance', () => {
    const blocker = node('blocker', 0, 176);
    const nodes = [node('source', 0, 0), node('target', 0, 300), blocker];
    const result = seedObstacleAwareDisplayRoutes([edge], nodes);
    expect(result[0].sourceHandle).not.toBe('bottom');
    expect(countDisplayObstacleHits(result, nodes)).toBe(0);
    expectClearance(result[0], blocker);
  });

  it('routes fixed sides through a free obstacle-boundary corridor', () => {
    const blocker = node('blocker', 240.25, 0.25);
    const nodes = [node('source', 0.25, 0.25), node('target', 600.25, 0.25), blocker];
    const manual = {
      ...edge, sourceHandle: 'source-right-custom', targetHandle: 'target-left-custom',
      data: { manualHandleSides: ['source', 'target'] },
    };
    const [result] = seedObstacleAwareDisplayRoutes([manual], nodes);
    expect(result).toMatchObject({ sourceHandle: manual.sourceHandle, targetHandle: manual.targetHandle });
    expect(countDisplayObstacleHits([result], nodes)).toBe(0);
    expectClearance(result, blocker);
  });

  it('resolves nested local coordinates without using container interiors as obstacles', () => {
    const nodes: Node[] = [
      { ...node('group', 700, 800), type: 'group', width: 1000, height: 1000 },
      { ...node('source', 0, 0), parentId: 'group' },
      { ...node('target', 0, 300), parentId: 'group' },
    ];
    expect(getDisplayComputedPath(seedObstacleAwareDisplayRoutes([edge], nodes)[0]))
      .toEqual([{ x: 750, y: 860 }, { x: 750, y: 1100 }]);
  });

  it('retains authored geometry and refuses missing, forbidden and unresolved fixed ports', () => {
    const nodes = [node('source', 0, 0), node('target', 0, 300)];
    const unchanged: Edge[] = [
      { ...edge, type: 'custom-edge' },
      { ...edge, target: 'missing' },
      { ...edge, target: 'source' },
      { ...edge, data: { sourcePortPolicy: 'forbidden' } },
      { ...edge, sourceHandle: 'unresolved', data: { manualHandles: true } },
      { ...edge, data: { computedPath: [{ x: 50, y: 60 }, { x: 50, y: 300 }] } },
    ];
    for (const item of unchanged) {
      const input = [item];
      expect(seedObstacleAwareDisplayRoutes(input, nodes)).toBe(input);
    }
  });

  it('reconstructs unsafe router-owned layout seeds without treating runtime locks as geometry approval', () => {
    const blocker = node('blocker', 0, 176);
    const nodes = [node('source', 0, 0), node('target', 0, 300), blocker];
    const provisional: Edge = {
      ...edge, sourceHandle: 'bottom', targetHandle: 'top',
      data: {
        algorithm: 'domain-dagre-interactive',
        computedPath: [{ x: 50, y: 60 }, { x: 50, y: 300 }],
        runtimeHandleLock: { source: true, target: true }, layoutPathLocked: true,
      },
    };
    expectClearance(seedObstacleAwareDisplayRoutes([provisional], nodes)[0], blocker);
    const cleanPeer: Edge = {
      ...provisional, id: 'clean-peer', sourceHandle: 'left', targetHandle: 'left',
      data: { ...provisional.data, computedPath: [
        { x: 0, y: 30 }, { x: -100, y: 30 }, { x: -100, y: 330 }, { x: 0, y: 330 },
      ] },
    };
    const locallyDamaged = [provisional, cleanPeer, { ...cleanPeer, id: 'clean-peer-2' }];
    expect(seedObstacleAwareDisplayRoutes(locallyDamaged, nodes)).toBe(locallyDamaged);
    const beyondInteractiveCapacity = [
      ...Array.from({ length: 13 }, (_, index) => ({ ...provisional, id: `damaged-${index}` })),
      ...Array.from({ length: 23 }, (_, index) => ({ ...cleanPeer, id: `clean-${index}` })),
    ];
    // Fewer than half the paths are obstructed, but all 13 cannot fit into
    // the existing 12-edge interactive repair allowance.
    const reconstructed = seedObstacleAwareDisplayRoutes(beyondInteractiveCapacity, nodes);
    expect(reconstructed).not.toBe(beyondInteractiveCapacity);
    expectClearance(reconstructed[0], blocker);
    const authored = [{ ...provisional, data: { ...provisional.data, manualHandles: true } }];
    expect(seedObstacleAwareDisplayRoutes(authored, nodes)).toBe(authored);
    for (const algorithm of [undefined, 'elk']) {
      const existing = [{ ...provisional, data: { ...provisional.data, algorithm } }];
      expect(seedObstacleAwareDisplayRoutes(existing, nodes)).toBe(existing);
    }
    const safe = [provisional];
    expect(seedObstacleAwareDisplayRoutes(safe, nodes.slice(0, 2))).toBe(safe);
  });

  it('reconstructs only unsafe full-layout proposals while preserving authored geometry and fixed ports', () => {
    const blocker = node('blocker', 240, 0);
    const nodes = [node('source', 0, 0), node('target', 600, 0), blocker];
    const proposal: Edge = {
      ...edge, sourceHandle: 'right', targetHandle: 'left',
      data: { algorithm: 'domain-dagre-full', layoutPathLocked: true,
        runtimeHandleLock: { source: true, target: true },
        computedPath: [{ x: 100, y: 30 }, { x: 600, y: 30 }] },
    };
    const input = [proposal];
    const original = structuredClone(input);
    const [routed] = seedObstacleAwareDisplayRoutes(input, nodes);
    expectClearance(routed, blocker);
    expect(input).toEqual(original);
    expect(createDisplayTerminalValidationSnapshot(nodes).validateEdge(routed))
      .toMatchObject({ attached: true, anchored: true });
    const safe = [proposal];
    expect(seedObstacleAwareDisplayRoutes(safe, nodes.slice(0, 2))).toBe(safe);
    for (const waypoints of [[{ x: 200, y: 30 }], null, 'invalid']) {
      const authored = [{ ...proposal, data: { ...proposal.data, waypoints } }];
      expect(seedObstacleAwareDisplayRoutes(authored, nodes)).toBe(authored);
    }
    for (const data of [
      { ...proposal.data, manualHandles: true },
      { ...proposal.data, algorithm: undefined },
      { ...proposal.data, algorithm: 'elk' },
      { ...proposal.data, computedPath: Array.from({ length: 129 }, () => ({ x: 100, y: 30 })) },
    ]) {
      const preserved = [{ ...proposal, data }];
      expect(seedObstacleAwareDisplayRoutes(preserved, nodes)).toBe(preserved);
    }
    const [emptyWaypoints] = seedObstacleAwareDisplayRoutes([
      { ...proposal, data: { ...proposal.data, waypoints: [] } },
    ], nodes);
    expectClearance(emptyWaypoints, blocker);
    const cleanPeer = { ...routed, id: 'clean-peer', data: { ...routed.data, algorithm: 'domain-dagre-full' } };
    expect(seedObstacleAwareDisplayRoutes([proposal, cleanPeer], nodes)[1]).toBe(cleanPeer);
  });

  it('defers incomplete, invalid, extreme and over-budget geometry to the measured routing pipeline', () => {
    const input = [edge];
    const valid = [node('source', 0, 0), node('target', 0, 300)];
    const empty: Edge[] = [];
    expect(seedObstacleAwareDisplayRoutes(empty, valid)).toBe(empty);
    expect(seedObstacleAwareDisplayRoutes(input, [])).toBe(input);
    for (const value of [NaN, Infinity, -Infinity, 1e20]) {
      expect(seedObstacleAwareDisplayRoutes(input, [node('source', value, 0), valid[1]])).toBe(input);
    }
    for (const width of [0, -1, NaN, Infinity, 1e20]) {
      expect(seedObstacleAwareDisplayRoutes(input, [{ ...valid[0], width }, valid[1]])).toBe(input);
    }
    expect(seedObstacleAwareDisplayRoutes(input, [...valid, { id: 'unknown', position: { x: 0, y: 0 }, data: {} }]))
      .toBe(input);
    expect(seedObstacleAwareDisplayRoutes(input, Array.from({ length: 97 }, (_, i) => node(String(i), 0, 0))))
      .toBe(input);
    const manyEdges = Array.from({ length: 2501 }, () => edge);
    expect(seedObstacleAwareDisplayRoutes(manyEdges, valid)).toBe(manyEdges);
  });
});
