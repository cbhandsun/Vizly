import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { buildSvgPreviewModel } from '../../export/svgPreviewModel';
import { buildRenderSceneFromReactFlow } from '../../rendering/reactFlowScene';
import { isSafeExportDataUrl } from '../../hooks/diagramExportActions';

const nodes: Node[] = [
  {
    id: 'a',
    position: { x: 0, y: 0 },
    measured: { width: 300, height: 120 },
    data: { label: '<script>alert(1)</script>Start' },
  } as any,
  {
    id: 'b',
    position: { x: 900, y: 0 },
    measured: { width: 300, height: 120 },
    data: { label: 'End' },
  } as any,
];

const edges: Edge[] = [
  {
    id: 'a-b',
    source: 'a',
    target: 'b',
    label: '<img src=x onerror=alert(1)>safe label',
    markerEnd: { type: 'arrowclosed', color: '#111827' },
  } as any,
];

describe('svgPreviewModel', () => {
  it('builds safe preview metadata from a render scene', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges, { padding: 20 });
    const preview = buildSvgPreviewModel(scene, { title: 'preview', maxPreviewSide: 600 });

    expect(preview.width).toBe(1240);
    expect(preview.height).toBe(160);
    expect(preview.previewWidth).toBe(600);
    expect(preview.previewHeight).toBe(77);
    expect(preview.scale).toBeCloseTo(600 / 1240, 5);
    expect(preview.nodeCount).toBe(2);
    expect(preview.edgeCount).toBe(1);
    expect(preview.byteLength).toBeGreaterThan(100);
    expect(preview.viewBox).toBe('-20 -20 1240 160');
    expect(isSafeExportDataUrl(preview.dataUrl)).toBe(true);
    expect(preview.svg).toContain('Start');
    expect(preview.svg).toContain('safe label');
    expect(preview.svg).not.toContain('<script>');
    expect(preview.svg).not.toContain('onerror');
    expect(preview.svg).not.toContain('foreignObject');
  });

  it('keeps small previews at natural size', () => {
    const scene = buildRenderSceneFromReactFlow([
      { id: 'tiny', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: { label: 'Tiny' } } as any,
    ], [], { padding: 10 });

    const preview = buildSvgPreviewModel(scene, { maxPreviewSide: 600 });

    expect(preview.previewWidth).toBe(100);
    expect(preview.previewHeight).toBe(60);
    expect(preview.scale).toBe(1);
  });

  it('normalizes invalid preview max side values', () => {
    const scene = buildRenderSceneFromReactFlow(nodes, edges, { padding: 20 });

    const preview = buildSvgPreviewModel(scene, { maxPreviewSide: Number.NaN });

    expect(preview.previewWidth).toBe(720);
    expect(preview.previewHeight).toBe(93);
  });
});
