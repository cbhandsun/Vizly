import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { exportRenderSceneToSvg } from '../../export/svgExport';
import { buildSvgPreviewModel } from '../../export/svgPreviewModel';
import { buildRenderSceneFromReactFlow } from '../../rendering/reactFlowScene';

const fixtureNodes: Node[] = [
  {
    id: 'container',
    type: 'swimlane',
    position: { x: -40, y: -40 },
    measured: { width: 560, height: 260 },
    data: {
      label: 'Fulfillment Domain',
      laneCount: 2,
      direction: 'vertical',
      themeColor: '#0f766e',
      childCount: 3,
    },
  } as any,
  {
    id: 'api',
    type: 'custom',
    position: { x: 20, y: 40 },
    measured: { width: 160, height: 84 },
    style: { borderColor: '#2563eb' },
    data: {
      label: 'API Gateway',
      description: 'Public ingress',
      icon: 'mdi:api',
      status: 'warning',
    },
  } as any,
  {
    id: 'orders',
    type: 'ERDatabaseNode',
    position: { x: 300, y: 40 },
    measured: { width: 180, height: 126 },
    style: { borderColor: '#10b981' },
    data: {
      tableName: 'orders',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true },
        { name: 'customer_id', type: 'uuid', isForeign: true },
        { name: '<script>x</script>total_amount', type: 'decimal' },
        { name: 'created_at', type: 'timestamp' },
      ],
    },
  } as any,
  {
    id: 'decision',
    type: 'diamond',
    position: { x: 160, y: 172 },
    measured: { width: 96, height: 76 },
    data: { label: 'Valid?' },
  } as any,
];

const fixtureEdges: Edge[] = [
  {
    id: 'api-orders',
    source: 'api',
    target: 'orders',
    markerEnd: { type: 'arrowclosed', color: '#2563eb' },
    label: 'write <img onerror=x> order',
    style: { stroke: '#2563eb', strokeWidth: 2 },
  } as any,
  {
    id: 'orders-decision',
    source: 'orders',
    target: 'decision',
    markerEnd: { type: 'openArrow', color: '#10b981' },
    label: 'validate',
    style: { stroke: '#10b981', strokeDasharray: '6 4' },
  } as any,
];

describe('svg visual fixture', () => {
  it('keeps the mixed SVG export fixture deterministic and safe', () => {
    const scene = buildRenderSceneFromReactFlow(fixtureNodes, fixtureEdges, { padding: 24 });
    const svg = exportRenderSceneToSvg(scene, { title: 'mixed-fixture' });

    expect(svg).toMatchSnapshot();
    expect(svg.indexOf('vizly-export-container-nodes')).toBeLessThan(svg.indexOf('class="vizly-export-edges"'));
    expect(svg.indexOf('class="vizly-export-edges"')).toBeLessThan(svg.indexOf('vizly-export-foreground-nodes'));
    expect(svg).toContain('data-node-type="swimlane"');
    expect(svg).toContain('data-node-type="ERDatabaseNode"');
    expect(svg).toContain('class="vizly-export-node-icon"');
    expect(svg).toContain('class="vizly-export-edge-label"');
    expect(svg).toContain('marker-end="url(#vizly-mixed-fixture-arrow-2563eb)"');
    expect(svg).toContain('marker-end="url(#vizly-mixed-fixture-openArrow-10b981)"');
    expect(svg).toContain('stroke-dasharray="4 4"');
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg).toContain('>PK</text>');
    expect(svg).toContain('>FK</text>');
    expect(svg).toContain('Public ingress');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('onerror');
    expect(svg).not.toContain('foreignObject');
  });

  it('uses the same fixture as safe preview metadata', () => {
    const scene = buildRenderSceneFromReactFlow(fixtureNodes, fixtureEdges, { padding: 24 });
    const preview = buildSvgPreviewModel(scene, { title: 'mixed-fixture-preview', maxPreviewSide: 360 });

    expect(preview.nodeCount).toBe(4);
    expect(preview.edgeCount).toBe(2);
    expect(preview.previewWidth).toBe(360);
    expect(preview.previewHeight).toBe(199);
    expect(preview.dataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(preview.dataUrl)).not.toContain('onerror');
  });
});
