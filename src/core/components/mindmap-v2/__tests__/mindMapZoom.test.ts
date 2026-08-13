import { describe, expect, it, vi } from 'vitest';
import {
  applyMindMapZoomCommand,
  MIND_MAP_MAX_SCALE,
  MIND_MAP_MIN_SCALE,
  normalizeMindMapScale,
  toMindMapZoomPercent,
} from '../mindMapZoom';

const createMind = (scaleVal: unknown) => ({
  scale: vi.fn(),
  scaleVal,
});

describe('mind map zoom controls', () => {
  it('normalizes empty, invalid, and extreme vendor scale values', () => {
    expect(normalizeMindMapScale(undefined)).toBe(1);
    expect(normalizeMindMapScale(Number.NaN)).toBe(1);
    expect(normalizeMindMapScale(Number.POSITIVE_INFINITY)).toBe(1);
    expect(normalizeMindMapScale('1.5')).toBe(1);
    expect(normalizeMindMapScale(-100)).toBe(MIND_MAP_MIN_SCALE);
    expect(normalizeMindMapScale(100)).toBe(MIND_MAP_MAX_SCALE);
  });

  it('rounds vendor floating-point noise into a stable accessible percentage', () => {
    expect(normalizeMindMapScale(1.099999999999)).toBe(1.1);
    expect(toMindMapZoomPercent(1.099999999999)).toBe(110);
  });

  it('applies zoom in, zoom out, and reset as deterministic commands', () => {
    const zoomIn = createMind(1);
    const zoomOut = createMind(1);
    const reset = createMind(1.7);

    expect(applyMindMapZoomCommand(zoomIn, 'in')).toBe(110);
    expect(zoomIn.scale).toHaveBeenCalledWith(1.1);
    expect(applyMindMapZoomCommand(zoomOut, 'out')).toBe(90);
    expect(zoomOut.scale).toHaveBeenCalledWith(0.9);
    expect(applyMindMapZoomCommand(reset, 'reset')).toBe(100);
    expect(reset.scale).toHaveBeenCalledWith(1);
  });

  it('does not call the vendor API again at minimum, maximum, or reset scale', () => {
    const minimum = createMind(MIND_MAP_MIN_SCALE);
    const maximum = createMind(MIND_MAP_MAX_SCALE);
    const reset = createMind(1);

    expect(applyMindMapZoomCommand(minimum, 'out')).toBe(20);
    expect(applyMindMapZoomCommand(maximum, 'in')).toBe(300);
    expect(applyMindMapZoomCommand(reset, 'reset')).toBe(100);
    expect(minimum.scale).not.toHaveBeenCalled();
    expect(maximum.scale).not.toHaveBeenCalled();
    expect(reset.scale).not.toHaveBeenCalled();
  });

  it('propagates vendor failures so the caller cannot publish a false percentage', () => {
    const mind = createMind(1);
    mind.scale.mockImplementation(() => {
      throw new Error('vendor scale failed');
    });

    expect(() => applyMindMapZoomCommand(mind, 'in')).toThrow('vendor scale failed');
  });
});
