import type { Node } from '@xyflow/react';

import type { ReactFlowRenderSnapshot } from './reactFlowScene';
import { parseRenderedLinearGradient } from './renderLinearGradient';

const EXPORT_STYLE_KEY = '__vizlyExportStyle';
const MAX_FONT_FAMILY_CHARS = 200;

const finiteCssPixel = (value: string): number | undefined => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000) return undefined;
  const nearestInteger = Math.round(parsed);
  return Math.abs(parsed - nearestInteger) < 0.05
    ? nearestInteger
    : Math.round(parsed * 100) / 100;
};

const exportBorderWidth = (value: string): number | undefined => {
  const width = finiteCssPixel(value);
  return width !== undefined && width > 0 && width < 1 ? 1 : width;
};

const firstComputedPaint = (style: CSSStyleDeclaration): string => {
  if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
    return style.backgroundColor;
  }
  return style.backgroundImage.match(/(?:rgba?|hsla?)\([\d\s.,%+-]+\)|#[\da-f]{3,8}/i)?.[0] ?? '';
};

const boundedFontFamily = (value: string): string | undefined => {
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_FONT_FAMILY_CHARS ? normalized : undefined;
};

const captureSurfaceStyle = (surface: HTMLElement): Record<string, unknown> => {
  const surfaceStyle = window.getComputedStyle(surface);
  const body = surface.querySelector<HTMLElement>('[data-vizly-export-node-body="true"]');
  const bodyStyle = body ? window.getComputedStyle(body) : surfaceStyle;
  const header = surface.querySelector<HTMLElement>('[data-vizly-export-node-header="true"]');
  const headerStyle = header ? window.getComputedStyle(header) : null;
  const content = surface.querySelector<HTMLElement>('[data-vizly-export-node-content="true"]');
  const contentStyle = content ? window.getComputedStyle(content) : surfaceStyle;
  const accent = surface.querySelector<HTMLElement>('[data-vizly-export-node-accent="true"]');
  const accentStyle = accent ? window.getComputedStyle(accent) : null;
  const accentWidth = accentStyle ? finiteCssPixel(accentStyle.width) : undefined;
  const accentHeight = accentStyle ? finiteCssPixel(accentStyle.height) : undefined;
  const accentPosition = accentWidth !== undefined && accentHeight !== undefined && accentWidth < accentHeight
    ? 'left'
    : 'top';
  const accentSize = accentPosition === 'left' ? accentWidth : accentHeight;

  return {
    fill: firstComputedPaint(bodyStyle) || firstComputedPaint(surfaceStyle),
    stroke: surfaceStyle.borderColor,
    strokeWidth: exportBorderWidth(surfaceStyle.borderTopWidth),
    strokeDasharray: surfaceStyle.borderTopStyle === 'dashed' ? '6 4' : '',
    borderRadius: finiteCssPixel(
      surface.style.borderTopLeftRadius
      || surface.style.borderRadius
      || surfaceStyle.borderTopLeftRadius
      || surfaceStyle.borderRadius,
    ),
    shadow: surfaceStyle.boxShadow.match(/rgba?\([^)]+\)/i)?.[0],
    textColor: contentStyle.color,
    fontSize: finiteCssPixel(contentStyle.fontSize),
    fontWeight: contentStyle.fontWeight,
    fontFamily: boundedFontFamily(contentStyle.fontFamily),
    textAlign: contentStyle.textAlign,
    paddingLeft: finiteCssPixel(surfaceStyle.paddingLeft),
    paddingTop: finiteCssPixel(surfaceStyle.paddingTop),
    headerFill: headerStyle
      ? firstComputedPaint(headerStyle) || firstComputedPaint(bodyStyle) || firstComputedPaint(surfaceStyle)
      : undefined,
    headerGradient: headerStyle
      ? parseRenderedLinearGradient(headerStyle.backgroundImage)
      : undefined,
    headerTextColor: headerStyle?.color,
    headerHeight: headerStyle ? finiteCssPixel(headerStyle.height) : undefined,
    headerOpacity: headerStyle ? 1 : undefined,
    headerFontSize: headerStyle ? finiteCssPixel(headerStyle.fontSize) : undefined,
    headerFontWeight: headerStyle?.fontWeight,
    headerTextTransform: headerStyle?.textTransform,
    accent: accentStyle && accentSize !== undefined
      ? { position: accentPosition, size: accentSize, color: firstComputedPaint(accentStyle) }
      : undefined,
  };
};

const renderedStyleByNodeId = (root: ParentNode): Map<string, Record<string, unknown>> => {
  const result = new Map<string, Record<string, unknown>>();
  root.querySelectorAll<HTMLElement>('[data-vizly-export-node-id]').forEach(surface => {
    const id = surface.dataset.vizlyExportNodeId?.trim();
    if (id && !result.has(id)) result.set(id, captureSurfaceStyle(surface));
  });
  return result;
};

export const enrichSnapshotWithRenderedNodeStyles = (
  snapshot: ReactFlowRenderSnapshot,
  root: ParentNode | undefined = typeof document === 'undefined' ? undefined : document,
): ReactFlowRenderSnapshot => {
  if (!root || typeof window === 'undefined') return snapshot;
  const styles = renderedStyleByNodeId(root);
  if (styles.size === 0) return snapshot;
  return {
    ...snapshot,
    nodes: snapshot.nodes.map(node => {
      const exportStyle = styles.get(node.id);
      if (!exportStyle) return node;
      const data = node.data && typeof node.data === 'object' ? node.data : {};
      return { ...node, data: { ...data, [EXPORT_STYLE_KEY]: exportStyle } } as Node;
    }),
  };
};
