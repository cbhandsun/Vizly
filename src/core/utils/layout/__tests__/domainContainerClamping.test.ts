import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/DiagramConfig', () => ({
  diagramConfigManager: {
    getConfig: () => ({
      domain: {
        padding: { horizontal: 20, bottom: 18 },
        title: { height: 40, padding: { vertical: 10 }, safeGap: 12 },
        bottomSafeGap: 18,
      },
      subDomain: { padding: { horizontal: 20, top: 35, bottom: 15 } },
    }),
    getLayoutConfig: () => ({
      NODE_H_GAP: 80,
      ENSURE_SUB_GROUP_TITLE_CLEARANCE: true,
      SUB_GROUP_TITLE_CLEARANCE: 45,
    }),
  },
}));

import { clampNodesToContainers } from '../domainContainerClamping';

const node = (
  id: string,
  type: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Record<string, unknown>,
): Node => ({
  id,
  type,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data,
});

describe('domainContainerClamping', () => {
  it('clamps members without mutating the input positions', () => {
    const input = [
      node('domain', 'titleGroup', 0, 0, 180, 180, { domain: 'D' }),
      node('sub', 'subGroup', 40, 80, 120, 100, { domain: 'D', children: ['child'] }),
      node('child', undefined, -100, -100, 40, 30, { domain: 'D' }),
      node('free', undefined, -200, -200, 40, 30, { domain: 'D' }),
    ];

    const result = clampNodesToContainers(input);
    const child = result.find(item => item.id === 'child');
    const free = result.find(item => item.id === 'free');

    expect(child?.position.x).toBeGreaterThanOrEqual(60);
    expect(child?.position.y).toBeGreaterThanOrEqual(125);
    expect(free?.position.x).toBeGreaterThanOrEqual(20);
    expect(free?.position.y).toBeGreaterThanOrEqual(62);
    expect(input[2].position).toEqual({ x: -100, y: -100 });
  });

  it('contains non-finite coordinates and ignores malformed child identifiers', () => {
    const result = clampNodesToContainers([
      node('domain', 'titleGroup', Number.NaN, Infinity, 180, 180, { domain: 'D' }),
      node('sub', 'subGroup', Number.NaN, -Infinity, 120, 100, {
        domain: 'D',
        children: ['child', 42, null],
      }),
      node('child', undefined, Number.NaN, Infinity, 40, 30, { domain: 'D' }),
    ]);

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
    }
  });
});
