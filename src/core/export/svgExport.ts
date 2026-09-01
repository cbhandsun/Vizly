import type { DiagramRenderScene, RenderEdgeGeometry, RenderEdgeMarker, RenderNodeGeometry } from '../rendering/types';
import { resolveEdgeContrastPaint } from '../rendering/edgeContrastPaint';
import { getSvgMarkerId } from '../rendering/svgMarkerIds';
import { isSafeSvgPathData } from './svgPathSafety';
import { hasSafeSvgSceneGeometry } from './svgSceneGeometrySafety';

const MAX_SVG_CHARS = 5 * 1024 * 1024;
const MAX_SVG_SIDE = 50_000;
const MAX_EXPORT_NODES = 2_000;
const MAX_EXPORT_EDGES = 4_000;

export interface SvgExportOptions {
  title?: string;
  includeBackground?: boolean;
}

export type SvgExportErrorCode =
  | 'SVG_EXPORT_NODE_LIMIT'
  | 'SVG_EXPORT_EDGE_LIMIT'
  | 'SVG_EXPORT_DIMENSION_LIMIT'
  | 'SVG_EXPORT_OUTPUT_LIMIT'
  | 'SVG_EXPORT_INVALID_PATH'
  | 'SVG_EXPORT_INVALID_GEOMETRY';

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

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const markerKey = (marker: RenderEdgeMarker): string => `${marker.kind}:${marker.color}`;

const collectMarkers = (scene: DiagramRenderScene): RenderEdgeMarker[] => {
  const map = new Map<string, RenderEdgeMarker>();
  scene.edges.forEach(edge => {
    if (edge.markerStart.kind !== 'none') map.set(markerKey(edge.markerStart), edge.markerStart);
    if (edge.markerEnd.kind !== 'none') map.set(markerKey(edge.markerEnd), edge.markerEnd);
  });
  return [...map.values()];
};

const markerShape = (
  marker: RenderEdgeMarker,
  color: string,
  strokeWidth: number,
  isUnderlay = false,
): string => {
  const className = isUnderlay ? ' class="vizly-export-marker-contrast-underlay"' : '';
  if (marker.kind === 'openArrow') {
    return `<path${className} d="M 1 1 L 9 5 L 1 9" fill="none"${attr('stroke', color)}${attr('stroke-width', strokeWidth)} stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const outline = isUnderlay
    ? `${attr('stroke', color)}${attr('stroke-width', 2)} stroke-linejoin="round"`
    : '';
  if (marker.kind === 'diamond') {
    return `<path${className} d="M 1 5 L 5 1 L 9 5 L 5 9 Z"${attr('fill', color)}${outline}/>`;
  }
  if (marker.kind === 'circle') {
    return `<circle${className} cx="5" cy="5" r="3.5"${attr('fill', color)}${outline}/>`;
  }
  return `<path${className} d="M 0 0 L 10 5 L 0 10 Z"${attr('fill', color)}${outline}/>`;
};

const markerDef = (
  namespace: string,
  marker: RenderEdgeMarker,
  canvasBackground: string,
): string => {
  const id = getSvgMarkerId(namespace, marker);
  const semanticStrokeWidth = marker.kind === 'openArrow' ? 1.7 : 1;
  const decision = resolveEdgeContrastPaint({
    stroke: marker.color,
    strokeWidth: semanticStrokeWidth,
    canvasBackground,
  });
  const underlay = decision.kind === 'underlay'
    ? markerShape(marker, decision.underlayColor, decision.underlayStrokeWidth, true)
    : '';
  const semanticShape = markerShape(marker, marker.color, semanticStrokeWidth);
  const overflow = underlay ? ' overflow="visible"' : '';
  return `<marker${attr('id', id)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"${overflow}>${underlay}${semanticShape}</marker>`;
};

const polylineMidpoint = (points: readonly { x: number; y: number }[]): { x: number; y: number } => {
  const fallback = points[0] ?? { x: 0, y: 0 };
  const lengths = points.slice(1).map((point, index) => Math.hypot(
    point.x - points[index].x,
    point.y - points[index].y,
  ));
  const target = lengths.reduce((total, length) => total + length, 0) / 2;
  let travelled = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (travelled + length >= target && length > 0) {
      const ratio = (target - travelled) / length;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
      };
    }
    travelled += length;
  }
  return points.at(-1) ?? fallback;
};

const edgeToSvg = (
  edge: RenderEdgeGeometry,
  namespace: string,
  canvasBackground: string,
): string => {
  const markerStart = edge.markerStart.kind === 'none' ? '' : attr('marker-start', `url(#${getSvgMarkerId(namespace, edge.markerStart)})`);
  const markerEnd = edge.markerEnd.kind === 'none' ? '' : attr('marker-end', `url(#${getSvgMarkerId(namespace, edge.markerEnd)})`);
  const dash = edge.strokeDasharray ? attr('stroke-dasharray', edge.strokeDasharray) : '';
  const contrastDecision = resolveEdgeContrastPaint({
    stroke: edge.stroke,
    strokeWidth: edge.strokeWidth,
    canvasBackground,
    opacity: edge.markerOnly ? 1 : edge.opacity,
    ancestorOpacity: 1,
  });
  const contrastUnderlay = !edge.markerOnly && contrastDecision.kind === 'underlay'
    ? `<path class="vizly-export-edge-contrast-underlay"${attr('d', edge.path)} fill="none"${attr('stroke', contrastDecision.underlayColor)}${attr('stroke-width', contrastDecision.underlayStrokeWidth)} stroke-linecap="round" stroke-linejoin="round" opacity="1"${dash}/>`
    : '';
  const labelPoint = polylineMidpoint(edge.points);
  const labelLines = wrapText(edge.label, 28, 2);
  const labelWidth = labelLines.length ? clamp(Math.max(...labelLines.map(line => line.length)) * 7 + 16, 32, 220) : 0;
  const labelHeight = labelLines.length * 15 + 8;
  const label = edge.label
    ? `<g class="vizly-export-edge-label"><rect${attr('x', labelPoint.x - labelWidth / 2)}${attr('y', labelPoint.y - labelHeight / 2)}${attr('width', labelWidth)}${attr('height', labelHeight)} rx="4" fill="#ffffff"${attr('stroke', edge.stroke)} stroke-width="0.6" opacity="0.92"/>${textLinesToSvg(labelLines, labelPoint.x, labelPoint.y - ((labelLines.length - 1) * 15) / 2, 12, edge.stroke, undefined, 'middle')}</g>`
    : '';
  const markerCarrierAttr = edge.markerOnly
    ? attr('data-shared-trunk-marker-paint', 'owner-fallback')
    : '';
  return `<g${attr('data-edge-id', edge.id)}${markerCarrierAttr}>${contrastUnderlay}<path${attr('d', edge.path)} fill="none"${attr('stroke', edge.markerOnly ? 'transparent' : edge.stroke)}${attr('stroke-width', edge.strokeWidth)} stroke-linecap="round" stroke-linejoin="round"${attr('opacity', edge.markerOnly ? 1 : edge.opacity)}${dash}${markerStart}${markerEnd}/>${label}</g>`;
};

const splitLongToken = (token: string, maxChars: number): string[] => {
  if (token.length <= maxChars) return [token];
  const chunks: string[] = [];
  for (let index = 0; index < token.length; index += maxChars) {
    chunks.push(token.slice(index, index + maxChars));
  }
  return chunks;
};

const tokenizeText = (text: string): string[] => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const tokens = normalized.match(/[\u3400-\u9fff]|[^\s\u3400-\u9fff]+/gu);
  return tokens ?? [];
};

const wrapText = (text: string, maxChars: number, maxLines = 4): string[] => {
  if (!text) return [];
  const words = tokenizeText(text).flatMap(token => splitLongToken(token, maxChars));
  const lines: string[] = [];
  let current = '';
  words.forEach(word => {
    const separator = /[\u3400-\u9fff]/u.test(word) || /[\u3400-\u9fff]$/u.test(current) ? '' : ' ';
    const candidate = current ? `${current}${separator}${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) {
    const last = visible[visible.length - 1];
    visible[visible.length - 1] = last.length >= maxChars ? `${last.slice(0, Math.max(1, maxChars - 1))}...` : `${last}...`;
  }
  return visible;
};

const textLinesToSvg = (
  lines: readonly string[],
  x: number,
  centerY: number,
  fontSize: number,
  fill: string,
  fontWeight?: string,
  anchor: 'middle' | 'start' = 'middle',
  fontFamily = 'Inter, Arial, sans-serif',
): string => {
  if (lines.length === 0) return '';
  const lineHeight = Math.max(14, fontSize + 3);
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  return lines.map((line, index) => (
    `<text${attr('x', x)}${attr('y', startY + index * lineHeight)} text-anchor="${anchor}" dominant-baseline="central"${attr('font-family', fontFamily)}${attr('font-size', fontSize)}${fontWeight ? attr('font-weight', fontWeight) : ''}${attr('fill', fill)}>${escapeXml(line)}</text>`
  )).join('');
};

const structuredNodeTextToSvg = (node: RenderNodeGeometry): string => {
  const lines = node.contentLines ?? [];
  if (lines.length === 0) return '';
  const paddingX = node.paddingX ?? 16;
  const paddingTop = node.paddingTop ?? 16;
  const lineHeight = Math.max(16, node.fontSize * 1.4);
  const availableHeight = Math.max(lineHeight, node.height - 8);
  const visibleCount = Math.max(1, Math.min(lines.length, Math.floor(availableHeight / lineHeight)));
  const visible = lines.slice(0, visibleCount);
  const contentHeight = visible.length * lineHeight;
  const centeredTop = Math.max(4, (node.height - contentHeight) / 2);
  const startY = node.y + Math.min(paddingTop, centeredTop) + lineHeight / 2;
  const x = node.textAlign === 'middle' ? node.x + node.width / 2 : node.x + paddingX;
  const anchor = node.textAlign === 'middle' ? 'middle' : 'start';
  return visible.map((line, index) => (
    `<text${attr('x', x)}${attr('y', startY + index * lineHeight)} text-anchor="${anchor}" dominant-baseline="central"${attr('font-family', node.fontFamily ?? 'Inter, Arial, sans-serif')}${attr('font-size', node.fontSize)}${line.fontWeight ? attr('font-weight', line.fontWeight) : ''}${attr('fill', node.textColor)}>${escapeXml(line.text)}</text>`
  )).join('');
};

const nodeAccentToSvg = (node: RenderNodeGeometry): string => {
  if (!node.accent) return '';
  return node.accent.position === 'left'
    ? `<rect${attr('x', node.x)}${attr('y', node.y)}${attr('width', node.accent.size)}${attr('height', node.height)}${attr('fill', node.accent.color)}/>`
    : `<rect${attr('x', node.x)}${attr('y', node.y)}${attr('width', node.width)}${attr('height', node.accent.size)}${attr('fill', node.accent.color)}/>`;
};

const statusColor = (status: RenderNodeGeometry['status']): string | null => {
  if (status === 'success') return '#16a34a';
  if (status === 'warning') return '#f59e0b';
  if (status === 'error') return '#dc2626';
  if (status === 'normal') return '#64748b';
  return null;
};

const iconAbbreviation = (icon: string | undefined): string => {
  if (!icon) return '';
  const raw = icon.split(':').pop()?.split('/').pop() ?? icon;
  const words = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const text = words.length >= 2
    ? `${words[0][0] ?? ''}${words[1][0] ?? ''}`
    : (words[0] ?? raw).slice(0, 2);
  return text.toUpperCase();
};

const truncateText = (text: string, maxChars: number): string => (
  text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}...` : text
);

const nodeMetadataToSvg = (node: RenderNodeGeometry): string => {
  const status = statusColor(node.status);
  const statusDot = status
    ? `<circle${attr('cx', node.x + node.width - 12)}${attr('cy', node.y + 12)} r="4.5"${attr('fill', status)} stroke="#ffffff" stroke-width="1.5"/>`
    : '';
  const iconText = iconAbbreviation(node.icon);
  const icon = iconText
    ? `<g class="vizly-export-node-icon"><rect${attr('x', node.x + 10)}${attr('y', node.y + 10)} width="22" height="22" rx="6"${attr('fill', node.stroke)} opacity="0.12"/><text${attr('x', node.x + 21)}${attr('y', node.y + 21)} text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="700"${attr('fill', node.stroke)}>${escapeXml(iconText)}</text></g>`
    : '';
  return `${icon}${statusDot}`;
};

const databaseNodeToSvg = (node: RenderNodeGeometry, strokeDash: string): string => {
  const capHeight = clamp(Math.round(node.height * 0.16), 10, 24);
  const topY = node.y + capHeight / 2;
  const bottomY = node.y + node.height - capHeight / 2;
  const strokeWidth = node.strokeWidth ?? 1.2;
  return [
    `<path${attr('d', `M ${node.x} ${topY} C ${node.x} ${node.y - capHeight / 2} ${node.x + node.width} ${node.y - capHeight / 2} ${node.x + node.width} ${topY} V ${bottomY} C ${node.x + node.width} ${node.y + node.height + capHeight / 2} ${node.x} ${node.y + node.height + capHeight / 2} ${node.x} ${bottomY} Z`)}${attr('fill', node.fill)}${attr('stroke', node.stroke)}${attr('stroke-width', strokeWidth)}${strokeDash}/>`,
    `<ellipse${attr('cx', node.x + node.width / 2)}${attr('cy', topY)}${attr('rx', node.width / 2)}${attr('ry', capHeight / 2)}${attr('fill', node.fill)}${attr('stroke', node.stroke)}${attr('stroke-width', strokeWidth)}${strokeDash}/>`,
    `<path${attr('d', `M ${node.x} ${bottomY} C ${node.x} ${node.y + node.height + capHeight / 2} ${node.x + node.width} ${node.y + node.height + capHeight / 2} ${node.x + node.width} ${bottomY}`)} fill="none"${attr('stroke', node.stroke)}${attr('stroke-width', strokeWidth)} opacity="0.72"${strokeDash}/>`,
  ].join('');
};

const tableNodeToSvg = (node: RenderNodeGeometry, strokeDash: string): string => {
  const headerHeight = clamp(Math.round(node.height * 0.22), 28, 38);
  const rowHeight = 18;
  const visibleSlots = Math.max(1, Math.floor((node.height - headerHeight - 8) / rowHeight));
  const hasOverflow = (node.tableColumns?.length ?? 0) > visibleSlots;
  const visibleColumnCount = hasOverflow ? Math.max(0, visibleSlots - 1) : visibleSlots;
  const columns = (node.tableColumns ?? []).slice(0, visibleColumnCount);
  const remaining = Math.max(0, (node.tableColumns?.length ?? 0) - columns.length);
  const keyX = node.x + 12;
  const nameX = node.x + 38;
  const typeX = node.x + Math.max(104, node.width * 0.62);
  const header = [
    `<rect${attr('x', node.x)}${attr('y', node.y)}${attr('width', node.width)}${attr('height', node.height)} rx="6"${attr('fill', node.fill)}${attr('stroke', node.stroke)}${attr('stroke-width', node.strokeWidth ?? 1.2)}${strokeDash}/>`,
    `<path${attr('d', `M ${node.x} ${node.y + 6} Q ${node.x} ${node.y} ${node.x + 6} ${node.y} H ${node.x + node.width - 6} Q ${node.x + node.width} ${node.y} ${node.x + node.width} ${node.y + 6} V ${node.y + headerHeight} H ${node.x} Z`)}${attr('fill', node.stroke)}/>`,
    `<text${attr('x', node.x + 12)}${attr('y', node.y + headerHeight / 2)} text-anchor="start" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${escapeXml(truncateText(node.label, 28))}</text>`,
  ].join('');
  const rows = columns.map((column, index) => {
    const y = node.y + headerHeight + index * rowHeight;
    const key = column.isPrimary ? 'PK' : column.isForeign ? 'FK' : '';
    const keyFill = column.isPrimary ? '#f59e0b' : column.isForeign ? '#2563eb' : '#94a3b8';
    return [
      `<line${attr('x1', node.x)}${attr('y1', y)}${attr('x2', node.x + node.width)}${attr('y2', y)} stroke="#e5e7eb" stroke-width="0.7"/>`,
      key ? `<text${attr('x', keyX)}${attr('y', y + rowHeight / 2)} text-anchor="start" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="700"${attr('fill', keyFill)}>${key}</text>` : '',
      `<text${attr('x', nameX)}${attr('y', y + rowHeight / 2)} text-anchor="start" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="11"${attr('fill', node.textColor)}>${escapeXml(truncateText(column.name, 22))}</text>`,
      column.type ? `<text${attr('x', typeX)}${attr('y', y + rowHeight / 2)} text-anchor="start" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="10" fill="#64748b">${escapeXml(truncateText(column.type, 18))}</text>` : '',
    ].join('');
  }).join('');
  const more = remaining > 0
    ? `<text${attr('x', nameX)}${attr('y', node.y + headerHeight + columns.length * rowHeight + rowHeight / 2)} text-anchor="start" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="10" fill="#64748b">+${remaining} more</text>`
    : '';
  return `${header}${rows}${more}`;
};

const containerNodeChromeToSvg = (node: RenderNodeGeometry): string => {
  if (!node.container) return '';
  const headerHeight = node.container.headerHeight
    ?? (node.container.isLane ? 30 : node.container.isSwimlane ? 40 : 34);
  const headerFill = node.container.headerColor || (node.container.isSwimlane ? node.stroke : '#f8fafc');
  const titleFill = node.container.headerTextColor
    || (node.container.isSwimlane ? '#ffffff' : node.textColor);
  const headerOpacity = node.container.headerOpacity
    ?? (node.container.isSwimlane ? 0.95 : 0.72);
  const title = truncateText(node.label, Math.max(10, Math.floor(node.width / 9)));
  const titleX = node.x + 14;
  const titleY = node.y + headerHeight / 2;
  const childBadge = node.container.childCount > 0
    ? `<text${attr('x', node.x + node.width - 34)}${attr('y', titleY)} text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="700"${attr('fill', titleFill)}>${node.container.childCount}</text>`
    : '';
  const collapse = node.container.collapsed
    ? `<g class="vizly-export-collapse-badge"><rect${attr('x', node.x + node.width - 24)}${attr('y', node.y + 8)} width="16" height="16" rx="8" fill="#ffffff" opacity="0.92"/><text${attr('x', node.x + node.width - 16)}${attr('y', node.y + 16)} text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700"${attr('fill', node.stroke)}>+</text></g>`
    : '';
  return [
    `<rect${attr('x', node.x)}${attr('y', node.y)}${attr('width', node.width)}${attr('height', headerHeight)}${attr('fill', headerFill)}${attr('opacity', headerOpacity)}/>`,
    `<line${attr('x1', node.x)}${attr('y1', node.y + headerHeight)}${attr('x2', node.x + node.width)}${attr('y2', node.y + headerHeight)}${attr('stroke', node.stroke)} stroke-width="0.9" opacity="0.75"/>`,
    `<text${attr('x', titleX)}${attr('y', titleY)} text-anchor="start" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="${node.container.isSwimlane ? '13' : '12'}" font-weight="700"${attr('fill', titleFill)}>${escapeXml(title)}</text>`,
    childBadge,
    collapse,
  ].join('');
};

const swimlaneDividersToSvg = (node: RenderNodeGeometry): string => {
  const container = node.container;
  if (!container?.isSwimlane || container.laneCount <= 1) return '';
  const headerHeight = 40;
  const lines: string[] = [];
  for (let index = 1; index < container.laneCount; index += 1) {
    if (container.laneDirection === 'horizontal') {
      const y = node.y + headerHeight + ((node.height - headerHeight) * index) / container.laneCount;
      lines.push(`<line${attr('x1', node.x)}${attr('y1', y)}${attr('x2', node.x + node.width)}${attr('y2', y)}${attr('stroke', node.stroke)} stroke-width="0.8" stroke-dasharray="4 4" opacity="0.55"/>`);
    } else {
      const x = node.x + (node.width * index) / container.laneCount;
      lines.push(`<line${attr('x1', x)}${attr('y1', node.y + headerHeight)}${attr('x2', x)}${attr('y2', node.y + node.height)}${attr('stroke', node.stroke)} stroke-width="0.8" stroke-dasharray="4 4" opacity="0.55"/>`);
    }
  }
  return lines.join('');
};

const nodeToSvg = (node: RenderNodeGeometry): string => {
  const rx = Math.min(node.borderRadius, node.width / 2, node.height / 2);
  const horizontalPadding = clamp(Math.round(node.width * 0.08), 10, 24);
  const maxChars = Math.max(6, Math.floor((node.width - horizontalPadding * 2) / Math.max(6, node.fontSize * 0.58)));
  const maxLines = Math.max(1, Math.floor((node.height - 20) / Math.max(14, node.fontSize + 3)));
  const hasMetadata = !!(node.icon || node.status || node.subtitle);
  const titleCenterY = hasMetadata && node.shape !== 'group' ? node.y + node.height / 2 - (node.subtitle ? 9 : 3) : node.y + node.height / 2;
  const lines = wrapText(node.label, maxChars, Math.min(node.subtitle ? 3 : 5, maxLines));
  const subtitleLines = node.subtitle && node.shape !== 'group'
    ? wrapText(node.subtitle, Math.max(8, maxChars + 4), 2)
    : [];
  const text = node.contentLines?.length
    ? structuredNodeTextToSvg(node)
    : node.shape === 'group'
    ? textLinesToSvg(lines.slice(0, 1), node.x + horizontalPadding, node.y + 18, Math.max(11, node.fontSize - 1), node.textColor, node.fontWeight ?? '600', 'start')
    : `${textLinesToSvg(lines, node.x + node.width / 2, titleCenterY, node.fontSize, node.textColor, node.fontWeight)}${textLinesToSvg(subtitleLines, node.x + node.width / 2, titleCenterY + Math.max(18, node.fontSize + 8), Math.max(10, node.fontSize - 2), '#64748b')}`;
  const strokeDash = node.strokeDasharray ? attr('stroke-dasharray', node.strokeDasharray) : '';
  const strokeWidth = node.strokeWidth ?? 1.2;
  const shape = node.shape === 'ellipse'
    ? `<ellipse${attr('cx', node.x + node.width / 2)}${attr('cy', node.y + node.height / 2)}${attr('rx', node.width / 2)}${attr('ry', node.height / 2)}${attr('fill', node.fill)}${attr('stroke', node.stroke)}${attr('stroke-width', strokeWidth)}${strokeDash}/>`
    : node.shape === 'diamond'
      ? `<polygon${attr('points', `${node.x + node.width / 2},${node.y} ${node.x + node.width},${node.y + node.height / 2} ${node.x + node.width / 2},${node.y + node.height} ${node.x},${node.y + node.height / 2}`)}${attr('fill', node.fill)}${attr('stroke', node.stroke)}${attr('stroke-width', strokeWidth)}${strokeDash}/>`
      : node.shape === 'database'
        ? node.tableColumns?.length ? tableNodeToSvg(node, strokeDash) : databaseNodeToSvg(node, strokeDash)
      : node.shape === 'note'
        ? `<path${attr('d', `M ${node.x} ${node.y} H ${node.x + node.width - 16} L ${node.x + node.width} ${node.y + 16} V ${node.y + node.height} H ${node.x} Z`)}${attr('fill', node.fill)}${attr('stroke', node.stroke)}${attr('stroke-width', strokeWidth)}${strokeDash}/><path${attr('d', `M ${node.x + node.width - 16} ${node.y} V ${node.y + 16} H ${node.x + node.width} Z`)} fill="#ffffff"${attr('stroke', node.stroke)}${attr('stroke-width', strokeWidth)}/>`
        : `<rect${attr('x', node.x)}${attr('y', node.y)}${attr('width', node.width)}${attr('height', node.height)}${attr('rx', rx)}${attr('fill', node.fill)}${attr('stroke', node.stroke)}${attr('stroke-width', strokeWidth)}${strokeDash}/>`;
  const groupHeader = node.shape === 'group'
    ? `${containerNodeChromeToSvg(node)}${swimlaneDividersToSvg(node)}`
    : '';
  const contentText = node.tableColumns?.length || node.container ? '' : text;
  return `<g${attr('data-node-id', node.id)}${node.type ? attr('data-node-type', node.type) : ''}>${shape}${nodeAccentToSvg(node)}${groupHeader}${nodeMetadataToSvg(node)}${contentText}</g>`;
};

const assertExportableScene = (scene: DiagramRenderScene) => {
  if (scene.nodes.length > MAX_EXPORT_NODES) {
    throw new SvgExportError('SVG_EXPORT_NODE_LIMIT', 'SVG export node limit exceeded');
  }
  if (scene.edges.length > MAX_EXPORT_EDGES) {
    throw new SvgExportError('SVG_EXPORT_EDGE_LIMIT', 'SVG export edge limit exceeded');
  }
  if (!hasSafeSvgSceneGeometry(scene)) {
    throw new SvgExportError('SVG_EXPORT_INVALID_GEOMETRY', 'SVG export geometry is invalid');
  }
  if (scene.bounds.width > MAX_SVG_SIDE || scene.bounds.height > MAX_SVG_SIDE) {
    throw new SvgExportError('SVG_EXPORT_DIMENSION_LIMIT', 'SVG export dimensions exceed limit');
  }
  const invalidPath = scene.edges.find(edge => !isSafeSvgPathData(edge.path));
  if (invalidPath) {
    throw new SvgExportError('SVG_EXPORT_INVALID_PATH', 'SVG export edge path is invalid');
  }
};

export const exportRenderSceneToSvg = (scene: DiagramRenderScene, options: SvgExportOptions = {}): string => {
  assertExportableScene(scene);
  const namespace = `vizly-${options.title ?? 'diagram'}`;
  const contrastCanvasBackground = scene.theme.background.trim().toLowerCase() === 'transparent'
    ? '#ffffff'
    : scene.theme.background;
  const markers = collectMarkers(scene);
  const defs = markers.length
    ? `<defs>${markers.map(marker => markerDef(namespace, marker, contrastCanvasBackground)).join('')}</defs>`
    : '';
  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : '';
  const background = options.includeBackground === false
    ? ''
    : `<rect${attr('x', scene.bounds.minX)}${attr('y', scene.bounds.minY)}${attr('width', scene.bounds.width)}${attr('height', scene.bounds.height)}${attr('fill', scene.theme.background)}/>`;
  const edges = scene.edges.map(edge => edgeToSvg(edge, namespace, contrastCanvasBackground)).join('');
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
