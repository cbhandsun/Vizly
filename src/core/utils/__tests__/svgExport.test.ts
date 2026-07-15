import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
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

  it('renders edge labels with a readable SVG label background', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges);
    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('class="vizly-export-edge-label"');
    expect(svg).toContain('<rect x=');
    expect(svg).toContain('opacity="0.92"');
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
});
