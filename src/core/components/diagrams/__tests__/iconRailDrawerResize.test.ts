import { describe, expect, it } from 'vitest';

import {
  ICON_RAIL_DRAWER_KEYBOARD_LARGE_STEP,
  ICON_RAIL_DRAWER_KEYBOARD_STEP,
  resolveIconRailDrawerKeyboardWidth,
} from '../iconRailDrawerResize';
import {
  clampIconRailDrawerWidth,
  ICON_RAIL_DRAWER_DEFAULT_WIDTH,
  ICON_RAIL_DRAWER_MAX_WIDTH,
  ICON_RAIL_DRAWER_MIN_WIDTH,
} from '../iconRailSidebarStorage';

describe('icon rail drawer resize boundaries', () => {
  it('applies normal and accelerated arrow-key increments', () => {
    expect(resolveIconRailDrawerKeyboardWidth({
      currentWidth: 300,
      key: 'ArrowLeft',
    })).toBe(300 - ICON_RAIL_DRAWER_KEYBOARD_STEP);
    expect(resolveIconRailDrawerKeyboardWidth({
      currentWidth: 300,
      key: 'ArrowRight',
      shiftKey: true,
    })).toBe(300 + ICON_RAIL_DRAWER_KEYBOARD_LARGE_STEP);
  });

  it('supports Home and End and clamps extreme values', () => {
    expect(resolveIconRailDrawerKeyboardWidth({
      currentWidth: ICON_RAIL_DRAWER_MAX_WIDTH,
      key: 'ArrowRight',
    })).toBe(ICON_RAIL_DRAWER_MAX_WIDTH);
    expect(resolveIconRailDrawerKeyboardWidth({
      currentWidth: ICON_RAIL_DRAWER_MIN_WIDTH,
      key: 'ArrowLeft',
    })).toBe(ICON_RAIL_DRAWER_MIN_WIDTH);
    expect(resolveIconRailDrawerKeyboardWidth({ currentWidth: 300, key: 'Home' }))
      .toBe(ICON_RAIL_DRAWER_MIN_WIDTH);
    expect(resolveIconRailDrawerKeyboardWidth({ currentWidth: 300, key: 'End' }))
      .toBe(ICON_RAIL_DRAWER_MAX_WIDTH);
  });

  it('ignores unrelated keys without changing the drawer', () => {
    expect(resolveIconRailDrawerKeyboardWidth({
      currentWidth: 300,
      key: 'Enter',
    })).toBeNull();
  });

  it('normalizes invalid, empty-number, and out-of-range width inputs', () => {
    expect(clampIconRailDrawerWidth(Number.NaN)).toBe(ICON_RAIL_DRAWER_DEFAULT_WIDTH);
    expect(clampIconRailDrawerWidth(Number.POSITIVE_INFINITY)).toBe(ICON_RAIL_DRAWER_DEFAULT_WIDTH);
    expect(clampIconRailDrawerWidth(-1)).toBe(ICON_RAIL_DRAWER_MIN_WIDTH);
    expect(clampIconRailDrawerWidth(Number.MAX_SAFE_INTEGER)).toBe(ICON_RAIL_DRAWER_MAX_WIDTH);
  });
});
