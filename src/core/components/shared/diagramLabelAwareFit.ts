import { resolveEdgeLabelScale } from '../../rendering/edgeLabelScale';
import { computeDiagramFitViewport, type DiagramFitViewportInput } from './diagramControlFit';

export const diagramBoundsAtLabelZoom = (
  input: DiagramFitViewportInput,
  zoom: number,
): DiagramFitViewportInput['bounds'] | null => {
  const labels = input.labelMeasurements === undefined ? [] : input.labelMeasurements;
  if (!Array.isArray(labels) || labels.length > 10_000) return null;
  let { minX, minY } = input.bounds;
  let maxX = minX + input.bounds.width;
  let maxY = minY + input.bounds.height;
  for (const label of labels) {
    if (!label || ![label.centerX, label.centerY, label.width, label.height].every(value => (
      Number.isFinite(value) && Math.abs(value) <= 1_000_000_000
    )) || label.width <= 0 || label.height <= 0 || typeof label.readabilityScaled !== 'boolean') return null;
    const scale = label.readabilityScaled ? resolveEdgeLabelScale(zoom) : 1;
    const halfWidth = label.width * scale / 2;
    const halfHeight = label.height * scale / 2;
    minX = Math.min(minX, label.centerX - halfWidth);
    minY = Math.min(minY, label.centerY - halfHeight);
    maxX = Math.max(maxX, label.centerX + halfWidth);
    maxY = Math.max(maxY, label.centerY + halfHeight);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
};

/** Solve against target label dimensions without additional DOM reads or paint
 * retries. Screen extents grow monotonically with zoom, including the plateau
 * where readability scaling keeps text at a constant screen size. */
export const computeDiagramLabelAwareFit = (input: DiagramFitViewportInput) => {
  const initial = computeDiagramFitViewport(input);
  if (!initial || input.labelMeasurements === undefined) return initial;
  if (!Array.isArray(input.labelMeasurements)) return null;
  if (input.labelMeasurements.length === 0) return initial;
  const fitAt = (zoom: number) => {
    const bounds = diagramBoundsAtLabelZoom(input, zoom);
    return bounds ? computeDiagramFitViewport({ ...input, bounds }) : null;
  };
  const first = fitAt(initial.zoom);
  if (!first) return null;
  if (first.zoom >= initial.zoom) return first;
  let lower = 0;
  let upper = initial.zoom;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (lower + upper) / 2;
    const fit = fitAt(middle);
    if (!fit) return null;
    if (fit.zoom >= middle) lower = middle;
    else upper = middle;
  }
  return fitAt(lower);
};
