import { describe, expect, it, vi } from 'vitest';
import type { Edge } from '@xyflow/react';

import { LayoutType, type LayoutOptions } from '../../types/layout';
import { prepareDomainDagreEdges } from '../DomainDagreEdgePreparation';
import type { RoutingNode } from '../domainDagreEdgePreparationSupport';

const { loadFull } = vi.hoisted(() => ({ loadFull: vi.fn() }));
vi.mock('../domainDagreFullEdgePreparation', async importOriginal => {
  loadFull();
  return importOriginal<typeof import('../domainDagreFullEdgePreparation')>();
});

const prepareReverseInteractive = (
  data: Record<string, unknown>,
  orderedLanes: boolean,
  handles: Pick<Edge, 'sourceHandle' | 'targetHandle'> = {
    sourceHandle: 'source-bottom-port-1', targetHandle: 'target-top-port-1',
  },
): Promise<Edge[]> => {
  const nodes: RoutingNode[] = [
    { id: 'source', position: { x: 100, y: 300 }, measured: { width: 120, height: 60 }, data: {} },
    { id: 'target', position: { x: 100, y: 0 }, measured: { width: 120, height: 60 }, data: {} },
  ];
  return prepareDomainDagreEdges({
    nodes,
    edges: [{ id: 'edge', source: 'source', target: 'target', ...handles, data }],
    options: {
      type: LayoutType.DAGRE, direction: 'TB', edgeRoutingQuality: 'interactive',
      ...(orderedLanes ? { domainPlacement: 'ordered-lanes' } : {}),
    },
    config: {}, nodeById: new Map(nodes.map(node => [node.id, node])), leafNodes: nodes,
  });
};

const authoredTerminalConstraints: Array<[string, Record<string, unknown>]> = [
  ['manual handles', { manualHandles: { source: true, target: true } }],
  ['legacy manual handles', { _manualHandles: { source: true, target: true } }],
  ['manual sides', { manualHandleSides: ['source', 'target'] }],
  ['manual positions', { manualHandlePositions: ['SOURCE', 'TARGET'] }],
  ['handle locks', { sourceHandleLocked: true, targetHandleLocked: true }],
  ['position locks', { sourceHandlePositionLocked: true, targetHandlePositionLocked: true }],
  ['strong policies', { sourcePortPolicy: 'strong', targetPortPolicy: 'strong' }],
  ['fixed policies', { sourcePortPolicy: 'fixed', targetPortPolicy: 'fixed' }],
  ['fixed side constraints', { sourcePortConstraint: 'fixed_side', targetPortConstraint: 'fixed-side' }],
  ['fixed position policies', { sourcePortPolicy: 'fixed-pos', targetPortPolicy: 'fixed_pos' }],
  ['forbidden constraints', { sourcePortConstraint: 'forbidden', targetPortConstraint: 'forbidden' }],
];

describe('prepareDomainDagreEdges', () => {
  describe.each([false, true])('interactive routing with ordered lanes=%s', orderedLanes => {
    it.each(authoredTerminalConstraints)('preserves %s through the production entry', async (_name, data) => {
      const original = structuredClone(data);
      const [edge] = await prepareReverseInteractive(data, orderedLanes);

      expect(edge).toMatchObject({
        sourceHandle: 'source-bottom-port-1', targetHandle: 'target-top-port-1',
        data: { autoSource: false, autoTarget: false, auto: [], runtimeHandleLock: { source: true, target: true } },
      });
      expect(data).toEqual(original);
      expect(loadFull).not.toHaveBeenCalled();
    });

    it.each([
      { runtimeHandleLock: true },
      { runtimeHandleLock: { source: true, target: true } },
      { _runtimeHandleLock: { source: true, target: true } },
    ])('keeps router-owned runtime terminals mutable', async data => {
      const [edge] = await prepareReverseInteractive(data, orderedLanes);
      expect(edge).toMatchObject({
        sourceHandle: 'top', targetHandle: 'bottom',
        data: { autoSource: true, autoTarget: true, auto: ['source', 'target'] },
      });
    });

    it('keeps exact shorthand handle identities', async () => {
      const [edge] = await prepareReverseInteractive({ manualHandles: true }, orderedLanes, {
        sourceHandle: 'b', targetHandle: 't',
      });
      expect(edge).toMatchObject({ sourceHandle: 'b', targetHandle: 't' });
    });

    it('does not invent handles for empty authored exact terminals', async () => {
      const [edge] = await prepareReverseInteractive({ manualHandles: true }, orderedLanes, {
        sourceHandle: null, targetHandle: '',
      });
      expect(edge).toMatchObject({ sourceHandle: null, targetHandle: '', data: { autoSource: false, autoTarget: false } });
    });

    it('does not treat malformed constraint metadata as authored locks', async () => {
      const [edge] = await prepareReverseInteractive({
        manualHandles: ['source', 'target'], manualHandlePositions: 'source',
        sourceHandleLocked: 'true', targetPortPolicy: { value: 'fixed' },
      }, orderedLanes);
      expect(edge).toMatchObject({ sourceHandle: 'top', targetHandle: 'bottom', data: { autoSource: true, autoTarget: true } });
    });
  });

  it('preserves leaf geometry and canonicalizes subpixel DOM dimensions', async () => {
    const nodes: RoutingNode[] = [
      {
        id: 'source',
        type: 'custom',
        position: { x: 0, y: 0 },
        measured: { width: 249, height: 96 },
        data: {},
      },
      {
        id: 'target',
        type: 'custom',
        position: { x: 400, y: 0 },
        measured: { width: 217.4, height: 95.6 },
        data: {},
      },
    ];
    const edges: Edge[] = [{ id: 'edge', source: 'source', target: 'target' }];
    const nodeById = new Map(nodes.map(node => [node.id, node] as const));
    const options: LayoutOptions = {
      type: LayoutType.DAGRE,
      direction: 'LR',
      edgeRoutingQuality: 'interactive',
    };

    await prepareDomainDagreEdges({
      nodes,
      edges,
      options,
      config: {},
      nodeById,
      leafNodes: nodes,
    });

    expect(loadFull).not.toHaveBeenCalled();

    expect(nodes.map(node => ({
      width: node.width,
      height: node.height,
      measured: node.measured,
    }))).toEqual([
      { width: 249, height: 96, measured: { width: 249, height: 96 } },
      { width: 217, height: 96, measured: { width: 217, height: 96 } },
    ]);
  });
});
