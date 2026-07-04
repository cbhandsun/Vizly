import { describe, expect, it, vi } from 'vitest';

import {
  createBaseReactFlowExportStateHandlers,
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

    syncBaseReactFlowZoomClass({
      container,
      viewport: { x: 0, y: 0, zoom: 0.8 },
    });
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

  it('creates export state handlers that flip the hidden flag', () => {
    const setHidden = vi.fn();
    const handlers = createBaseReactFlowExportStateHandlers({ setHidden });

    handlers.onStart();
    handlers.onStop();

    expect(setHidden).toHaveBeenNthCalledWith(1, true);
    expect(setHidden).toHaveBeenNthCalledWith(2, false);
  });
});
