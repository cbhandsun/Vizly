import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { buildRenderSceneFromReactFlow } from '../../rendering/reactFlowScene';
import { SvgExportError, exportRenderSceneToSvg, exportRenderSceneToSvgDataUrl } from '../../export/svgExport';
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
        id: `long-${index}`,
        label: 'x'.repeat(3_000),
      })),
    };
    expect(() => exportRenderSceneToSvg(outputLimitScene)).toThrow(
      expect.objectContaining({ code: 'SVG_EXPORT_OUTPUT_LIMIT' }),
    );
  });

  it('renders safe SVG approximations for common node shapes', () => {
    const scene = buildRenderSceneFromReactFlow([
      { id: 'decision', position: { x: 0, y: 0 }, measured: { width: 100, height: 80 }, data: { label: 'Decide', shape: 'diamond' } } as any,
      { id: 'actor', type: 'ellipse', position: { x: 140, y: 0 }, measured: { width: 100, height: 80 }, data: { label: 'Actor' } } as any,
      { id: 'note', type: 'sticky-note', position: { x: 280, y: 0 }, measured: { width: 100, height: 80 }, data: { label: 'Note' } } as any,
      { id: 'group', type: 'subGroup', position: { x: 420, y: 0 }, measured: { width: 100, height: 80 }, data: { label: 'Group' } } as any,
    ], []);

    const svg = exportRenderSceneToSvg(scene);

    expect(svg).toContain('<polygon');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<path d="M 280 0 H 364 L 380 16');
    expect(svg).toContain('stroke-dasharray="6 4"');
  });
});
