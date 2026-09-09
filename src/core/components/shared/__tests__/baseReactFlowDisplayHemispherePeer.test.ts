// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';

import {
  classifyDisplayPeerHemisphere,
  displayPeerHemispheresAreOpposite,
  displayPortSideFlowAxis,
  shouldSkipSharedSourceTrunkAcrossOppositeHemisphere,
} from '../baseReactFlowDisplayHemispherePeer';

const rect = (x: number, y: number) => ({ x, y, width: 40, height: 40 });

const node = (id: string, x: number, y: number): Node => ({
  id,
  data: {},
  position: { x, y },
  width: 40,
  height: 40,
});

describe('base React Flow display hemisphere peers', () => {
  it('classifies dominant peer hemispheres around a shared hub', () => {
    const hub = rect(100, 100);

    expect(classifyDisplayPeerHemisphere(hub, rect(0, 108))).toBe('left');
    expect(classifyDisplayPeerHemisphere(hub, rect(240, 108))).toBe('right');
    expect(classifyDisplayPeerHemisphere(hub, rect(108, 0))).toBe('top');
    expect(classifyDisplayPeerHemisphere(hub, rect(108, 240))).toBe('bottom');
  });

  it('only treats true opposite hemispheres as competing shared trunks', () => {
    expect(displayPeerHemispheresAreOpposite('left', 'right')).toBe(true);
    expect(displayPeerHemispheresAreOpposite('top', 'bottom')).toBe(true);
    expect(displayPeerHemispheresAreOpposite('left', 'top')).toBe(false);
    expect(displayPeerHemispheresAreOpposite('right', 'bottom')).toBe(false);
  });

  it('skips source trunk adoption for targets on opposite hub hemispheres', () => {
    const nodes = new Map([
      node('hub', 100, 100),
      node('left', 0, 100),
      node('right', 240, 100),
      node('right-neighbor', 240, 180),
    ].map(item => [item.id, item] as const));

    expect(shouldSkipSharedSourceTrunkAcrossOppositeHemisphere(nodes, 'hub', 'left', 'right')).toBe(true);
    expect(shouldSkipSharedSourceTrunkAcrossOppositeHemisphere(nodes, 'hub', 'right', 'right-neighbor')).toBe(false);
    expect(shouldSkipSharedSourceTrunkAcrossOppositeHemisphere(nodes, 'missing', 'left', 'right')).toBe(false);
  });

  it('uses the caller flow axis when deciding whether same-source trunks compete', () => {
    const nodes = new Map([
      node('hub', 100, 100),
      node('upper-right', 160, 30),
      node('lower-right', 160, 170),
    ].map(item => [item.id, item] as const));

    expect(shouldSkipSharedSourceTrunkAcrossOppositeHemisphere(
      nodes,
      'hub',
      'upper-right',
      'lower-right',
    )).toBe(true);
    expect(shouldSkipSharedSourceTrunkAcrossOppositeHemisphere(
      nodes,
      'hub',
      'upper-right',
      'lower-right',
      { flowAxis: 'vertical' },
    )).toBe(true);
    expect(shouldSkipSharedSourceTrunkAcrossOppositeHemisphere(
      nodes,
      'hub',
      'upper-right',
      'lower-right',
      { flowAxis: displayPortSideFlowAxis('right') },
    )).toBe(false);
    expect(displayPortSideFlowAxis('top')).toBe('vertical');
  });});
