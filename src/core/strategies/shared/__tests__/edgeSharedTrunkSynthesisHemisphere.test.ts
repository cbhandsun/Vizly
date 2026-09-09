// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  classifyRectPeerHemisphere,
  expectedTargetSideFromGeometry,
  geometryHemispheresAreOpposite,
  type Rect,
} from '../edgeSharedTrunkSynthesisUtils';

const rect = (x: number, y: number, width = 40, height = 40): Rect => ({ x, y, width, height });

describe('edge shared trunk hemisphere geometry', () => {
  it('classifies peer hemispheres with the shared default display threshold', () => {
    const hub = rect(100, 100);

    expect(classifyRectPeerHemisphere(hub, rect(0, 108))).toBe('left');
    expect(classifyRectPeerHemisphere(hub, rect(240, 108))).toBe('right');
    expect(classifyRectPeerHemisphere(hub, rect(108, 0))).toBe('top');
    expect(classifyRectPeerHemisphere(hub, rect(108, 240))).toBe('bottom');
  });

  it('keeps shared-trunk flow-axis bias configurable for grouped routes', () => {
    const hub = rect(100, 100);

    expect(classifyRectPeerHemisphere(hub, rect(152, 142), {
      dominantRatio: 1.25,
      minOffset: 50,
      flowAxis: 'vertical',
    })).toBe('bottom');
    expect(classifyRectPeerHemisphere(hub, rect(152, 142), {
      dominantRatio: 1.25,
      minOffset: 50,
      flowAxis: 'horizontal',
    })).toBe('right');
  });

  it('detects only opposing hemispheres as competing shared trunks', () => {
    expect(geometryHemispheresAreOpposite('left', 'right')).toBe(true);
    expect(geometryHemispheresAreOpposite('top', 'bottom')).toBe(true);
    expect(geometryHemispheresAreOpposite('left', 'top')).toBe(false);
    expect(geometryHemispheresAreOpposite('right', 'bottom')).toBe(false);
  });

  it('uses the shared classifier for expected target entry side', () => {
    expect(expectedTargetSideFromGeometry(rect(0, 100), rect(200, 100))).toBe('left');
    expect(expectedTargetSideFromGeometry(rect(200, 100), rect(0, 100))).toBe('right');
    expect(expectedTargetSideFromGeometry(rect(100, 0), rect(100, 200))).toBe('top');
    expect(expectedTargetSideFromGeometry(rect(100, 200), rect(100, 0))).toBe('bottom');
  });
});
