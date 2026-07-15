import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { buildRenderSceneFromReactFlow, buildRenderSceneFromReactFlowSnapshot } from '../../rendering/reactFlowScene';

describe('buildRenderSceneFromReactFlow', () => {
  it('normalizes visible React Flow nodes and edges into a render scene', () => {
    const nodes: Node[] = [
      {
        id: 'a',
        position: { x: 10, y: 20 },
        measured: { width: 100, height: 50 },
        data: { label: 'Source' },
      } as any,
      {
        id: 'b',
        position: { x: 240, y: 20 },
        measured: { width: 120, height: 60 },
        data: { description: 'Target' },
      } as any,
    ];
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        sourceHandle: 'right',
        targetHandle: 'left',
        markerEnd: { type: 'arrowclosed', color: '#111111' },
        style: { stroke: '#111111', strokeWidth: 2 },
        label: 'A to B',
      } as any,
    ];

    const scene = buildRenderSceneFromReactFlow(nodes, edges, { padding: 10 });

    expect(scene.nodes).toHaveLength(2);
    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]).toMatchObject({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      stroke: '#111111',
      strokeWidth: 2,
      label: 'A to B',
      markerEnd: { kind: 'arrow', color: '#111111' },
    });
    expect(scene.bounds).toMatchObject({ minX: 0, minY: 10, maxX: 370, maxY: 90 });
  });

  it('filters hidden nodes and edges with missing endpoints', () => {
    const scene = buildRenderSceneFromReactFlow(
      [
        { id: 'visible', position: { x: 0, y: 0 }, data: {} } as any,
        { id: 'hidden', position: { x: 10, y: 10 }, data: {}, hidden: true } as any,
      ],
      [
        { id: 'bad', source: 'visible', target: 'hidden' } as any,
        { id: 'missing', source: 'visible', target: 'nope' } as any,
      ],
    );

    expect(scene.nodes.map(node => node.id)).toEqual(['visible']);
    expect(scene.edges).toEqual([]);
    expect(scene.warnings).toEqual(['edge:bad:missing-endpoint', 'edge:missing:missing-endpoint']);
  });

  it('bounds invalid numbers and strips markup from labels', () => {
    const scene = buildRenderSceneFromReactFlow(
      [{
        id: 'x',
        position: { x: Number.NaN, y: Infinity },
        measured: { width: -1, height: 99_999_999 },
        data: { label: '<script>alert(1)</script><b>Hello</b>' },
      } as any],
      [],
    );

    expect(scene.nodes[0]).toMatchObject({
      x: 0,
      y: 0,
      width: 220,
      height: 120,
      label: 'Hello',
    });
  });

  it('preserves safe visual node tokens for SVG export fidelity', () => {
    const scene = buildRenderSceneFromReactFlow(
      [{
        id: 'decision',
        type: 'flowchart',
        position: { x: 0, y: 0 },
        measured: { width: 120, height: 80 },
        style: { backgroundColor: '#fff7ed', borderColor: '#fb923c', color: '#7c2d12', fontSize: 16, fontWeight: '600' },
        data: { label: 'Approve?', shape: 'diamond' },
      } as any],
      [],
    );

    expect(scene.nodes[0]).toMatchObject({
      shape: 'diamond',
      fill: '#fff7ed',
      stroke: '#fb923c',
      textColor: '#7c2d12',
      fontSize: 16,
      fontWeight: '600',
    });
  });

  it('normalizes database-like node shapes for SVG export', () => {
    const scene = buildRenderSceneFromReactFlow(
      [{
        id: 'db',
        type: 'custom',
        position: { x: 0, y: 0 },
        measured: { width: 120, height: 80 },
        data: { label: 'Orders', shape: 'database' },
      } as any],
      [],
    );

    expect(scene.nodes[0]).toMatchObject({
      shape: 'database',
      label: 'Orders',
    });
  });

  it('normalizes ER table columns for SVG export', () => {
    const scene = buildRenderSceneFromReactFlow(
      [{
        id: 'orders',
        type: 'ERDatabaseNode',
        position: { x: 0, y: 0 },
        measured: { width: 220, height: 160 },
        data: {
          tableName: 'orders',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true },
            { name: '<b>customer_id</b>', type: 'uuid', isForeign: true },
            { name: '<img onerror=x>total', type: 'decimal' },
          ],
        },
      } as any],
      [],
    );

    expect(scene.nodes[0]).toMatchObject({
      shape: 'database',
      label: 'orders',
      tableColumns: [
        { name: 'id', type: 'uuid', isPrimary: true, isForeign: false },
        { name: 'customer_id', type: 'uuid', isPrimary: false, isForeign: true },
        { name: 'total', type: 'decimal', isPrimary: false, isForeign: false },
      ],
    });
  });

  it('normalizes container and swimlane metadata for SVG export', () => {
    const scene = buildRenderSceneFromReactFlow(
      [
        {
          id: 'domain',
          type: 'titleGroup',
          position: { x: 0, y: 0 },
          measured: { width: 360, height: 220 },
          data: {
            label: 'Domain',
            collapsed: true,
            childCount: 5,
            themeColor: '#2563eb',
          },
        } as any,
        {
          id: 'lane',
          type: 'swimlane',
          position: { x: 400, y: 0 },
          measured: { width: 360, height: 220 },
          data: {
            label: 'Fulfillment',
            laneCount: 3,
            direction: 'horizontal',
            themeColor: '#0f766e',
          },
        } as any,
      ],
      [],
    );

    expect(scene.nodes[0]).toMatchObject({
      shape: 'group',
      container: {
        isContainer: true,
        isSwimlane: false,
        isLane: false,
        collapsed: true,
        childCount: 5,
        laneCount: 0,
        laneDirection: 'vertical',
        headerColor: '#2563eb',
      },
    });
    expect(scene.nodes[1]).toMatchObject({
      shape: 'group',
      container: {
        isContainer: true,
        isSwimlane: true,
        collapsed: false,
        laneCount: 3,
        laneDirection: 'horizontal',
        headerColor: '#0f766e',
      },
    });
  });

  it('normalizes node metadata used by SVG export', () => {
    const scene = buildRenderSceneFromReactFlow(
      [{
        id: 'arch',
        type: 'architecture',
        position: { x: 0, y: 0 },
        measured: { width: 160, height: 96 },
        data: {
          label: 'API Gateway',
          description: '<b>Public ingress</b>',
          icon: 'mdi:api',
          status: 'warning',
        },
      } as any],
      [],
    );

    expect(scene.nodes[0]).toMatchObject({
      label: 'API Gateway',
      subtitle: 'Public ingress',
      icon: 'mdi:api',
      status: 'warning',
    });
  });

  it('rejects unsafe or unknown node metadata values', () => {
    const scene = buildRenderSceneFromReactFlow(
      [{
        id: 'meta',
        position: { x: 0, y: 0 },
        data: {
          label: 'Meta',
          icon: '<img onerror=x>evil',
          status: 'url(javascript:alert(1))',
        },
      } as any],
      [],
    );

    expect(scene.nodes[0]).toMatchObject({
      icon: 'evil',
      status: undefined,
    });
  });

  it('rejects unsafe SVG style tokens from nodes, edges, and theme input', () => {
    const scene = buildRenderSceneFromReactFlow(
      [{
        id: 'unsafe',
        position: { x: 0, y: 0 },
        measured: { width: 100, height: 60 },
        style: {
          backgroundColor: 'url(javascript:alert(1))',
          borderColor: 'var(--secret-token)',
          color: 'expression(alert(1))',
          strokeDasharray: '1;stroke:red',
          fontWeight: 'url(#bad)',
        },
        data: { label: 'Unsafe', shape: 'group' },
      } as any],
      [{
        id: 'edge',
        source: 'unsafe',
        target: 'unsafe',
        style: {
          stroke: 'url(#external)',
          strokeDasharray: '5;animation:bad',
        },
        markerEnd: { type: 'arrowclosed', color: 'url(javascript:alert(1))' },
      } as any],
      {
        theme: {
          background: 'url(#leak)',
          nodeFill: 'var(--x)',
          nodeStroke: 'javascript:red',
          textColor: 'expression(red)',
          edgeStroke: 'url(#edge)',
        },
      },
    );

    expect(scene.theme).toEqual({
      background: '#ffffff',
      nodeFill: '#ffffff',
      nodeStroke: '#d1d5db',
      textColor: '#111827',
      edgeStroke: '#64748b',
    });
    expect(scene.nodes[0]).toMatchObject({
      fill: '#ffffff',
      stroke: '#d1d5db',
      textColor: '#111827',
      strokeDasharray: '6 4',
      fontWeight: undefined,
    });
    expect(scene.edges[0]).toMatchObject({
      stroke: '#64748b',
      strokeDasharray: undefined,
      markerEnd: { kind: 'arrow', color: '#64748b' },
    });
  });

  it('builds scenes from explicit React Flow snapshots', () => {
    const scene = buildRenderSceneFromReactFlowSnapshot({
      nodes: [{ id: 'n1', position: { x: 1, y: 2 }, data: { label: 'Snapshot node' } } as any],
      edges: [],
      viewport: { x: 10, y: 20, zoom: 1.5 },
    });

    expect(scene.nodes[0].label).toBe('Snapshot node');
    expect(scene.viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
  });
});
