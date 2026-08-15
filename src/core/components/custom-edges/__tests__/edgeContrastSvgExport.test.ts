import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { exportRenderSceneToSvg } from '../../../export/svgExport';
import { buildRenderSceneFromReactFlow } from '../../../rendering/reactFlowScene';
import type { DiagramRenderScene } from '../../../rendering/types';

const singleEdgeScene = (
  stroke: string,
  background: string,
  withMarker = true,
): DiagramRenderScene => ({
  nodes: [],
  edges: [{
    id: 'edge-one',
    sourceId: 'source',
    targetId: 'target',
    sourceHandle: 'right',
    targetHandle: 'left',
    points: [{ x: 0, y: 20 }, { x: 100, y: 20 }],
    path: 'M 0 20 L 100 20',
    label: '',
    stroke,
    strokeWidth: 2,
    strokeDasharray: '6 4',
    opacity: 1,
    markerStart: { kind: 'none', color: stroke },
    markerEnd: withMarker ? { kind: 'arrow', color: stroke } : { kind: 'none', color: stroke },
    zIndex: 0,
  }],
  bounds: { minX: 0, minY: 0, maxX: 120, maxY: 40, width: 120, height: 40 },
  viewport: { x: 0, y: 0, zoom: 1 },
  theme: {
    background,
    nodeFill: '#ffffff',
    nodeStroke: '#334155',
    textColor: '#111827',
    edgeStroke: stroke,
  },
  warnings: [],
});

const occurrenceCount = (source: string, token: string): number => source.split(token).length - 1;

describe('SVG edge contrast paint', () => {
  it('retains the deterministic crossing bridge used by stable canvas edges', () => {
    const nodes = [
      { id: 'left', position: { x: 0, y: 0 }, data: {} },
      { id: 'right', position: { x: 160, y: 0 }, data: {} },
      { id: 'top', position: { x: 80, y: -40 }, data: {} },
      { id: 'bottom', position: { x: 80, y: 100 }, data: {} },
    ] satisfies Node[];
    const edges = [
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
    ] satisfies Edge[];

    const svg = exportRenderSceneToSvg(buildRenderSceneFromReactFlow(nodes, edges));

    expect(svg).toContain('A 6 6');
    expect(svg.match(/A 6 6/gu)).toHaveLength(1);
  });

  it('writes a marker-free neutral underlay before a cyan semantic foreground', () => {
    const svg = exportRenderSceneToSvg(singleEdgeScene('#47CACC', '#ffffff'), {
      title: 'cyan-export',
    });
    const underlay = svg.match(/<path class="vizly-export-edge-contrast-underlay"[^>]*\/>/u)?.[0] ?? '';
    const underlayIndex = svg.indexOf(underlay);
    const semanticIndex = svg.indexOf('stroke="#47CACC"', underlayIndex + underlay.length);

    expect(underlay).toContain('stroke="#334155"');
    expect(underlay).toContain('stroke-width="4"');
    expect(underlay).toContain('stroke-dasharray="6 4"');
    expect(underlay).not.toContain('marker-start');
    expect(underlay).not.toContain('marker-end');
    expect(semanticIndex).toBeGreaterThan(underlayIndex);
    expect(svg).toContain('class="vizly-export-marker-contrast-underlay"');
    expect(svg.indexOf('fill="#47CACC"')).toBeGreaterThan(
      svg.indexOf('class="vizly-export-marker-contrast-underlay"'),
    );
    expect(svg).toContain('marker-end="url(#');
  });

  it('does not decorate sufficient orange or cyan on a dark canvas', () => {
    const orangeSvg = exportRenderSceneToSvg(singleEdgeScene('#FF5722', '#ffffff'));
    const darkCanvasSvg = exportRenderSceneToSvg(singleEdgeScene('#47CACC', '#141414'));

    [orangeSvg, darkCanvasSvg].forEach(svg => {
      expect(svg).not.toContain('vizly-export-edge-contrast-underlay');
      expect(svg).not.toContain('vizly-export-marker-contrast-underlay');
    });
  });

  it('uses the safe default canvas for a deliberately transparent export', () => {
    const svg = exportRenderSceneToSvg(singleEdgeScene('#47CACC', 'transparent', false), {
      includeBackground: false,
    });

    expect(svg).toContain('vizly-export-edge-contrast-underlay');
    expect(svg).not.toContain('<rect');
  });

  it('matches canvas opacity composition while keeping the contrast boundary fully opaque', () => {
    const scene = singleEdgeScene('#FF5722', '#ffffff', false);
    scene.edges[0].opacity = 0.5;
    const svg = exportRenderSceneToSvg(scene);
    const underlay = svg.match(/<path class="vizly-export-edge-contrast-underlay"[^>]*\/>/u)?.[0] ?? '';
    const foreground = svg.match(/<path d="M 0 20 L 100 20"[^>]*stroke="#FF5722"[^>]*\/>/u)?.[0] ?? '';

    expect(underlay).toContain('opacity="1"');
    expect(foreground).toContain('opacity="0.5"');
  });

  it('adds one underlay per visible shared-trunk fragment without repainting the hidden trunk', () => {
    const nodes = [
      { id: 'owner-source', position: { x: 0, y: 0 }, data: {} },
      { id: 'member-source', position: { x: 50, y: 80 }, data: {} },
      { id: 'target', position: { x: 100, y: 0 }, data: {} },
    ] satisfies Node[];
    const edges = [
      {
        id: 'a-owner',
        source: 'owner-source',
        target: 'target',
        type: 'stablePath',
        style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#47CACC' },
        data: { computedPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }] },
      },
      {
        id: 'b-member',
        source: 'member-source',
        target: 'target',
        type: 'stablePath',
        style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#47CACC' },
        data: { computedPath: [{ x: 50, y: 80 }, { x: 50, y: 0 }, { x: 100, y: 0 }] },
      },
    ] satisfies Edge[];
    const scene = buildRenderSceneFromReactFlow(nodes, edges, {
      theme: { background: '#ffffff' },
    });
    const svg = exportRenderSceneToSvg(scene);

    expect(scene.edges).toHaveLength(5);
    expect(occurrenceCount(svg, 'class="vizly-export-edge-contrast-underlay"')).toBe(4);
    expect(occurrenceCount(svg, 'd="M 49.99 0 L 50.01 0"')).toBe(2);
    expect(scene.edges.find(edge => edge.id === 'a-owner::shared-junction:0')).toMatchObject({
      stroke: '#47CACC',
      strokeWidth: 5,
      label: '',
      markerStart: { kind: 'none' },
      markerEnd: { kind: 'none' },
    });
    expect(occurrenceCount(svg, 'd="M 50 0 L 100 0"')).toBe(2);
    expect(occurrenceCount(svg, 'd="M 50 80 L 50 0"')).toBe(2);
    expect(occurrenceCount(svg, 'd="M 0 0 L 50 0"')).toBe(2);
    expect(occurrenceCount(svg, 'd="M 0 0 L 50 0 L 100 0"')).toBe(1);
    expect(occurrenceCount(svg, 'marker-end="url(#')).toBe(1);
    expect(occurrenceCount(svg, 'data-shared-trunk-marker-paint="owner-fallback"')).toBe(1);
    const markerCarrier = scene.edges.find(edge => edge.markerOnly);
    expect(markerCarrier?.opacity).toBe(1);
    const carrierGroup = svg.match(
      /<g[^>]*data-shared-trunk-marker-paint="owner-fallback"[^>]*>([\s\S]*?)<\/g>/u,
    )?.[0] ?? '';
    expect(carrierGroup).toContain('stroke="transparent"');
    expect(carrierGroup).toContain('opacity="1"');
    expect(carrierGroup).not.toContain('vizly-export-edge-contrast-underlay');
  });
});
