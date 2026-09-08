import type { DiagramFitViewport, DiagramFitViewportInput } from './diagramControlFit';
import { computeDiagramLabelAwareFit, diagramBoundsAtLabelZoom } from './diagramLabelAwareFit';

type Occlusion = Readonly<{ x: number; y: number; width: number; height: number }>;
export type DiagramOverviewFitInput = DiagramFitViewportInput & { occlusion?: Occlusion };

const validOcclusion = (value: unknown): value is Occlusion => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rect = value as Record<string, unknown>;
  return [rect.x, rect.y, rect.width, rect.height].every(number =>
    typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= 10_000_000)
    && typeof rect.width === 'number' && rect.width > 0
    && typeof rect.height === 'number' && rect.height > 0;
};

/** The in-canvas anchor identifies this canvas's portaled overlay. Screen
 * coordinates are converted once; another canvas's minimap is not a blocker. */
export const readDiagramFitOcclusion = (canvas: HTMLElement, viewport: HTMLElement): Occlusion | undefined => {
  const id = canvas.querySelector<HTMLElement>('[data-diagram-fit-occluder]')?.dataset.diagramFitOccluder;
  if (!id) return undefined;
  const overlay = canvas.ownerDocument.getElementById(id);
  if (!overlay) return undefined;
  const style = canvas.ownerDocument.defaultView?.getComputedStyle(overlay);
  if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') return undefined;
  const rect = overlay.getBoundingClientRect(), origin = viewport.getBoundingClientRect();
  const result = { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
  return validOcclusion(result) ? result : undefined;
};

export const diagramViewportAvoidsOcclusion = (input: DiagramOverviewFitInput, viewport: DiagramFitViewport): boolean => {
  const rect = input.occlusion;
  if (rect === undefined) return true;
  if (!validOcclusion(rect)) return false;
  const bounds = diagramBoundsAtLabelZoom(input, viewport.zoom);
  if (!bounds) return false;
  const left = bounds.minX * viewport.zoom + viewport.x, top = bounds.minY * viewport.zoom + viewport.y;
  return left + bounds.width * viewport.zoom <= rect.x || left >= rect.x + rect.width
    || top + bounds.height * viewport.zoom <= rect.y || top >= rect.y + rect.height;
};

/** Keep an already-clear fit. Otherwise reuse the existing label-aware solver
 * in the four rectangles around the overlay and retain the largest readable
 * scale. This changes the viewport only, never graph or overlay positions. */
export const computeDiagramOcclusionAwareFit = (input: DiagramOverviewFitInput): DiagramFitViewport | null => {
  const initial = computeDiagramLabelAwareFit(input);
  if (!initial || input.occlusion === undefined) return initial;
  if (!validOcclusion(input.occlusion)) return null;
  if (diagramViewportAvoidsOcclusion(input, initial)) return initial;
  const { occlusion: rect, safeArea } = input;
  const areas = [
    { ...safeArea, left: Math.max(safeArea.left, rect.x + rect.width) },
    { ...safeArea, right: Math.max(safeArea.right, input.viewportWidth - rect.x) },
    { ...safeArea, top: Math.max(safeArea.top, rect.y + rect.height) },
    { ...safeArea, bottom: Math.max(safeArea.bottom, input.viewportHeight - rect.y) },
  ];
  let best: DiagramFitViewport | null = null;
  for (const area of areas) {
    const candidate = computeDiagramLabelAwareFit({ ...input, safeArea: area });
    if (candidate && diagramViewportAvoidsOcclusion(input, candidate)
      && (!best || candidate.zoom > best.zoom)) best = candidate;
  }
  return best;
};
