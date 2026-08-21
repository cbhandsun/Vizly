// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  createBaseReactFlowExportStateHandlers,
  isUsableBaseReactFlowViewport,
  resolveBaseReactFlowInitialFitMode,
  restoreBaseReactFlowViewportOnInit,
  syncBaseReactFlowZoomClass,
} from '../baseReactFlowViewport';

describe('baseReactFlowViewport', () => {
  it('toggles the zoomed-out class based on viewport zoom', () => {
    const container = document.createElement('div');

    syncBaseReactFlowZoomClass({
      container,
      viewport: { x: 0, y: 0, zoom: 0.3 },
    });
    expect(container.classList.contains('diagram-zoomed-out')).toBe(true);
    expect(container.style.getPropertyValue('--diagram-edge-label-scale')).toBe('2.400');

    syncBaseReactFlowZoomClass({
      container,
      viewport: { x: 0, y: 0, zoom: 0.8 },
    });
    expect(container.classList.contains('diagram-zoomed-out')).toBe(false);
    expect(container.style.getPropertyValue('--diagram-edge-label-scale')).toBe('1.000');
  });

  it('coerces invalid zoom to a safe label scale', () => {
    const container = document.createElement('div');

    syncBaseReactFlowZoomClass({
      container,
      viewport: { x: 0, y: 0, zoom: Number.NaN },
    });

    expect(container.style.getPropertyValue('--diagram-edge-label-scale')).toBe('1.000');
    expect(container.classList.contains('diagram-zoomed-out')).toBe(false);
  });

  it('restores the last viewport only when fitMode is none', () => {
    const setViewport = vi.fn();

    expect(restoreBaseReactFlowViewportOnInit({
      instance: { setViewport },
      fitMode: 'none',
      lastViewport: { x: 10, y: 20, zoom: 1.5 },
    })).toBe(true);
    expect(setViewport).toHaveBeenCalledWith({ x: 10, y: 20, zoom: 1.5 });

    setViewport.mockReset();
    expect(restoreBaseReactFlowViewportOnInit({
      instance: { setViewport },
      fitMode: 'fitAll',
      lastViewport: { x: 10, y: 20, zoom: 1.5 },
    })).toBe(false);
    expect(setViewport).not.toHaveBeenCalled();
  });

  it('restores a valid viewport or requests one initial fit for restore-or-fit-all mode', () => {
    const viewport = { x: -120, y: 44, zoom: 0.75 };
    const setViewport = vi.fn();

    expect(resolveBaseReactFlowInitialFitMode({
      fitMode: 'restoreOrFitAll',
      lastViewport: viewport,
    })).toBe('none');
    expect(restoreBaseReactFlowViewportOnInit({
      instance: { setViewport },
      fitMode: 'restoreOrFitAll',
      lastViewport: viewport,
    })).toBe(true);
    expect(setViewport).toHaveBeenCalledWith(viewport);

    expect(resolveBaseReactFlowInitialFitMode({
      fitMode: 'restoreOrFitAll',
      lastViewport: null,
    })).toBe('fitAll');
  });

  it.each([
    null,
    undefined,
    { x: Number.NaN, y: 0, zoom: 1 },
    { x: 0, y: Number.POSITIVE_INFINITY, zoom: 1 },
    { x: 0, y: 0, zoom: 0 },
    { x: 0, y: 0, zoom: 9 },
  ])('rejects an invalid stored viewport (%j)', (lastViewport) => {
    const setViewport = vi.fn();

    expect(isUsableBaseReactFlowViewport(lastViewport)).toBe(false);
    expect(resolveBaseReactFlowInitialFitMode({
      fitMode: 'restoreOrFitAll',
      lastViewport,
    })).toBe('fitAll');
    expect(restoreBaseReactFlowViewportOnInit({
      instance: { setViewport },
      fitMode: 'restoreOrFitAll',
      lastViewport,
    })).toBe(false);
    expect(setViewport).not.toHaveBeenCalled();
  });

  it('creates export state handlers that flip the hidden flag', () => {
    const setHidden = vi.fn();
    const handlers = createBaseReactFlowExportStateHandlers({ setHidden });

    handlers.onStart();
    handlers.onStop();

    expect(setHidden).toHaveBeenNthCalledWith(1, true);
    expect(setHidden).toHaveBeenNthCalledWith(2, false);
  });
});
