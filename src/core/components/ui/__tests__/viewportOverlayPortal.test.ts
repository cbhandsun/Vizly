// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  getViewportPopupContainer,
  resolveViewportPopupContainer,
} from '../viewportOverlayPortal';

afterEach(() => {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: null,
  });
});

describe('viewport popup container', () => {
  it('uses the document body so toolbar popups escape scrollable islands', () => {
    expect(resolveViewportPopupContainer(document)).toBe(document.body);
    expect(getViewportPopupContainer()).toBe(document.body);
  });

  it('keeps popups inside the active HTML fullscreen root', () => {
    const fullscreenRoot = document.createElement('section');
    document.body.appendChild(fullscreenRoot);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: fullscreenRoot,
    });

    expect(resolveViewportPopupContainer(document)).toBe(fullscreenRoot);

    fullscreenRoot.remove();
  });

  it('falls back to the body for non-HTML fullscreen elements', () => {
    const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svgRoot);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: svgRoot,
    });

    expect(resolveViewportPopupContainer(document)).toBe(document.body);

    svgRoot.remove();
  });
});
