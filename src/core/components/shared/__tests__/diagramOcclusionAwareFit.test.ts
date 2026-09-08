// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { computeDiagramOcclusionAwareFit, type DiagramOverviewFitInput } from '../diagramOcclusionAwareFit';
import { computeDiagramLabelAwareFit, diagramBoundsAtLabelZoom } from '../diagramLabelAwareFit';
import { applyDiagramOverviewFit, diagramOverviewContainsContent } from '../diagramOverviewFit';

const scene = (): DiagramOverviewFitInput => ({
  bounds: { minX: -100, minY: 50, width: 3000, height: 1200 },
  viewportWidth: 1200, viewportHeight: 800, padding: 8,
  safeArea: { left: 76, right: 60, top: 84, bottom: 64 },
});

describe('overview fitting around a floating control', () => {
  it('preserves the existing fit when there is no obstruction', () => {
    const input = scene();
    const expected = computeDiagramLabelAwareFit(input);
    expect(computeDiagramOcclusionAwareFit(input)).toEqual(expected);
    input.occlusion = { x: -500, y: -500, width: 40, height: 40 };
    expect(computeDiagramOcclusionAwareFit(input)).toEqual(expected);
  });

  it.each([
    { x: 24, y: 500, width: 240, height: 180 },
    { x: 900, y: 250, width: 240, height: 180 },
    { x: 450, y: 130, width: 240, height: 180 },
    { x: 450, y: 550, width: 240, height: 180 },
    { x: 450, y: 300, width: 240, height: 180 },
  ])('keeps all content outside a moved overlay at $x, $y', occlusion => {
    const input = { ...scene(), occlusion };
    const original = structuredClone(input);
    const result = computeDiagramOcclusionAwareFit(input);
    expect(result).not.toBeNull();
    if (!result) throw Error('expected fit');
    const bounds = diagramBoundsAtLabelZoom(input, result.zoom);
    if (!bounds) throw Error('expected bounds');
    const left = bounds.minX * result.zoom + result.x, top = bounds.minY * result.zoom + result.y;
    expect(left >= occlusion.x + occlusion.width || left + bounds.width * result.zoom <= occlusion.x
      || top >= occlusion.y + occlusion.height || top + bounds.height * result.zoom <= occlusion.y).toBe(true);
    expect(diagramOverviewContainsContent(input, result)).toBe(true);
    expect(result.zoom).toBeGreaterThan(0);
    expect(input).toEqual(original);
  });

  it('retains readable target-scale labels when choosing an unobstructed fit', () => {
    const input = { ...scene(), occlusion: { x: 24, y: 500, width: 240, height: 180 },
      labelMeasurements: [{ centerX: 1600, centerY: 1000, width: 800, height: 80, readabilityScaled: true }] };
    const result = computeDiagramOcclusionAwareFit(input);
    expect(result && diagramOverviewContainsContent(input, result)).toBe(true);
  });

  it.each([null, 'invalid', { x: NaN, y: 1, width: 40, height: 40 },
    { x: 1, y: Infinity, width: 40, height: 40 }, { x: 0, y: 0, width: 0, height: 40 },
    { x: 0, y: 0, width: -1, height: 40 }, { x: 0, y: 0, width: 10_000_001, height: 40 },
    { x: '<script>', y: 0, width: 40, height: 40 },
  ])('rejects malformed or unbounded overlay geometry %j', occlusion => {
    expect(computeDiagramOcclusionAwareFit(Object.assign(scene(), { occlusion }))).toBeNull();
  });

  it('does not apply an occluded fallback when the overlay covers the available canvas', async () => {
    const input = { ...scene(), occlusion: { x: 0, y: 0, width: 1200, height: 800 } };
    expect(computeDiagramOcclusionAwareFit(input)).toBeNull();
    const setViewport = vi.fn(), fallbackFit = vi.fn();
    expect(await applyDiagramOverviewFit({ readFitInput: () => input,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }), setViewport, fallbackFit,
      waitForPaint: async () => true, isCancelled: () => false,
    })).toBe(false);
    expect(setViewport).not.toHaveBeenCalled();
    expect(fallbackFit).not.toHaveBeenCalled();
  });
});
