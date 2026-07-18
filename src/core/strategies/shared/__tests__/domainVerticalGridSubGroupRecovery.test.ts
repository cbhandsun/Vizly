import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { layoutNodesInGrid } from '../domainVerticalNodeLayoutPrimitives';
import { recoverGridSubGroupsByDomainWidth } from '../domainVerticalGridSubGroupRecovery';

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

const options = (layoutGrid = vi.fn((
  children: ReactFlowNode[],
  left: number,
  right: number,
  startY: number,
  columns: number,
) => layoutNodesInGrid(children, left, right, startY, columns, {
  minimumWidth: 80,
  defaultWidth: 120,
  defaultHeight: 80,
  horizontalGap: 20,
  verticalGap: 10,
}))) => ({
  domainHorizontalPadding: 20,
  subGroupHorizontalPadding: 10,
  subGroupTopPadding: 12,
  subGroupTitleHeight: 30,
  subGroupTitleVerticalPadding: 8,
  bottomSafeGap: 14,
  horizontalGap: 20,
  verticalGap: 10,
  defaultChildWidth: 120,
  defaultChildHeight: 80,
  compareSubGroups: (left: ReactFlowNode, right: ReactFlowNode) =>
    String(left.id).localeCompare(String(right.id)),
  layoutGrid,
});

describe('recoverGridSubGroupsByDomainWidth', () => {
  it('lays out declared children and projects row bounds into subgroup size', () => {
    const layoutGrid = options().layoutGrid;
    const input = [
      node('domain', 'titleGroup', 'A', 100, 20, 600, 400),
      node('sub', 'subGroup', 'A', 130, 80, 200, 100, {
        children: ['c1', 'c2', 'c3'],
      }),
      node('c1', 'default', 'A', 0, 0, 100, 40),
      node('c2', 'default', 'A', 0, 0, 120, 60),
      node('c3', 'default', 'A', 0, 0, 80, 50),
    ];

    const result = recoverGridSubGroupsByDomainWidth(input, options(layoutGrid));
    const byId = new Map(result.map(item => [item.id, item]));

    expect(layoutGrid).toHaveBeenCalledWith(
      expect.any(Array),
      140,
      480,
      130,
      3,
    );
    expect(byId.get('c1')?.position).toEqual({ x: 140, y: 130 });
    expect(byId.get('c3')?.position).toEqual({ x: 400, y: 130 });
    expect(byId.get('sub')?.position).toEqual({ x: 130, y: 80 });
    expect(byId.get('sub')?.measured).toEqual({ width: 360, height: 124 });
    expect(input[2].position).toEqual({ x: 0, y: 0 });
  });

  it('uses two columns when a domain has at least three visible subgroups', () => {
    const layoutGrid = options().layoutGrid;
    recoverGridSubGroupsByDomainWidth([
      node('domain', 'titleGroup', 'A', 0, 0),
      node('sub-a', 'subGroup', 'A', 20, 40, 100, 80, { children: ['c1', 'c2', 'c1'] }),
      node('sub-b', 'subGroup', 'A', 140, 40, 100, 80, { hidden: true, children: ['c3'] }),
      node('sub-c', 'subGroup', 'A', 260, 40, 100, 80, { children: ['c3'] }),
      node('sub-d', 'subGroup', 'A', 380, 40, 100, 80, { children: ['c4'] }),
      node('c1', 'default', 'A', 0, 0),
      node('c2', 'default', 'A', 0, 0),
      node('c3', 'default', 'A', 0, 0),
      node('c4', 'default', 'A', 0, 0),
    ], options(layoutGrid));

    expect(layoutGrid.mock.calls.map(call => call[4])).toEqual([2, 1, 1]);
    expect(layoutGrid.mock.calls[0][0].map(child => child.id)).toEqual(['c1', 'c2']);
  });

  it('leaves empty and missing child references unchanged', () => {
    const layoutGrid = options().layoutGrid;
    const input = [
      node('domain', 'titleGroup', 'A', 0, 0),
      node('empty', 'subGroup', 'A', 20, 40, 100, 80),
      node('missing', 'subGroup', 'A', 140, 40, 100, 80, {
        children: ['', null, 42, 'not-found'],
      }),
    ];

    const result = recoverGridSubGroupsByDomainWidth(input, options(layoutGrid));

    expect(layoutGrid).not.toHaveBeenCalled();
    expect(result.map(item => item.measured)).toEqual(input.map(item => item.measured));
  });

  it('sanitizes invalid geometry and malformed layout results', () => {
    const result = recoverGridSubGroupsByDomainWidth([
      node('domain', 'titleGroup', 'A', Number.NaN, Number.POSITIVE_INFINITY),
      node('sub', 'subGroup', 'A', Number.NEGATIVE_INFINITY, Number.NaN, 100, 80, {
        children: ['child'],
      }),
      node(
        'child',
        'default',
        'A',
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        -10,
      ),
    ], options(vi.fn(children => {
      children[0].position = { x: Number.NaN, y: Number.POSITIVE_INFINITY };
      return { endY: Number.NaN, rows: [], rowWidths: [Number.NaN] };
    })));

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
    }
    expect(result[1].measured).toEqual({ width: 140, height: 64 });
  });
});
