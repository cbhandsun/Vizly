import { describe, expect, it } from 'vitest';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { buildRenderSceneFromReactFlow, buildRenderSceneFromReactFlowSnapshot } from '../../rendering/reactFlowScene';
import { browserLogisticsNodes } from '../../components/shared/__tests__/fixtures/logisticsBrowserRoutingFixture';

describe('buildRenderSceneFromReactFlow', () => {
  it('preserves deterministic stable-edge line jumps in the export scene', () => {
    const nodes: Node[] = [
      { id: 'left', position: { x: 0, y: 0 }, data: {} },
      { id: 'right', position: { x: 160, y: 0 }, data: {} },
      { id: 'top', position: { x: 80, y: -40 }, data: {} },
      { id: 'bottom', position: { x: 80, y: 100 }, data: {} },
    ];
    const edges: Edge[] = [
      {
        id: 'horizontal',
        source: 'left',
        target: 'right',
        type: 'stablePath',
        data: { computedPath: [{ x: 0, y: 40 }, { x: 160, y: 40 }] },
      },
      {
        id: 'vertical',
        source: 'top',
        target: 'bottom',
        type: 'stablePath',
        data: { computedPath: [{ x: 80, y: 0 }, { x: 80, y: 100 }] },
      },
    ];

    const scene = buildRenderSceneFromReactFlow(nodes, edges);

    expect(scene.edges.find(edge => edge.id === 'horizontal')?.path).toContain('A 6 6');
    expect(scene.edges.find(edge => edge.id === 'vertical')?.path).not.toContain('A 6 6');
  });

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

  it('fails closed to one complete semantic edge when an orphan render-only plan is injected', () => {
    const nodes = [
      { id: 'owner-source', position: { x: 0, y: 0 }, data: {} },
      { id: 'member-source', position: { x: 0, y: 120 }, data: {} },
      { id: 'target', position: { x: 300, y: 0 }, data: {} },
    ] satisfies Node[];
    const edges = [
      {
        id: 'member',
        source: 'member-source',
        target: 'target',
        label: 'Shared trunk label',
        markerStart: { type: MarkerType.Arrow, color: '#2563eb' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
        style: { stroke: '#2563eb' },
        data: {
          computedPath: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 160, y: 0 }],
          __vizlySharedTrunkPaint: {
            hiddenRanges: [{ from: 50, to: 110, role: 'target', ownerEdgeId: 'owner' }],
            memberships: [{
              id: 'target:target:owner',
              role: 'target',
              endpointId: 'target',
              ownerEdgeId: 'owner',
              edgeIds: ['member', 'owner'],
              commonLength: 60,
            }],
            backboneRanges: [],
          },
        },
      },
    ] satisfies Edge[];

    const scene = buildRenderSceneFromReactFlow(nodes, edges);
    const memberFragments = scene.edges.filter(edge => edge.id === 'member');

    expect(memberFragments).toHaveLength(1);
    expect(memberFragments[0]).toMatchObject({
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 160, y: 0 }],
      markerStart: { kind: 'arrow' },
      markerEnd: { kind: 'arrow' },
      label: 'Shared trunk label',
    });
  });

  it('derives the shared-trunk paint plan when an export snapshot contains raw routed edges', () => {
    const nodes = [
      { id: 'source-a', position: { x: 0, y: 0 }, data: {} },
      { id: 'source-b', position: { x: 0, y: 120 }, data: {} },
      { id: 'target', position: { x: 240, y: 0 }, data: {} },
    ] satisfies Node[];
    const edges = [
      {
        id: 'a-owner', source: 'source-a', target: 'target',
        style: { stroke: '#47cacc', strokeWidth: 2, strokeDasharray: '6 4' },
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 160, y: 0 }] },
      },
      {
        id: 'b-member', source: 'source-b', target: 'target',
        style: { stroke: '#47cacc', strokeWidth: 2, strokeDasharray: '6 4' },
        data: { computedPath: [{ x: 100, y: 120 }, { x: 100, y: 0 }, { x: 160, y: 0 }] },
      },
    ] satisfies Edge[];

    const scene = buildRenderSceneFromReactFlow(nodes, edges);

    expect(scene.edges.find(edge => edge.id === 'a-owner')?.points).toEqual([
      { x: 0, y: 0 }, { x: 100, y: 0 },
    ]);
    expect(scene.edges.find(edge => edge.id === 'b-member')?.points).toEqual([
      { x: 100, y: 120 }, { x: 100, y: 0 },
    ]);
    expect(scene.edges.find(edge => edge.id === 'a-owner::shared-backbone:0')).toMatchObject({
      points: [{ x: 100, y: 0 }, { x: 160, y: 0 }],
      stroke: '#47CACC',
      strokeWidth: 2,
      strokeDasharray: '6 4',
      label: '',
      markerStart: { kind: 'none' },
      markerEnd: { kind: 'none' },
    });
  });

  it('exports a mixed-semantic source trunk once in neutral canonical paint', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target-a', position: { x: 200, y: -100 }, data: {} },
      { id: 'target-b', position: { x: 200, y: 100 }, data: {} },
    ] satisfies Node[];
    const edges = [
      {
        id: 'a-primary',
        source: 'source',
        target: 'target-a',
        label: 'Primary branch',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#FF5722' },
        style: { stroke: '#FF5722', strokeWidth: 3 },
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }] },
      },
      {
        id: 'b-observability',
        source: 'source',
        target: 'target-b',
        label: 'Trace branch',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#47CACC' },
        style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] },
      },
    ] satisfies Edge[];

    const scene = buildRenderSceneFromReactFlow(nodes, edges);
    const backbone = scene.edges.filter(edge => edge.id.includes('::shared-backbone:'));

    expect(backbone).toHaveLength(1);
    expect(backbone[0]).toMatchObject({
      id: 'a-primary::shared-backbone:0',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      stroke: '#64748B',
      strokeWidth: 3,
      strokeDasharray: undefined,
      opacity: 0.92,
      label: '',
      markerStart: { kind: 'none' },
      markerEnd: { kind: 'none' },
    });
    expect(scene.edges.find(edge => edge.id === 'a-primary')).toMatchObject({
      points: [{ x: 100, y: 0 }, { x: 100, y: -100 }],
      label: 'Primary branch',
      markerEnd: { kind: 'arrow' },
    });
    expect(scene.edges.find(edge => edge.id === 'b-observability')).toMatchObject({
      points: [{ x: 100, y: 0 }, { x: 100, y: 100 }],
      label: 'Trace branch',
      markerEnd: { kind: 'arrow' },
    });
  });

  it('keeps nested canonical source intervals adjacent without repainting either interval', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target-a', position: { x: 100, y: -100 }, data: {} },
      { id: 'target-b', position: { x: 160, y: 100 }, data: {} },
      { id: 'target-c', position: { x: 160, y: -100 }, data: {} },
    ] satisfies Node[];
    const edges = [
      {
        id: 'a-short', source: 'source', target: 'target-a',
        style: { stroke: '#FF5722', strokeWidth: 3 },
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }] },
      },
      {
        id: 'b-long', source: 'source', target: 'target-b',
        style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 100 }] },
      },
      {
        id: 'c-long', source: 'source', target: 'target-c',
        style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 160, y: 0 }, { x: 160, y: -100 }] },
      },
    ] satisfies Edge[];

    const backbones = buildRenderSceneFromReactFlow(nodes, edges).edges
      .filter(edge => edge.id.includes('::shared-backbone:'));

    expect(backbones).toHaveLength(2);
    expect(backbones.map(backbone => backbone.points)).toEqual([
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 100, y: 0 }, { x: 160, y: 0 }],
    ]);
    expect(backbones.map(backbone => backbone.stroke)).toEqual(['#64748B', '#47CACC']);
  });

  it('renders source and target canonical roles independently on one bridge edge', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 200, y: 0 }, data: {} },
      { id: 'source-peer-target', position: { x: 60, y: -100 }, data: {} },
      { id: 'target-peer-source', position: { x: 140, y: 100 }, data: {} },
    ] satisfies Node[];
    const bridge = {
      id: 'bridge', source: 'source', target: 'target', label: 'Visible bridge branch',
      markerStart: { type: MarkerType.Arrow, color: '#2563EB' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563EB' },
      style: { stroke: '#2563EB', strokeWidth: 3 },
      data: { computedPath: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 140, y: 0 }, { x: 200, y: 0 }] },
    } satisfies Edge;
    const sourcePeer = {
      id: 'source-peer', source: 'source', target: 'source-peer-target',
      style: { stroke: '#2563EB', strokeWidth: 2 },
      data: { computedPath: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -100 }] },
    } satisfies Edge;
    const targetPeer = {
      id: 'target-peer', source: 'target-peer-source', target: 'target',
      style: { stroke: '#2563EB', strokeWidth: 2 },
      data: { computedPath: [{ x: 140, y: 100 }, { x: 140, y: 0 }, { x: 200, y: 0 }] },
    } satisfies Edge;

    const sceneEdges = buildRenderSceneFromReactFlow(nodes, [bridge, sourcePeer, targetPeer]).edges;

    expect(sceneEdges.filter(item => item.id.includes('::shared-backbone:')).map(item => item.points)).toEqual([
      [{ x: 0, y: 0 }, { x: 60, y: 0 }],
      [{ x: 140, y: 0 }, { x: 200, y: 0 }],
    ]);
    expect(sceneEdges.find(item => item.id === 'bridge')).toMatchObject({
      points: [{ x: 60, y: 0 }, { x: 140, y: 0 }],
      label: 'Visible bridge branch',
      markerStart: { kind: 'none' },
      markerEnd: { kind: 'none' },
    });
    expect(sceneEdges.find(item => item.id === 'bridge::shared-terminal-markers')).toMatchObject({
      stroke: 'transparent',
      label: '',
      markerOnly: true,
      markerStart: { kind: 'arrow', color: '#2563EB' },
      markerEnd: { kind: 'arrow', color: '#2563EB' },
    });
  });

  it('omits a fully shared dual-role member instead of placing its label on the backbone', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 120, y: 0 }, data: {} },
      { id: 'source-peer-target', position: { x: 60, y: -100 }, data: {} },
      { id: 'target-peer-source', position: { x: 60, y: 100 }, data: {} },
    ] satisfies Node[];
    const edge = {
      id: 'z-dual-role-member',
      source: 'source',
      target: 'target',
      label: 'Bridge label',
      markerStart: { type: MarkerType.Arrow, color: '#2563eb' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
      style: { stroke: '#2563eb', strokeWidth: 1.5 },
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 120, y: 0 }],
      },
    } satisfies Edge;
    const sourceOwner = {
      id: 'source-owner', source: 'source', target: 'source-peer-target',
      style: { stroke: '#2563eb', strokeWidth: 3 },
      data: { computedPath: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -100 }] },
    } satisfies Edge;
    const targetOwner = {
      id: 'target-owner', source: 'target-peer-source', target: 'target',
      style: { stroke: '#2563eb', strokeWidth: 3 },
      data: { computedPath: [{ x: 60, y: 100 }, { x: 60, y: 0 }, { x: 120, y: 0 }] },
    } satisfies Edge;

    const sceneEdges = buildRenderSceneFromReactFlow(nodes, [edge, sourceOwner, targetOwner]).edges;

    expect(sceneEdges.filter(item => item.id === edge.id)).toEqual([]);
    expect(sceneEdges.some(item => item.label === 'Bridge label')).toBe(false);
  });

  it('keeps an edge whole when shared-trunk metadata or path points are invalid', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 300, y: 0 }, data: {} },
    ] satisfies Node[];
    const edge = {
      id: 'invalid-shared-trunk',
      source: 'source',
      target: 'target',
      label: 'Fallback label',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
      data: {
        computedPath: Array.from({ length: 513 }, (_, index) => ({ x: index, y: 0 })),
        __vizlySharedTrunkPaint: {
          hiddenRanges: [{ from: 10, to: 20, role: 'source', ownerEdgeId: 'owner' }],
          memberships: [],
        },
      },
    } satisfies Edge;

    const scene = buildRenderSceneFromReactFlow(nodes, [edge]);

    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]).toMatchObject({ id: 'invalid-shared-trunk', label: 'Fallback label' });
    expect(scene.edges[0].markerEnd).toMatchObject({ kind: 'arrow', color: '#2563eb' });
    expect(scene.edges[0].points).toHaveLength(513);
  });

  it('fails closed to the full semantic edge when canonical paint metadata is invalid', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 160, y: 0 }, data: {} },
    ] satisfies Node[];
    const membership = {
      id: 'source:source:owner', role: 'source', endpointId: 'source', ownerEdgeId: 'owner',
      edgeIds: ['member', 'owner'], commonLength: 60,
    } as const;
    const edge = {
      id: 'member', source: 'source', target: 'target', label: 'Safe fallback',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563EB' },
      style: { stroke: '#2563EB', strokeWidth: 2 },
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 160, y: 0 }],
        __vizlySharedTrunkPaint: {
          hiddenRanges: [{ from: 0, to: 60, role: 'source', ownerEdgeId: 'owner' }],
          memberships: [membership],
          backboneRanges: [{
            from: 0,
            to: 60,
            role: 'source',
            ownerEdgeId: 'owner',
            membershipId: membership.id,
            paint: {
              token: 'semantic', stroke: 'url(javascript:alert(1))', strokeWidth: 2,
              strokeDasharray: '', opacity: 1, strokeLinecap: 'round', strokeLinejoin: 'round',
            },
          }],
        },
      },
    } satisfies Edge;

    const scene = buildRenderSceneFromReactFlow(nodes, [edge]);

    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]).toMatchObject({
      id: 'member',
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 160, y: 0 }],
      label: 'Safe fallback',
      markerEnd: { kind: 'arrow' },
    });
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

  it('resolves nested parent-relative snapshot positions for SVG scene parity', () => {
    const nodes: Node[] = [
      { id: 'domain', position: { x: 100, y: 200 }, data: {} },
      { id: 'lane', parentId: 'domain', position: { x: 20, y: 30 }, data: {} },
      { id: 'child', parentId: 'lane', position: { x: 5, y: 7 }, data: {} },
    ];

    const scene = buildRenderSceneFromReactFlowSnapshot({ nodes, edges: [] });

    expect(scene.nodes.find(node => node.id === 'domain')).toMatchObject({ x: 100, y: 200 });
    expect(scene.nodes.find(node => node.id === 'lane')).toMatchObject({ x: 120, y: 230 });
    expect(scene.nodes.find(node => node.id === 'child')).toMatchObject({ x: 125, y: 237 });
  });

  it('prefers measured absolute positions over parent-relative coordinates', () => {
    type AbsoluteNode = Node & { internals: { positionAbsolute: { x: number; y: number } } };
    const child: AbsoluteNode = {
      id: 'child',
      parentId: 'domain',
      position: { x: 5, y: 7 },
      internals: { positionAbsolute: { x: 405, y: 507 } },
      data: {},
    };
    const scene = buildRenderSceneFromReactFlowSnapshot({
      nodes: [
        { id: 'domain', position: { x: 100, y: 200 }, data: {} },
        child,
      ],
      edges: [],
    });

    expect(scene.nodes.find(node => node.id === 'child')).toMatchObject({ x: 405, y: 507 });
  });

  it('falls back to local positions for missing and cyclic parent chains', () => {
    const nodes: Node[] = [
      { id: 'orphan', parentId: 'missing', position: { x: 11, y: 12 }, data: {} },
      { id: 'cycle-a', parentId: 'cycle-b', position: { x: 21, y: 22 }, data: {} },
      { id: 'cycle-b', parentId: 'cycle-a', position: { x: 31, y: 32 }, data: {} },
    ];

    const scene = buildRenderSceneFromReactFlowSnapshot({ nodes, edges: [] });

    expect(scene.nodes.find(node => node.id === 'orphan')).toMatchObject({ x: 11, y: 12 });
    expect(scene.nodes.find(node => node.id === 'cycle-a')).toMatchObject({ x: 21, y: 22 });
    expect(scene.nodes.find(node => node.id === 'cycle-b')).toMatchObject({ x: 31, y: 32 });
  });

  it('keeps the production logistics children inside their exported domains', () => {
    const scene = buildRenderSceneFromReactFlowSnapshot({
      nodes: browserLogisticsNodes,
      edges: [],
    });
    const sceneNodes = new Map(scene.nodes.map(node => [node.id, node]));

    for (const sourceNode of browserLogisticsNodes) {
      if (!sourceNode.parentId) continue;
      const child = sceneNodes.get(sourceNode.id);
      const parent = sceneNodes.get(sourceNode.parentId);
      expect(child, sourceNode.id).toBeDefined();
      expect(parent, sourceNode.parentId).toBeDefined();
      if (!child || !parent) continue;
      expect(child.x, sourceNode.id).toBeGreaterThanOrEqual(parent.x);
      expect(child.y, sourceNode.id).toBeGreaterThanOrEqual(parent.y);
      expect(child.x + child.width, sourceNode.id).toBeLessThanOrEqual(parent.x + parent.width);
      expect(child.y + child.height, sourceNode.id).toBeLessThanOrEqual(parent.y + parent.height);
    }

    expect(sceneNodes.get('upstream')).toMatchObject({ x: 790.113, y: 106.5 });
    expect(sceneNodes.get('visibility')).toMatchObject({ x: 1286.338, y: 1540 });
  });
});
