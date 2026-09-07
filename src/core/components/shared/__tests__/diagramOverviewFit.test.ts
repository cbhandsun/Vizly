// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { applyDiagramOverviewFit, diagramOverviewContainsContent } from '../diagramOverviewFit';
import type { DiagramFitViewport, DiagramFitViewportInput } from '../diagramControlFit';
import { computeDiagramLabelAwareFit } from '../diagramLabelAwareFit';

const input = (width = 4000): DiagramFitViewportInput => ({
  bounds: { minX: 0, minY: 0, width, height: 1200 }, viewportWidth: 1200, viewportHeight: 800,
  safeArea: { left: 20, right: 20, top: 20, bottom: 20 }, padding: 8,
});

const harness = () => {
  let viewport: DiagramFitViewport = { x: 0, y: 0, zoom: 1 };
  const setViewport = vi.fn(async (next: DiagramFitViewport) => { viewport = next; return true; });
  return {
    getViewport: () => viewport, setViewport, fallbackFit: vi.fn(async () => true),
    waitForPaint: vi.fn(async () => true), isCancelled: () => false,
    syncSemanticViewport: vi.fn(), readFitInput: vi.fn(() => input()),
  };
};

describe('measured overview fit', () => {
  it.each([false, true])('fits target-sized labels against the safe area (readabilityScaled=%s)', readabilityScaled => {
    const scene = { ...input(), labelMeasurements: [
      { centerX: 4200, centerY: 600, width: 1000, height: 40, readabilityScaled },
    ] };
    const before = structuredClone(scene);
    const result = computeDiagramLabelAwareFit(scene);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.zoom).toBeGreaterThan(0.05);
    expect(result.zoom).toBeLessThan(0.72);
    const screenWidth = readabilityScaled ? 720 : 1000 * result.zoom;
    expect(result.x + 4200 * result.zoom + screenWidth / 2).toBeLessThanOrEqual(1200 - 20 - 8);
    expect(result.x).toBeGreaterThanOrEqual(28);
    expect(scene).toEqual(before);
  });

  it('fits a label wider than the viewport below the finite readability scale cap', () => {
    const scene = { ...input(), labelMeasurements: [
      { centerX: 4200, centerY: 600, width: 10000, height: 40, readabilityScaled: true },
    ] };
    const result = computeDiagramLabelAwareFit(scene);
    expect(result?.zoom).toBeGreaterThan(0);
    expect(result?.zoom).toBeLessThan(0.05);
    expect(result && diagramOverviewContainsContent(scene, result)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1_000_000_001])('rejects invalid label dimensions %s', width => {
    expect(computeDiagramLabelAwareFit({ ...input(), labelMeasurements: [
      { centerX: 4200, centerY: 600, width, height: 40, readabilityScaled: true },
    ] })).toBeNull();
  });

  it('bounds label input count and preserves the empty-label fit', () => {
    expect(computeDiagramLabelAwareFit({ ...input(), labelMeasurements: [] })).toEqual(computeDiagramLabelAwareFit(input()));
    expect(computeDiagramLabelAwareFit({ ...input(), labelMeasurements: Array.from({ length: 10001 }, () => (
      { centerX: 0, centerY: 0, width: 10, height: 10, readabilityScaled: true }
    )) })).toBeNull();
  });

  it.each([null, '<script>', {}, [null]])('rejects malformed label measurement collections %j', labelMeasurements => {
    expect(computeDiagramLabelAwareFit(Object.assign(input(), { labelMeasurements }))).toBeNull();
  });

  it('remeasures after target semantic zoom and corrects enlarged labels once', async () => {
    const h = harness();
    h.readFitInput.mockReturnValueOnce(input()).mockReturnValue(input(6000));
    expect(await applyDiagramOverviewFit(h)).toBe(true);
    expect(h.readFitInput).toHaveBeenCalledTimes(2);
    expect(h.setViewport).toHaveBeenCalledTimes(2);
    expect(h.waitForPaint).toHaveBeenCalledTimes(2);
    expect(diagramOverviewContainsContent(input(6000), h.getViewport())).toBe(true);
    expect(h.getViewport().zoom).toBeLessThan(0.32);
  });

  it('does not refine an already-contained overview or rescan indefinitely', async () => {
    const h = harness();
    expect(await applyDiagramOverviewFit(h)).toBe(true);
    expect(h.setViewport).toHaveBeenCalledTimes(1);
    expect(h.waitForPaint).toHaveBeenCalledTimes(1);
  });

  it('leaves a newer user viewport untouched while the first paint finishes', async () => {
    const h = harness();
    h.waitForPaint.mockImplementationOnce(async () => {
      await h.setViewport({ x: 200, y: 200, zoom: 1 });
      return true;
    });
    expect(await applyDiagramOverviewFit(h)).toBe(true);
    expect(h.getViewport()).toEqual({ x: 200, y: 200, zoom: 1 });
    expect(h.readFitInput).toHaveBeenCalledTimes(1);
  });

  it('does not correct a viewport superseded before the animated fit resolves', async () => {
    const h = harness();
    const userViewport = { x: 200, y: 200, zoom: 1 };
    h.getViewport = () => userViewport;
    expect(await applyDiagramOverviewFit({ ...h, duration: 450 })).toBe(true);
    expect(h.setViewport).toHaveBeenCalledTimes(1);
    expect(h.readFitInput).toHaveBeenCalledTimes(1);
    expect(h.syncSemanticViewport).toHaveBeenLastCalledWith(userViewport);
  });

  it('fails explicitly on cancelled or unsuccessful application and propagates failures', async () => {
    const cancelled = harness();
    expect(await applyDiagramOverviewFit({ ...cancelled, isCancelled: () => true })).toBe(false);
    expect(cancelled.setViewport).not.toHaveBeenCalled();
    const failed = harness();
    failed.setViewport.mockResolvedValue(false);
    expect(await applyDiagramOverviewFit(failed)).toBe(false);
    expect(failed.waitForPaint).not.toHaveBeenCalled();
    const throwing = harness();
    throwing.setViewport.mockRejectedValue(new Error('viewport failed'));
    await expect(applyDiagramOverviewFit(throwing)).rejects.toThrow('viewport failed');
  });

  it('uses the declared fallback for missing bounds and stops when paint is cancelled', async () => {
    const h = harness();
    expect(await applyDiagramOverviewFit({ ...h, readFitInput: () => null })).toBe(true);
    expect(h.fallbackFit).toHaveBeenCalledOnce();
    h.waitForPaint.mockResolvedValue(false);
    expect(await applyDiagramOverviewFit(h)).toBe(false);
  });
});
