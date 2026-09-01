import { describe, expect, it } from 'vitest';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { buildRenderSceneFromReactFlow } from '../../rendering/reactFlowScene';
import {
  SvgExportError,
  exportRenderSceneToSvg,
  exportRenderSceneToSvgDataUrl,
} from '../../export/svgExport';
import { isSafeSvgPathData } from '../../export/svgPathSafety';
import { isSafeExportDataUrl } from '../../hooks/diagramExportActions';

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 }, data: { label: '<script>x</script>Alpha' } } as any,
  { id: 'b', position: { x: 180, y: 0 }, measured: { width: 100, height: 50 }, data: { label: 'Beta' } } as any,
];

const edges: Edge[] = [
  { id: 'e1', source: 'a', target: 'b', markerEnd: { type: 'arrowclosed', color: '#333' }, label: '<img onerror=x>Edge' } as any,
];

describe('svgExport', () => {
  it('exports a deterministic standalone SVG without HTML sinks', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges, { padding: 20 });
    const svg = exportRenderSceneToSvg(scene, { title: 'unit-test' });

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="-20 -20 320 90"');
    expect(svg).toContain('Alpha');
    expect(svg).toContain('Edge');
    expect(svg).not.toContain('onerror');
    expect(svg).not.toContain('foreignObject');
    expect(svg).not.toContain('react-flow__controls');
    expect(svg).not.toContain('<script>');
  });

  it('exports safe SVG data URLs', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges);
    const dataUrl = exportRenderSceneToSvgDataUrl(scene, { title: 'unit-test' });
    expect(isSafeExportDataUrl(dataUrl)).toBe(true);
  });

  it('omits the canvas background when transparent output is requested', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges, { padding: 20 });
    const opaqueSvg = exportRenderSceneToSvg(scene, { includeBackground: true });
    const transparentSvg = exportRenderSceneToSvg(scene, { includeBackground: false });
    const backgroundRect = `<rect x="${scene.bounds.minX}" y="${scene.bounds.minY}" width="${scene.bounds.width}" height="${scene.bounds.height}" fill="${scene.theme.background}"/>`;

    expect(opaqueSvg).toContain(backgroundRect);
    expect(transparentSvg).not.toContain(backgroundRect);
  });

  it('expands the export viewBox around routed edge points outside node bounds', () => {
    const routedEdges: Edge[] = [{
      ...edges[0],
      data: {
        computedPath: [
          { x: -120, y: 25 },
          { x: -120, y: 140 },
          { x: 400, y: 140 },
          { x: 400, y: 25 },
        ],
      },
    }];
    const scene = buildRenderSceneFromReactFlow(nodes, routedEdges, { padding: 20 });
    const svg = exportRenderSceneToSvg(scene);

    expect(scene.bounds).toEqual({
      minX: -140,
      minY: -20,
      maxX: 420,
      maxY: 160,
      width: 560,
      height: 180,
    });
    expect(svg).toContain('viewBox="-140 -20 560 180"');
  });

  it('rejects oversized scenes', () => {
    const scene = buildRenderSceneFromReactFlow([], []);
    scene.bounds.width = 60_000;
    expect(() => exportRenderSceneToSvg(scene)).toThrow(SvgExportError);
    expect(() => exportRenderSceneToSvg(scene)).toThrow('SVG export dimensions exceed limit');
    try {
      exportRenderSceneToSvg(scene);
    } catch (error) {
      expect(error).toMatchObject({ code: 'SVG_EXPORT_DIMENSION_LIMIT' });
    }
  });

  it('returns structured errors for export node, edge, and output limits', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges);
    const baseNode = scene.nodes[0];
    const baseEdge = scene.edges[0];

    const nodeLimitScene = { ...scene, nodes: Array.from({ length: 2_001 }, (_, index) => ({ ...baseNode, id: `n-${index}` })) };
    expect(() => exportRenderSceneToSvg(nodeLimitScene)).toThrow(
      expect.objectContaining({ code: 'SVG_EXPORT_NODE_LIMIT' }),
    );

    const edgeLimitScene = { ...scene, edges: Array.from({ length: 4_001 }, (_, index) => ({ ...baseEdge, id: `e-${index}` })) };
    expect(() => exportRenderSceneToSvg(edgeLimitScene)).toThrow(
      expect.objectContaining({ code: 'SVG_EXPORT_EDGE_LIMIT' }),
    );

    const outputLimitScene = {
      ...scene,
      nodes: Array.from({ length: 2_000 }, (_, index) => ({
        ...baseNode,
        id: `long-${index}-${'x'.repeat(3_000)}`,
      })),
    };
    expect(() => exportRenderSceneToSvg(outputLimitScene)).toThrow(
      expect.objectContaining({ code: 'SVG_EXPORT_OUTPUT_LIMIT' }),
    );
  });

  it('rejects invalid scene geometry when callers bypass the React Flow adapter', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges);

    expect(() => exportRenderSceneToSvg({
      ...scene,
      bounds: { ...scene.bounds, width: Number.NaN },
    })).toThrow(expect.objectContaining({ code: 'SVG_EXPORT_INVALID_GEOMETRY' }));

    expect(() => exportRenderSceneToSvg({
      ...scene,
      nodes: [{ ...scene.nodes[0], width: -1 }],
    })).toThrow(expect.objectContaining({ code: 'SVG_EXPORT_INVALID_GEOMETRY' }));

    expect(() => exportRenderSceneToSvg({
      ...scene,
      edges: [{ ...scene.edges[0], points: [{ x: Number.POSITIVE_INFINITY, y: 0 }] }],
    })).toThrow(expect.objectContaining({ code: 'SVG_EXPORT_INVALID_GEOMETRY' }));

    expect(() => exportRenderSceneToSvg({
      ...scene,
      edges: [{ ...scene.edges[0], opacity: 2 }],
    })).toThrow(expect.objectContaining({ code: 'SVG_EXPORT_INVALID_GEOMETRY' }));
  });

  it('renders safe SVG approximations for common node shapes', () => {
    const scene = buildRenderSceneFromReactFlow([
      { id: 'decision', position: { x: 0, y: 0 }, measured: { width: 100, height: 80 }, data: { label: 'Decide', shape: 'diamond' } } as any,
      { id: 'actor', type: 'ellipse', position: { x: 140, y: 0 }, measured: { width: 100, height: 80 }, data: { label: 'Actor' } } as any,
      { id: 'note', type: 'sticky-note', position: { x: 280, y: 0 }, measured: { width: 100, height: 80 }, data: { label: 'Note' } } as any,
      { id: 'group', type: 'subGroup', position: { x: 420, y: 0 }, measured: { width: 100, height: 80 }, data: { label: 'Group' } } as any,
      { id: 'db', position: { x: 560, y: 0 }, measured: { width: 100, height: 80 }, data: { label: 'DB', shape: 'database' } } as any,
    ], []);

    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('<polygon');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<path d="M 280 0 H 364 L 380 16');
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg).toContain('<line x1="420" y1="34" x2="520" y2="34"');
    expect(svg).toContain('<path d="M 560 6.5 C 560 -6.5 660 -6.5 660 6.5');
    expect(svg).toContain('<ellipse cx="610" cy="6.5" rx="50" ry="6.5"');
  });

  it('wraps CJK and long labels with deterministic native SVG text', () => {
    const scene = buildRenderSceneFromReactFlow([
      {
        id: 'cjk',
        position: { x: 0, y: 0 },
        measured: { width: 96, height: 72 },
        data: { label: '这是一个很长的中文节点名称用于导出换行' },
      } as any,
      {
        id: 'long-word',
        position: { x: 140, y: 0 },
        measured: { width: 96, height: 72 },
        data: { label: 'SupercalifragilisticexpialidociousExporterLabel' },
      } as any,
    ], []);

    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('<text x="48"');
    expect(svg).toContain('这是一个');
    expect(svg).toContain('Supercal');
    expect(svg).toContain('...');
    expect(svg).not.toContain('foreignObject');
  });

  it('preserves rendered custom-card style and structured HTML lines', () => {
    const scene = buildRenderSceneFromReactFlow([{
      id: 'styled-card',
      type: 'custom',
      position: { x: 10, y: 20 },
      measured: { width: 259, height: 118 },
      data: {
        label: '物流订单中心 (L-OMS)',
        description: '<b>物流订单中心 (L-OMS)</b><br/>• 接收上游订单/拆分物流单<br/>• 全链路状态追踪与预警',
        __vizlyExportStyle: {
          fill: 'rgb(247, 244, 243)',
          stroke: 'rgba(166, 126, 112, 0.55)',
          borderRadius: 8,
          textColor: 'rgb(42, 59, 76)',
          fontSize: 16,
          fontFamily: 'Arial, sans-serif',
          textAlign: 'left',
          paddingLeft: 16,
          paddingTop: 26,
          accent: { position: 'top', size: 3, color: 'rgba(161, 136, 127, 0.85)' },
        },
      },
    } as Node], []);
    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('fill="rgb(247, 244, 243)" stroke="rgba(166, 126, 112, 0.55)"');
    expect(svg).toContain('<rect x="10" y="20" width="259" height="3" fill="rgba(161, 136, 127, 0.85)"/>');
    expect(svg).toContain('<text x="26"');
    expect(svg).toContain('font-family="Arial, sans-serif" font-size="16" font-weight="700"');
    expect(svg.match(/物流订单中心 \(L-OMS\)/gu)).toHaveLength(1);
    expect(svg).toContain('• 接收上游订单/拆分物流单');
    expect(svg).toContain('• 全链路状态追踪与预警');
    expect(svg).not.toContain('text-anchor="middle"');
  });

  it('renders edge labels with a readable SVG label background', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges);
    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('class="vizly-export-edge-label"');
    expect(svg).toContain('<rect x=');
    expect(svg).toContain('opacity="0.92"');
  });

  it('paints container backgrounds below edges and foreground nodes', () => {
    const scene = buildRenderSceneFromReactFlow([
      {
        id: 'container',
        type: 'titleGroup',
        position: { x: 0, y: 0 },
        measured: { width: 360, height: 220 },
        data: { label: 'Domain', themeColor: '#2563eb' },
      } as Node,
      {
        id: 'source',
        position: { x: 40, y: 80 },
        measured: { width: 100, height: 50 },
        data: { label: 'Source' },
      } as Node,
      {
        id: 'target',
        position: { x: 220, y: 80 },
        measured: { width: 100, height: 50 },
        data: { label: 'Target' },
      } as Node,
    ], [{
      id: 'route',
      source: 'source',
      target: 'target',
      label: 'Visible route',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
    }]);
    const svg = exportRenderSceneToSvg(scene);

    const containerLayer = svg.indexOf('vizly-export-container-nodes');
    const edgeLayer = svg.indexOf('class="vizly-export-edges"');
    const foregroundLayer = svg.indexOf('vizly-export-foreground-nodes');
    expect(containerLayer).toBeGreaterThan(-1);
    expect(containerLayer).toBeLessThan(edgeLayer);
    expect(edgeLayer).toBeLessThan(foregroundLayer);
    expect(svg.slice(containerLayer, edgeLayer)).toContain('data-node-id="container"');
    expect(svg.slice(edgeLayer, foregroundLayer)).toContain('data-edge-id="route"');
    expect(svg.slice(foregroundLayer)).toContain('data-node-id="source"');
    expect(svg.slice(foregroundLayer)).toContain('data-node-id="target"');
  });

  it('exports a complete semantic edge when an orphan render-only plan is injected', () => {
    const sharedNodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 240, y: 0 }, data: {} },
    ] satisfies Node[];
    const sharedEdges = [{
      id: 'member',
      source: 'source',
      target: 'target',
      label: 'One label',
      markerStart: { type: MarkerType.Arrow, color: '#2563eb' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
      style: { stroke: '#2563eb' },
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 160, y: 0 }],
        __vizlySharedTrunkPaint: {
          hiddenRanges: [{ from: 50, to: 110, role: 'source', ownerEdgeId: 'owner' }],
          memberships: [{
            id: 'source:source:owner',
            role: 'source',
            endpointId: 'source',
            ownerEdgeId: 'owner',
            edgeIds: ['member', 'owner'],
            commonLength: 60,
          }],
          backboneRanges: [],
        },
      },
    }] satisfies Edge[];

    const svg = exportRenderSceneToSvg(buildRenderSceneFromReactFlow(sharedNodes, sharedEdges));

    expect(svg).toContain('<path d="M 0 0 L 80 0 L 160 0"');
    expect(svg).not.toContain('<path d="M 0 0 L 50 0"');
    expect(svg).not.toContain('<path d="M 110 0 L 160 0"');
    expect(svg.match(/marker-start=/gu)).toHaveLength(1);
    expect(svg.match(/marker-end=/gu)).toHaveLength(1);
    expect(svg.match(/class="vizly-export-edge-label"/gu)).toHaveLength(1);
    expect(svg.match(/One label/gu)).toHaveLength(1);
    expect(svg).toContain('<text x="80" y="0"');
  });

  it('exports one markerless neutral backbone for mixed semantic branches', () => {
    const sharedNodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target-a', position: { x: 100, y: -100 }, data: {} },
      { id: 'target-b', position: { x: 100, y: 100 }, data: {} },
    ] satisfies Node[];
    const sharedEdges = [
      {
        id: 'a-primary', source: 'source', target: 'target-a', label: 'Primary',
        style: { stroke: '#FF5722', strokeWidth: 3 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#FF5722' },
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }] },
      },
      {
        id: 'b-trace', source: 'source', target: 'target-b', label: 'Trace',
        style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#47CACC' },
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] },
      },
    ] satisfies Edge[];

    const svg = exportRenderSceneToSvg(buildRenderSceneFromReactFlow(sharedNodes, sharedEdges));
    const backboneGroup = svg.match(
      /<g data-edge-id="a-primary::shared-backbone:0">[\s\S]*?<\/g>/u,
    )?.[0] ?? '';
    const junctionGroup = svg.match(
      /<g data-edge-id="a-primary::shared-junction:0">[\s\S]*?<\/g>/u,
    )?.[0] ?? '';

    expect(backboneGroup).toContain('d="M 0 0 L 100 0"');
    expect(backboneGroup).toContain('stroke="#64748B"');
    expect(backboneGroup).toContain('stroke-width="3"');
    expect(backboneGroup).not.toContain('marker-start=');
    expect(backboneGroup).not.toContain('marker-end=');
    expect(backboneGroup).not.toContain('vizly-export-edge-label');
    expect(junctionGroup).toContain('d="M 99.99 0 L 100.01 0"');
    expect(junctionGroup).toContain('stroke="#64748B"');
    expect(junctionGroup).toContain('stroke-width="5"');
    expect(junctionGroup).not.toContain('marker-start=');
    expect(junctionGroup).not.toContain('marker-end=');
    expect(junctionGroup).not.toContain('vizly-export-edge-label');
    expect(svg.match(/marker-end=/gu)).toHaveLength(2);
    expect(svg.match(/class="vizly-export-edge-label"/gu)).toHaveLength(2);
  });

  it('exports one owner marker-only carrier for a three-member target backbone', () => {
    const sharedNodes = [
      { id: 'source-a', position: { x: 0, y: -100 }, data: {} },
      { id: 'source-b', position: { x: 100, y: -100 }, data: {} },
      { id: 'source-c', position: { x: 100, y: 100 }, data: {} },
      { id: 'target', position: { x: 200, y: 0 }, data: {} },
    ] satisfies Node[];
    const semanticStyle = { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' } as const;
    const targetMarker = { type: MarkerType.ArrowClosed, color: '#47CACC' } as const;
    const sharedEdges = [
      {
        id: 'a-source', source: 'source-a', target: 'target', style: semanticStyle, markerEnd: targetMarker,
        data: { computedPath: [{ x: 0, y: -100 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }] },
      },
      {
        id: 'b-source', source: 'source-b', target: 'target', style: semanticStyle, markerEnd: targetMarker,
        data: { computedPath: [{ x: 100, y: -100 }, { x: 100, y: 0 }, { x: 200, y: 0 }] },
      },
      {
        id: 'c-source', source: 'source-c', target: 'target', style: semanticStyle, markerEnd: targetMarker,
        data: { computedPath: [{ x: 100, y: 100 }, { x: 100, y: 0 }, { x: 200, y: 0 }] },
      },
    ] satisfies Edge[];

    const scene = buildRenderSceneFromReactFlow(sharedNodes, sharedEdges);
    const carriers = scene.edges.filter(edge => edge.markerOnly);
    const backbones = scene.edges.filter(edge => edge.id.includes('::shared-backbone:'));
    const svg = exportRenderSceneToSvg(scene);

    expect(backbones).toHaveLength(1);
    expect(backbones[0].markerEnd.kind).toBe('none');
    expect(carriers).toHaveLength(1);
    expect(carriers[0]).toMatchObject({
      id: 'a-source::shared-terminal-markers',
      stroke: 'transparent',
      label: '',
      markerStart: { kind: 'none' },
      markerEnd: { kind: 'arrow', color: '#47CACC' },
    });
    expect(scene.edges.filter(edge => !edge.markerOnly && edge.markerEnd.kind !== 'none')).toEqual([]);
    expect(svg.match(/data-shared-trunk-marker-paint="owner-fallback"/gu)).toHaveLength(1);
    expect(svg.match(/marker-end="url\(#/gu)).toHaveLength(1);
    expect(svg.match(/stroke="transparent"/gu)).toHaveLength(1);
  });

  it('omits a fully hidden dual-role member label instead of placing it on the SVG backbone', () => {
    const sharedNodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 120, y: 0 }, data: {} },
      { id: 'source-peer-target', position: { x: 60, y: -100 }, data: {} },
      { id: 'target-peer-source', position: { x: 60, y: 100 }, data: {} },
    ] satisfies Node[];
    const sharedEdge = {
      id: 'z-dual-role-member',
      source: 'source',
      target: 'target',
      label: 'Bridge label',
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

    const svg = exportRenderSceneToSvg(buildRenderSceneFromReactFlow(
      sharedNodes,
      [sharedEdge, sourceOwner, targetOwner],
    ));

    expect(svg).not.toContain('data-edge-id="z-dual-role-member"');
    expect(svg).not.toContain('Bridge label');
  });

  it('rejects externally injected edge path data before rendering', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges);
    const unsafeScene = {
      ...scene,
      edges: [
        {
          ...scene.edges[0],
          path: 'M 0 0 L 10 10" onload="alert(1)',
        },
      ],
    };

    expect(isSafeSvgPathData(scene.edges[0].path)).toBe(true);
    expect(isSafeSvgPathData(unsafeScene.edges[0].path)).toBe(false);
    expect(() => exportRenderSceneToSvg(unsafeScene)).toThrow(
      expect.objectContaining({ code: 'SVG_EXPORT_INVALID_PATH' }),
    );
  });

  it('fully tokenizes SVG path data instead of accepting ignored punctuation', () => {
    expect(isSafeSvgPathData('M0-10 L20.5,30 z')).toBe(true);
    expect(isSafeSvgPathData('M 0 0 C 10 10 20 10 30 0')).toBe(true);

    expect(isSafeSvgPathData('M 0 0 .')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 -')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 10..20')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 L 10 10 QDROP')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 L 10 10;')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 L 10 10 url(#x)')).toBe(false);
  });

  it('requires complete SVG path command arity', () => {
    expect(isSafeSvgPathData('M 0 0 L 10 10 L 20 0 Z')).toBe(true);
    expect(isSafeSvgPathData('M 0 0 C 10 10 20 10 30 0 S 40 -10 50 0')).toBe(true);
    expect(isSafeSvgPathData('M 0 0 A 10 10 0 0 1 20 20')).toBe(true);

    expect(isSafeSvgPathData('L 10 10')).toBe(false);
    expect(isSafeSvgPathData('M 0')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 L 10')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 C 10 10 20 10')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 A 10 10 0 0 1 20')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 Z 10')).toBe(false);
  });

  it('renders safe node metadata as native SVG badges', () => {
    const scene = buildRenderSceneFromReactFlow([
      {
        id: 'arch',
        position: { x: 0, y: 0 },
        measured: { width: 170, height: 96 },
        style: { borderColor: '#2563eb', color: '#111827' },
        data: {
          label: 'API Gateway',
          description: 'Public ingress',
          icon: 'mdi:api',
          status: 'error',
        },
      } as any,
    ], []);

    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('class="vizly-export-node-icon"');
    expect(svg).toContain('>AP</text>');
    expect(svg).toContain('fill="#dc2626"');
    expect(svg).toContain('Public ingress');
    expect(svg).not.toContain('href=');
    expect(svg).not.toContain('foreignObject');
  });

  it('renders ER table columns as native SVG rows', () => {
    const scene = buildRenderSceneFromReactFlow([
      {
        id: 'orders',
        type: 'ERDatabaseNode',
        position: { x: 0, y: 0 },
        measured: { width: 220, height: 128 },
        style: { borderColor: '#10b981' },
        data: {
          tableName: 'orders',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true },
            { name: 'customer_id', type: 'uuid', isForeign: true },
            { name: 'total_amount', type: 'decimal(12,2)' },
            { name: 'created_at', type: 'timestamp' },
            { name: '<script>x</script>internal_note', type: '<b>text</b>' },
            { name: 'updated_at', type: 'timestamp' },
          ],
        },
      } as any,
    ], []);

    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('data-node-type="ERDatabaseNode"');
    expect(svg).toContain('fill="#10b981"');
    expect(svg).toContain('>orders</text>');
    expect(svg).toContain('>PK</text>');
    expect(svg).toContain('>FK</text>');
    expect(svg).toContain('customer_id');
    expect(svg).toContain('decimal(12,2)');
    expect(svg).toContain('+2 more');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('foreignObject');
  });

  it('renders container headers, collapse badges, and swimlane dividers', () => {
    const scene = buildRenderSceneFromReactFlow([
      {
        id: 'domain',
        type: 'titleGroup',
        position: { x: 0, y: 0 },
        measured: { width: 280, height: 180 },
        data: {
          label: 'Domain',
          collapsed: true,
          childCount: 4,
          themeColor: '#2563eb',
        },
      } as any,
      {
        id: 'swim',
        type: 'swimlane',
        position: { x: 320, y: 0 },
        measured: { width: 300, height: 180 },
        data: {
          label: 'Fulfillment',
          laneCount: 3,
          direction: 'vertical',
          themeColor: '#0f766e',
        },
      } as any,
    ], []);

    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('data-node-type="titleGroup"');
    expect(svg).toContain('fill="#2563eb"');
    expect(svg).toContain('class="vizly-export-collapse-badge"');
    expect(svg).toContain('>Domain</text>');
    expect(svg).toContain('>4</text>');
    expect(svg).toContain('data-node-type="swimlane"');
    expect(svg).toContain('fill="#0f766e"');
    expect(svg).toContain('>Fulfillment</text>');
    expect(svg).toContain('stroke-dasharray="4 4"');
    expect(svg).not.toContain('foreignObject');
  });

  it('preserves captured container header paint, text, height, opacity and solid border', () => {
    const scene = buildRenderSceneFromReactFlow([{
      id: 'domain',
      type: 'titleGroup',
      position: { x: 0, y: 0 },
      measured: { width: 280, height: 180 },
      data: {
        label: 'Domain',
        __vizlyExportStyle: {
          fill: 'rgb(255, 255, 255)',
          stroke: 'rgb(133, 164, 192)',
          strokeWidth: 1,
          strokeDasharray: '',
          textColor: 'rgb(31, 41, 55)',
          headerFill: 'rgb(147, 169, 189)',
          headerTextColor: 'rgb(31, 41, 55)',
          headerHeight: 50,
          headerOpacity: 1,
          headerFontSize: 16,
          headerFontWeight: 700,
          headerTextTransform: 'uppercase',
        },
      },
    } as Node], []);
    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('<rect x="0" y="0" width="280" height="180" rx="10" fill="rgb(255, 255, 255)" stroke="rgb(133, 164, 192)" stroke-width="1"/>');
    expect(svg).toContain('<rect x="0" y="0" width="280" height="50" fill="rgb(147, 169, 189)" opacity="1"/>');
    expect(svg).toContain('y="25" text-anchor="start"');
    expect(svg).toContain('font-size="16" font-weight="700" fill="rgb(31, 41, 55)">DOMAIN</text>');
  });
});
