import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  areBaseReactFlowInternalNodesReadyForRouting,
  collectBaseReactFlowInternalNodes,
  computeBaseReactFlowInternalNodeGeometrySignature,
  filterBaseReactFlowVisibleNodes,
  isBaseReactFlowNodeHidden,
  mergeBaseReactFlowMeasuredNodes,
  normalizeBaseReactFlowRenderableNodes,
} from '../baseReactFlowRenderableNodes';

describe('baseReactFlowRenderableNodes', () => {
  it('waits for every internal node to publish finite positive routing geometry', () => {
    const ready = {
      id: 'ready',
      position: { x: 0, y: 0 },
      measured: { width: 120, height: 80 },
      internals: { positionAbsolute: { x: 10, y: 20 } },
    } as unknown as Node;
    const incomplete = {
      id: 'incomplete',
      position: { x: 0, y: 0 },
      measured: { width: 0, height: 80 },
      internals: { positionAbsolute: { x: 30, y: 40 } },
    } as unknown as Node;
    const lookup = new Map<string, Node>([
      ['ready', ready],
      ['incomplete', incomplete],
    ]);

    expect(areBaseReactFlowInternalNodesReadyForRouting([], lookup)).toBe(false);
    expect(areBaseReactFlowInternalNodesReadyForRouting(['ready', 'missing'], lookup)).toBe(false);
    expect(areBaseReactFlowInternalNodesReadyForRouting(['ready', 'incomplete'], lookup)).toBe(false);

    (incomplete as any).measured.width = 100;
    expect(areBaseReactFlowInternalNodesReadyForRouting(['ready', 'incomplete'], lookup)).toBe(true);
  });

  it('promotes data.hidden to React Flow hidden without mutating visible nodes', () => {
    const visible: Node = {
      id: 'visible',
      position: { x: 0, y: 0 },
      data: {},
    };
    const hiddenByData: Node = {
      id: 'hidden-by-data',
      position: { x: 10, y: 10 },
      data: { hidden: true },
    };

    const normalized = normalizeBaseReactFlowRenderableNodes([visible, hiddenByData]);

    expect(normalized[0]).toBe(visible);
    expect(normalized[1]).not.toBe(hiddenByData);
    expect(normalized[1].hidden).toBe(true);
    expect(hiddenByData.hidden).toBeUndefined();
  });

  it('filters nodes hidden by either React Flow or app data state', () => {
    const nodes: Node[] = [
      { id: 'visible', position: { x: 0, y: 0 }, data: {} },
      { id: 'hidden-by-react-flow', position: { x: 0, y: 0 }, data: {}, hidden: true },
      { id: 'hidden-by-data', position: { x: 0, y: 0 }, data: { hidden: true } },
    ];

    expect(isBaseReactFlowNodeHidden(nodes[0])).toBe(false);
    expect(filterBaseReactFlowVisibleNodes(nodes).map((node) => node.id)).toEqual(['visible']);
  });

  it('merges current React Flow geometry without overwriting source node metadata', () => {
    const source: Node = {
      id: 'node',
      type: 'custom',
      position: { x: 10, y: 20 },
      measured: { width: 180, height: 118 },
      data: { business: 'latest' },
      style: { background: 'blue' },
    };
    const internal = {
      id: 'node',
      position: { x: 11, y: 22 },
      measured: { width: 406, height: 197 },
      data: { business: 'stale' },
      internals: { positionAbsolute: { x: 111, y: 222 } },
    } as unknown as Node;

    const merged = mergeBaseReactFlowMeasuredNodes([source], [internal]);

    expect(merged[0]).toMatchObject({
      id: 'node',
      type: 'custom',
      position: { x: 11, y: 22 },
      positionAbsolute: { x: 111, y: 222 },
      width: 406,
      height: 197,
      measured: { width: 406, height: 197 },
      data: { business: 'latest' },
      style: { background: 'blue' },
    });
  });

  it('detects in-place nodeLookup geometry updates and collects the measured entries', () => {
    const internal = {
      id: 'node',
      position: { x: 10, y: 20 },
      measured: { width: 406, height: 197 },
      internals: { positionAbsolute: { x: 111, y: 222 } },
    } as unknown as Node;
    const nodeLookup = new Map([['node', internal]]);
    const first = computeBaseReactFlowInternalNodeGeometrySignature(['node'], nodeLookup);

    (internal as any).measured.height = 199;
    const second = computeBaseReactFlowInternalNodeGeometrySignature(['node'], nodeLookup);

    expect(second).not.toBe(first);
    expect(collectBaseReactFlowInternalNodes(['node', 'missing'], nodeLookup)).toEqual([internal]);
  });

  it('uses the DOM-measured height when correcting a stale source boundary', () => {
    const source: Node = {
      id: 'l-oms',
      position: { x: 1120.25, y: 605 },
      measured: { width: 406, height: 197 },
      data: {},
    };
    const internal = {
      ...source,
      measured: { width: 406, height: 199 },
      internals: { positionAbsolute: { x: 1120.25, y: 605 } },
    } as unknown as Node;

    const merged = mergeBaseReactFlowMeasuredNodes([source], [internal]);

    expect((merged[0] as any).positionAbsolute).toEqual({ x: 1120.25, y: 605 });
    expect((merged[0] as any).measured.height).toBe(199);
    expect(merged[0].height).toBe(199);
  });

  it('prefers current React Flow internals over a stale top-level absolute position', () => {
    const source = {
      id: 'node',
      position: { x: 50, y: 50 },
      positionAbsolute: { x: -474, y: -2024 },
      measured: { width: 120, height: 60 },
      data: {},
    } as unknown as Node;
    const internal = {
      ...source,
      positionAbsolute: { x: -474, y: -2024 },
      internals: { positionAbsolute: { x: 50, y: 50 } },
    } as unknown as Node;

    const merged = mergeBaseReactFlowMeasuredNodes([source], [internal]);

    expect(merged[0]).toMatchObject({
      position: { x: 50, y: 50 },
      positionAbsolute: { x: 50, y: 50 },
    });
  });
});
