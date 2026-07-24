import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  getDomainDagreNodeDimensions,
  getDomainDagreSubDomainOrderIndex,
  normalizeDomainDagreNodes,
  resolveDomainDagreLayoutBoundary,
} from '../domainDagreLayoutBoundary';

describe('domain Dagre layout boundary', () => {
  it('coerces directions, bounded spacing, flags, and semantic order', () => {
    const boundary = resolveDomainDagreLayoutBoundary({
      domain: { gap: -1, widthCompensation: 100 },
      node: { gap: { horizontal: 10, vertical: Number.NaN } },
      diagram: { layout: { direction: 'RL' } },
    }, {
      GROUP_TITLE_SAFE_GAP: Number.POSITIVE_INFINITY,
    }, {
      direction: 'bad',
      subDomainNodeDirection: 'lr',
      generateDomainGroups: 'false',
      domainWhitelist: [' A ', 'A', 1],
      subDomainOrder: { ' Domain A ': [' First ', 'Second'] },
    });

    expect(boundary).toMatchObject({
      domainGap: 0,
      nodeGapH: 40,
      nodeGapV: 60,
      direction: 'RL',
      subDomainNodeDirection: 'LR',
      widthCompensation: 10,
      titleSafe: 8,
      showDomainGroups: true,
      domainWhitelist: ['A'],
    });
    expect(getDomainDagreSubDomainOrderIndex(boundary.subDomainOrder, 'domaina', 'first')).toBe(0);
    expect(getDomainDagreSubDomainOrderIndex(boundary.subDomainOrder, 'missing', 'first')).toBe(Infinity);
  });

  it('normalizes each coordinate and dimension independently', () => {
    const nodes = normalizeDomainDagreNodes([{
      id: 'node',
      data: {},
      position: { x: Number.NaN, y: -20 },
      style: { width: 160 },
      measured: { width: 999, height: Number.POSITIVE_INFINITY },
    }], 200, 80);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      position: { x: 0, y: -20 },
      measured: { width: 160, height: 80 },
    });
    expect(getDomainDagreNodeDimensions(nodes[0], 200, 80)).toEqual({ width: 160, height: 80 });
  });

  it('rejects malformed node collections and records', () => {
    expect(normalizeDomainDagreNodes(null, 200, 80)).toEqual([]);
    expect(normalizeDomainDagreNodes([
      null,
      { id: 1, data: {}, position: { x: 0, y: 0 } },
      { id: 'missing-data', position: { x: 0, y: 0 } },
    ], 200, 80)).toEqual([]);
  });

  it('falls back from invalid node dimensions', () => {
    const node = {
      id: 'node', data: {}, position: { x: 0, y: 0 }, width: -1, height: Number.NaN,
    } as Node;
    expect(getDomainDagreNodeDimensions(node, 200, 80)).toEqual({ width: 200, height: 80 });
  });
});
