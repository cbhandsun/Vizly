import type { DiagramRenderScene, RenderEdgeGeometry, RenderEdgeMarker, RenderNodeGeometry } from '../rendering/types';
import { getSvgMarkerId } from '../rendering/svgMarkerIds';

const MAX_SVG_CHARS = 5 * 1024 * 1024;
const MAX_SVG_SIDE = 50_000;
const MAX_EXPORT_NODES = 2_000;
const MAX_EXPORT_EDGES = 4_000;

export interface SvgExportOptions {
  title?: string;
}

export type SvgExportErrorCode =
  | 'SVG_EXPORT_NODE_LIMIT'
  | 'SVG_EXPORT_EDGE_LIMIT'
  | 'SVG_EXPORT_DIMENSION_LIMIT'
  | 'SVG_EXPORT_OUTPUT_LIMIT';

export class SvgExportError extends Error {
  readonly code: SvgExportErrorCode;

  constructor(code: SvgExportErrorCode, message: string) {
    super(message);
    this.name = 'SvgExportError';
    this.code = code;
  }
}

const escapeXml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const attr = (name: string, value: unknown): string => ` ${name}="${escapeXml(value)}"`;

const markerKey = (marker: RenderEdgeMarker): string => `${marker.kind}:${marker.color}`;

const collectMarkers = (scene: DiagramRenderScene): RenderEdgeMarker[] => {
  const map = new Map<string, RenderEdgeMarker>();
  scene.edges.forEach(edge => {
    if (edge.markerStart.kind !== 'none') map.set(markerKey(edge.markerStart), edge.markerStart);
    if (edge.markerEnd.kind !== 'none') map.set(markerKey(edge.markerEnd), edge.markerEnd);
  });
  return [...map.values()];
};

const markerDef = (namespace: string, marker: RenderEdgeMarker): string => {
  const id = getSvgMarkerId(namespace, marker);
  const base = `<marker${attr('id', id)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`;
  const body = marker.kind === 'openArrow'
    ? `<path d="M 1 1 L 9 5 L 1 9" fill="none"${attr('stroke', marker.color)} stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`
    : marker.kind === 'diamond'
      ? `<path d="M 1 5 L 5 1 L 9 5 L 5 9 Z"${attr('fill', marker.color)}/>`
      : marker.kind === 'circle'
        ? `<circle cx="5" cy="5" r="3.5"${attr('fill', marker.color)}/>`
        : `<path d="M 0 0 L 10 5 L 0 10 Z"${attr('fill', marker.color)}/>`;
  return `${base}${body}</marker>`;
};

const edgeToSvg = (edge: RenderEdgeGeometry, namespace: string): string => {
  const markerStart = edge.markerStart.kind === 'none' ? '' : attr('marker-start', `url(#${getSvgMarkerId(namespace, edge.markerStart)})`);
  const markerEnd = edge.markerEnd.kind === 'none' ? '' : attr('marker-end', `url(#${getSvgMarkerId(namespace, edge.markerEnd)})`);
  const dash = edge.strokeDasharray ? attr('stroke-dasharray', edge.strokeDasharray) : '';
  const label = edge.label
    ? `<text${attr('x', edge.points[Math.floor(edge.points.length / 2)]?.x ?? 0)}${attr('y', edge.points[Math.floor(edge.points.length / 2)]?.y ?? 0)} text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="12"${attr('fill', edge.stroke)}>${escapeXml(edge.label)}</text>`
    : '';
  return `<g${attr('data-edge-id', edge.id)}><path${attr('d', edge.path)} fill="none"${attr('stroke', edge.stroke)}${attr('stroke-width', edge.strokeWidth)} stroke-linecap="round" stroke-linejoin="round"${attr('opacity', edge.opacity)}${dash}${markerStart}${markerEnd}/>${label}</g>`;
};

const wrapText = (text: string, maxChars: number): string[] => {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, 4);
};

const nodeToSvg = (node: RenderNodeGeometry): string => {
  const rx = Math.min(node.borderRadius, node.width / 2, node.height / 2);
  const lines = wrapText(node.label, Math.max(8, Math.floor(node.width / 9)));
  const startY = node.y + node.height / 2 - ((lines.length - 1) * 16) / 2;
  const text = lines.map((line, index) => (
    `<text${attr('x', node.x + node.width / 2)}${attr('y', startY + index * Math.max(14, node.fontSize + 3))} text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, sans-serif"${attr('font-size', node.fontSize)}${node.fontWeight ? attr('font-weight', node.fontWeight) : ''}${attr('fill', node.textColor)}>${escapeXml(line)}</text>`
  )).join('');
  const strokeDash = node.strokeDasharray ? attr('stroke-dasharray', node.strokeDasharray) : '';
  const shape = node.shape === 'ellipse'
    ? `<ellipse${attr('cx', node.x + node.width / 2)}${attr('cy', node.y + node.height / 2)}${attr('rx', node.width / 2)}${attr('ry', node.height / 2)}${attr('fill', node.fill)}${attr('stroke', node.stroke)} stroke-width="1.2"${strokeDash}/>`
    : node.shape === 'diamond'
      ? `<polygon${attr('points', `${node.x + node.width / 2},${node.y} ${node.x + node.width},${node.y + node.height / 2} ${node.x + node.width / 2},${node.y + node.height} ${node.x},${node.y + node.height / 2}`)}${attr('fill', node.fill)}${attr('stroke', node.stroke)} stroke-width="1.2"${strokeDash}/>`
      : node.shape === 'note'
        ? `<path${attr('d', `M ${node.x} ${node.y} H ${node.x + node.width - 16} L ${node.x + node.width} ${node.y + 16} V ${node.y + node.height} H ${node.x} Z M ${node.x + node.width - 16} ${node.y} V ${node.y + 16} H ${node.x + node.width}`)}${attr('fill', node.fill)}${attr('stroke', node.stroke)} stroke-width="1.2"${strokeDash}/>`
        : `<rect${attr('x', node.x)}${attr('y', node.y)}${attr('width', node.width)}${attr('height', node.height)}${attr('rx', rx)}${attr('fill', node.fill)}${attr('stroke', node.stroke)} stroke-width="1.2"${strokeDash}/>`;
  return `<g${attr('data-node-id', node.id)}${node.type ? attr('data-node-type', node.type) : ''}>${shape}${text}</g>`;
};

const assertExportableScene = (scene: DiagramRenderScene) => {
  if (scene.nodes.length > MAX_EXPORT_NODES) {
    throw new SvgExportError('SVG_EXPORT_NODE_LIMIT', 'SVG export node limit exceeded');
  }
  if (scene.edges.length > MAX_EXPORT_EDGES) {
    throw new SvgExportError('SVG_EXPORT_EDGE_LIMIT', 'SVG export edge limit exceeded');
  }
  if (scene.bounds.width > MAX_SVG_SIDE || scene.bounds.height > MAX_SVG_SIDE) {
    throw new SvgExportError('SVG_EXPORT_DIMENSION_LIMIT', 'SVG export dimensions exceed limit');
  }
};

export const exportRenderSceneToSvg = (scene: DiagramRenderScene, options: SvgExportOptions = {}): string => {
  assertExportableScene(scene);
  const namespace = `vizly-${options.title ?? 'diagram'}`;
  const markers = collectMarkers(scene);
  const defs = markers.length ? `<defs>${markers.map(marker => markerDef(namespace, marker)).join('')}</defs>` : '';
  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : '';
  const background = `<rect${attr('x', scene.bounds.minX)}${attr('y', scene.bounds.minY)}${attr('width', scene.bounds.width)}${attr('height', scene.bounds.height)}${attr('fill', scene.theme.background)}/>`;
  const edges = scene.edges.map(edge => edgeToSvg(edge, namespace)).join('');
  const nodes = scene.nodes.map(nodeToSvg).join('');
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg"${attr('width', scene.bounds.width)}${attr('height', scene.bounds.height)}${attr('viewBox', `${scene.bounds.minX} ${scene.bounds.minY} ${scene.bounds.width} ${scene.bounds.height}`)} role="img">`,
    title,
    defs,
    background,
    `<g class="vizly-export-edges">${edges}</g>`,
    `<g class="vizly-export-nodes">${nodes}</g>`,
    '</svg>',
  ].join('');
  if (svg.length > MAX_SVG_CHARS) {
    throw new SvgExportError('SVG_EXPORT_OUTPUT_LIMIT', 'SVG export output exceeds size limit');
  }
  return svg;
};

export const exportRenderSceneToSvgDataUrl = (scene: DiagramRenderScene, options: SvgExportOptions = {}): string => (
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportRenderSceneToSvg(scene, options))}`
);
