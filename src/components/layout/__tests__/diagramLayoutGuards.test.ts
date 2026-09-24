import { describe, expect, it } from 'vitest';
import {
  coerceUiScale,
  getLayoutPopupContainer,
  getNextSidebarWidth,
  getSidebarOffsets,
  resolveUiScale,
} from '../diagramLayoutGuards';

describe('diagramLayoutGuards', () => {
  it('bounds UI scale from URL and config sources', () => {
    expect(coerceUiScale(1.25)).toBe(1.25);
    expect(coerceUiScale('3.5')).toBe(1);
    expect(coerceUiScale('0.3')).toBe(1);
    expect(resolveUiScale('?uiScale=1.5', 2)).toBe(1.5);
    expect(resolveUiScale('?uiScale=bad', 2)).toBe(2);
    expect(resolveUiScale('?uiScale=bad', Number.NaN)).toBe(1);
  });

  it('bounds drag widths for menu and flow sidebars', () => {
    expect(getNextSidebarWidth({ kind: 'menu', startX: 100, startWidth: 300 }, 10)).toBe(220);
    expect(getNextSidebarWidth({ kind: 'menu', startX: 100, startWidth: 300 }, 1000)).toBe(520);
    expect(getNextSidebarWidth({ kind: 'flow', startX: 100, startWidth: 260 }, 0)).toBe(200);
    expect(getNextSidebarWidth({ kind: 'flow', startX: Number.NaN, startWidth: 260 }, 400)).toBe(260);
  });

  it('computes finite sidebar offsets', () => {
    expect(getSidebarOffsets(true, 304, true, 360)).toEqual({
      leftSidebarOffset: 80,
      maxSidebarOffset: 376,
    });
    expect(getSidebarOffsets(false, Number.NaN, false, Number.NaN)).toEqual({
      leftSidebarOffset: 320,
      maxSidebarOffset: 320,
    });
  });

  it('uses the nearest layout root as popup container', () => {
    const root = document.createElement('div');
    root.id = 'app-root-layout';
    const child = document.createElement('button');
    root.appendChild(child);
    document.body.appendChild(root);

    expect(getLayoutPopupContainer(child)).toBe(root);
    expect(getLayoutPopupContainer()).toBe(root);

    root.remove();
  });
});
