import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { finalizeInitialSubGroupLayout } from '../domainVerticalSubGroupPostLayout';

const node = (
  id: string,
  type: string,
  domain: string,
  x: number,
  y: number,
  width = 100,
  height = 60,
  data: Record<string, unknown> = {},
): ReactFlowNode => ({
  id,
  type,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  width,
  height,
  data: { domain, ...data },
});

const options = (layout: 'horizontal' | 'vertical' | 'grid' | 'centered' | 'dagre') => ({
  layout,
  domainHorizontalPadding: 20,
  subGroupHorizontalPadding: 10,
  horizontalGap: 20,
  verticalGap: 10,
  compactVerticalGap: 8,
  fallbackSubGroupWidth: 100,
  resolveChildOverlapsStrict: vi.fn((nodes: ReactFlowNode[]) => nodes),
  recomputeContainers: vi.fn((nodes: ReactFlowNode[]) => nodes),
  resolveSubGroupOverlaps: vi.fn((nodes: ReactFlowNode[]) =>
    nodes.map(item => item.id === 'sub-b'
      ? { ...item, position: { x: item.position.x, y: item.position.y + 100 } }
      : item)),
});

describe('finalizeInitialSubGroupLayout', () => {
  it('runs strict recovery, synchronizes resolved subgroup movement, and separates horizontally', () => {
    const config = options('horizontal');
    const result = finalizeInitialSubGroupLayout([
      node('domain', 'titleGroup', 'A', 100, 0, 500, 300),
      node('sub-a', 'subGroup', 'A', 105, 60, 100, 80, { children: ['child-a'] }),
      node('child-a', 'default', 'A', 125, 90),
      node('sub-b', 'subGroup', 'A', 150, 60, 100, 80, { children: ['child-b'] }),
      node('child-b', 'default', 'A', 170, 90),
    ], config);
    const byId = new Map(result.map(item => [item.id, item]));

    expect(config.resolveChildOverlapsStrict).toHaveBeenCalledWith(
      expect.any(Array),
      20,
      10,
    );
    expect(config.resolveSubGroupOverlaps).toHaveBeenCalledTimes(1);
    expect(byId.get('sub-a')?.position.x).toBe(110);
    expect(byId.get('child-a')?.position.x).toBe(130);
    expect(byId.get('sub-b')?.position).toEqual({ x: 230, y: 160 });
    expect(byId.get('child-b')?.position).toEqual({ x: 250, y: 190 });
    expect(config.recomputeContainers).toHaveBeenCalledTimes(2);
  });

  it('uses compact grid separation and ignores hidden subgroup overlap', () => {
    const config = options('grid');
    const result = finalizeInitialSubGroupLayout([
      node('domain', 'titleGroup', 'A', 0, 0, 500, 300),
      node('sub-a', 'subGroup', 'A', 10, 40, 100, 80),
      node('hidden', 'subGroup', 'A', 10, 40, 100, 80, { hidden: true }),
      node('sub-b', 'subGroup', 'A', 120, 40, 100, 80),
    ], config);

    expect(config.resolveSubGroupOverlaps).not.toHaveBeenCalled();
    expect(result.find(item => item.id === 'sub-b')?.position.x).toBe(122);
  });

  it('skips all post-processing for dagre while sanitizing geometry', () => {
    const config = options('dagre');
    const result = finalizeInitialSubGroupLayout([
      node('sub', 'subGroup', 'A', Number.NaN, Number.POSITIVE_INFINITY),
    ], config);

    expect(result[0].position).toEqual({ x: 0, y: 0 });
    expect(config.resolveChildOverlapsStrict).not.toHaveBeenCalled();
    expect(config.recomputeContainers).not.toHaveBeenCalled();
  });
});
