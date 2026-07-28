import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readDisplayRoutingNodePanGesture,
  readVisibleDisplayRoutingNodeRect,
} from './display-routing-browser-geometry.mjs';

const rect = (x, y, width, height) => ({
  x,
  y,
  width,
  height,
  left: x,
  top: y,
  right: x + width,
  bottom: y + height,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('display routing browser geometry', () => {
  it('returns a rendered node only after its center is visible and pointer-reachable', () => {
    const child = {};
    const node = {
      getAttribute: () => 'tms',
      getBoundingClientRect: () => rect(300, 180, 80, 40),
      contains: candidate => candidate === child,
    };
    vi.stubGlobal('document', {
      querySelectorAll: () => [node],
      querySelector: () => ({ getBoundingClientRect: () => rect(0, 0, 754, 480) }),
      elementsFromPoint: () => [child],
    });

    expect(readVisibleDisplayRoutingNodeRect('tms')).toEqual({
      x: 300,
      y: 180,
      width: 80,
      height: 40,
    });
  });

  it('waits while auto-fit leaves the target outside the pane', () => {
    const pane = { getBoundingClientRect: () => rect(0, 0, 754, 480) };
    const node = {
      getAttribute: () => 'tms',
      getBoundingClientRect: () => rect(900, 800, 80, 40),
      contains: () => true,
    };
    vi.stubGlobal('document', {
      querySelectorAll: () => [node],
      querySelector: () => pane,
      elementsFromPoint: () => [node],
      elementFromPoint: () => pane,
    });

    expect(readVisibleDisplayRoutingNodeRect('tms')).toBeNull();
    expect(readDisplayRoutingNodePanGesture('tms')).toEqual({
      startX: 377,
      startY: 240,
      endX: 8,
      endY: 8,
    });
  });

  it('rejects covered and malformed drag targets', () => {
    const node = {
      getAttribute: () => 'tms',
      getBoundingClientRect: () => rect(300, 180, 80, 40),
      contains: () => false,
    };
    vi.stubGlobal('document', {
      querySelectorAll: () => [node],
      querySelector: () => ({ getBoundingClientRect: () => rect(0, 0, 754, 480) }),
      elementsFromPoint: () => [{}],
      elementFromPoint: () => ({}),
    });

    expect(readVisibleDisplayRoutingNodeRect('tms')).toBeNull();
    expect(readDisplayRoutingNodePanGesture('tms')).toBeNull();
    expect(readVisibleDisplayRoutingNodeRect('')).toBeNull();
    expect(readVisibleDisplayRoutingNodeRect('x'.repeat(501))).toBeNull();
  });
});
