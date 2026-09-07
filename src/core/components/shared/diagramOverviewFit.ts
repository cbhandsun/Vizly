import type { Edge, Node } from '@xyflow/react';
import { resolveDiagramFitLayout, type DiagramFitViewport, type DiagramFitViewportInput } from './diagramControlFit';
import { computeDiagramContentBounds, readDiagramRenderedLabels } from './diagramContentBounds';
import { computeDiagramLabelAwareFit, diagramBoundsAtLabelZoom } from './diagramLabelAwareFit';
import { resolveEdgeLabelScale } from '../../rendering/edgeLabelScale';

export const sameDiagramViewport = (first: DiagramFitViewport, second: DiagramFitViewport): boolean => (
  Math.abs(first.x - second.x) <= 0.5 && Math.abs(first.y - second.y) <= 0.5
  && Math.abs(first.zoom - second.zoom) <= 1e-9
);

/** All overview entry points measure the same visible content and final UI
 * clearances. The fallback size is for a Canvas whose element is not available. */
export const readDiagramOverviewFitInput = ({ container, nodes, edges, viewport, fallbackSize }: {
  container: HTMLElement | null;
  nodes: readonly Node[];
  edges: readonly Edge[];
  viewport: DiagramFitViewport;
  fallbackSize?: Readonly<{ width: number; height: number }>;
}): DiagramFitViewportInput | null => {
  const canvas = container?.querySelector<HTMLElement>('.react-flow') ?? container;
  const viewportElement = canvas?.querySelector<HTMLElement>('.react-flow__renderer') ?? canvas;
  const bounds = computeDiagramContentBounds(nodes, edges);
  const labelMeasurements = (canvas ? readDiagramRenderedLabels(canvas, viewport) : []).map(({ rect, readabilityScaled }) => {
    const scale = readabilityScaled ? resolveEdgeLabelScale(viewport.zoom) : 1;
    return { centerX: rect.x + rect.width / 2, centerY: rect.y + rect.height / 2,
      width: rect.width / scale, height: rect.height / scale, readabilityScaled };
  });
  const width = viewportElement?.clientWidth ?? fallbackSize?.width;
  const height = viewportElement?.clientHeight ?? fallbackSize?.height;
  if (!bounds || width === undefined || height === undefined || width <= 0 || height <= 0) return null;
  const root = container?.ownerDocument.documentElement ?? document.documentElement;
  const style = getComputedStyle(root);
  return { bounds, labelMeasurements, viewportWidth: width, viewportHeight: height, ...resolveDiagramFitLayout({
    viewportWidth: width, leftSidebarOffset: style.getPropertyValue('--left-sidebar-offset'),
    rightSidebarOffset: style.getPropertyValue('--right-sidebar-offset'),
  }) };
};

export const diagramOverviewContainsContent = (
  input: DiagramFitViewportInput,
  viewport: DiagramFitViewport,
): boolean => {
  const { safeArea } = input;
  const bounds = diagramBoundsAtLabelZoom(input, viewport.zoom);
  if (!bounds) return false;
  const padding = input.padding ?? 16;
  return bounds.minX * viewport.zoom + viewport.x >= safeArea.left + padding - 0.5
    && bounds.minY * viewport.zoom + viewport.y >= safeArea.top + padding - 0.5
    && (bounds.minX + bounds.width) * viewport.zoom + viewport.x <= input.viewportWidth - safeArea.right - padding + 0.5
    && (bounds.minY + bounds.height) * viewport.zoom + viewport.y <= input.viewportHeight - safeArea.bottom - padding + 0.5;
};

/** One measured correction after semantic labels adopt the target zoom.
 * No timer, repeated settle loop or reading-mode zoom floor participates. */
export const applyDiagramOverviewFit = async ({
  readFitInput, getViewport, setViewport, fallbackFit, syncSemanticViewport,
  waitForPaint, isCancelled, duration,
}: {
  readFitInput: () => DiagramFitViewportInput | null;
  getViewport: () => DiagramFitViewport;
  setViewport: (viewport: DiagramFitViewport, duration?: number) => Promise<boolean>;
  fallbackFit: () => Promise<boolean>;
  syncSemanticViewport?: (viewport: DiagramFitViewport) => void;
  waitForPaint: () => Promise<boolean>;
  isCancelled: () => boolean;
  duration?: number;
}): Promise<boolean> => {
  if (isCancelled()) return false;
  const input = readFitInput();
  const target = input ? computeDiagramLabelAwareFit(input) : null;
  if (target) syncSemanticViewport?.(target);
  const applied = target ? await setViewport(target, duration) : await fallbackFit();
  if (!applied || isCancelled()) return false;
  const appliedViewport = getViewport();
  syncSemanticViewport?.(appliedViewport);
  // Animated applications may finish after another gesture has already won.
  // Do not reinterpret that gesture as the initial fit's viewport.
  if (target && !sameDiagramViewport(target, appliedViewport)) return true;
  if (!await waitForPaint() || isCancelled()) return false;
  const current = getViewport();
  syncSemanticViewport?.(current);
  // A newer pan/zoom interaction owns the viewport after the first application.
  if (!sameDiagramViewport(appliedViewport, current)) return true;
  const measuredInput = readFitInput();
  if (!measuredInput || diagramOverviewContainsContent(measuredInput, current)) return true;
  const correction = computeDiagramLabelAwareFit(measuredInput);
  if (!correction || isCancelled()) return false;
  syncSemanticViewport?.(correction);
  if (!await setViewport(correction) || isCancelled()) return false;
  syncSemanticViewport?.(getViewport());
  const painted = await waitForPaint();
  if (painted && !isCancelled()) syncSemanticViewport?.(getViewport());
  return painted && !isCancelled();
};
