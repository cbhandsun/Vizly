import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    clampDiagramFullFitZoom,
    coerceDiagramSidebarOffset,
    DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET,
    MAX_DIAGRAM_FULL_FIT_ZOOM,
  MIN_DIAGRAM_FULL_FIT_ZOOM,
} from '../diagramControlFit';

const logDiagramControlDispatchFailure = vi.fn();

vi.mock('../diagramControlLogging', () => ({
  logDiagramControlDispatchFailure,
}));

describe('diagramControl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    logDiagramControlDispatchFailure.mockReset();
  });

  it('logs dispatch failures without throwing', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => {
      throw new Error('Authorization: Bearer diagram-control-secret');
    });

    const { dispatchDiagramControl } = await import('../diagramControl');

    expect(() => dispatchDiagramControl('fit', 'diagram-1')).not.toThrow();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(logDiagramControlDispatchFailure).toHaveBeenCalledWith(
      'fit',
      expect.any(Error)
    );
  });

  it('allows full-fit views below the old 45 percent clipping floor', () => {
    expect(clampDiagramFullFitZoom(0.3)).toBeCloseTo(0.294);
    expect(clampDiagramFullFitZoom(0.3)).toBeLessThan(0.45);
  });

  it('clamps invalid and extreme full-fit zoom values', () => {
    expect(clampDiagramFullFitZoom(Number.NaN)).toBe(MIN_DIAGRAM_FULL_FIT_ZOOM);
    expect(clampDiagramFullFitZoom(Number.POSITIVE_INFINITY)).toBe(MIN_DIAGRAM_FULL_FIT_ZOOM);
    expect(clampDiagramFullFitZoom(-1)).toBe(MIN_DIAGRAM_FULL_FIT_ZOOM);
    expect(clampDiagramFullFitZoom(100)).toBe(MAX_DIAGRAM_FULL_FIT_ZOOM);
  });

  it('uses the actual bounded sidebar offset when fitting editor content', () => {
    expect(coerceDiagramSidebarOffset('60px')).toBe(60);
    expect(coerceDiagramSidebarOffset('316')).toBe(316);
    expect(coerceDiagramSidebarOffset('')).toBe(DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET);
    expect(coerceDiagramSidebarOffset('not-a-size')).toBe(DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET);
    expect(coerceDiagramSidebarOffset(-1)).toBe(DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET);
    expect(coerceDiagramSidebarOffset(50_000)).toBe(800);
  });
});
