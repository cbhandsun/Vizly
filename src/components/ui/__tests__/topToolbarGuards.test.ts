import { describe, expect, it } from 'vitest';
import { getToolbarPopupContainer, isToolbarEdgeMode } from '../topToolbarGuards';

describe('top toolbar guards', () => {
  it('accepts only supported edge modes', () => {
    expect(isToolbarEdgeMode('advanced-smart')).toBe(true);
    expect(isToolbarEdgeMode('native')).toBe(true);
    expect(isToolbarEdgeMode('smart')).toBe(false);
    expect(isToolbarEdgeMode('')).toBe(false);
  });

  it('uses the nearest safe popup container fallback', () => {
    const parent = document.createElement('div');
    const trigger = document.createElement('button');
    parent.appendChild(trigger);
    document.body.appendChild(parent);

    expect(getToolbarPopupContainer(trigger)).toBe(parent);

    parent.remove();
  });

  it('prefers the fullscreen element for popup containment', () => {
    const fullscreenHost = document.createElement('section');
    const parent = document.createElement('div');
    const trigger = document.createElement('button');
    parent.appendChild(trigger);

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: fullscreenHost,
    });

    expect(getToolbarPopupContainer(trigger)).toBe(fullscreenHost);

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
  });
});
