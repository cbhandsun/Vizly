// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { resolveExportPopupContainer } from '../exportPopupContainer';

afterEach(() => {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: null,
  });
});

describe('resolveExportPopupContainer', () => {
  it('uses the document body so export menus can avoid narrow local containers', () => {
    expect(resolveExportPopupContainer(document)).toBe(document.body);
  });

  it('keeps export menus inside the active fullscreen root', () => {
    const fullscreenRoot = document.createElement('div');
    document.body.appendChild(fullscreenRoot);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: fullscreenRoot,
    });

    expect(resolveExportPopupContainer(document)).toBe(fullscreenRoot);
  });

  it('falls back to the body when fullscreen uses a non-HTML element', () => {
    const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svgRoot);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: svgRoot,
    });

    expect(resolveExportPopupContainer(document)).toBe(document.body);
  });
});
