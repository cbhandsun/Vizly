import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildDeclaredTerminalAxisStubCandidates,
  buildCrossingCompanionOuterPortVariants,
  displayTerminalRoleNeedsDeclaredAxisRepair,
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from '../baseReactFlowDisplayTerminalPortCandidates';
import { getDisplayComputedPath, type DisplaySegment } from '../baseReactFlowDisplayGeometry';
import { node } from './baseReactFlowDisplayEdges.testUtils';

const edge = (data: Record<string, unknown> = {}): Edge => ({
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data,
});

describe('baseReactFlowDisplayTerminalPortCandidates', () => {
  it('honors fixed and forbidden terminal-side policies', () => {
    expect(displayTerminalSideCanSwitch(edge(), 'source', 'top')).toBe(true);
    expect(displayTerminalSideCanSwitch(
      edge({ sourceHandleLocked: true }),
      'source',
      'right',
    )).toBe(true);
    expect(displayTerminalSideCanSwitch(
      edge({ sourceHandleLocked: true }),
      'source',
      'top',
    )).toBe(false);
    expect(displayTerminalSideCanSwitch(
      edge({ targetPortPolicy: 'forbidden' }),
      'target',
      'left',
    )).toBe(false);
    expect(displayTerminalSideCanSwitch(
      edge({ runtimeHandleLock: { source: true } }),
      'source',
      'top',
    )).toBe(true);
    expect(displayTerminalSideCanSwitch(
      edge({ manualHandles: { source: true } }),
      'source',
      'top',
    )).toBe(false);
  });

  it('bridges a computed path and keeps tree-routing metadata synchronized', () => {
    const path = [
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 250 },
      { x: 300, y: 250 },
    ];
    const bridged = withDisplayPortBridge(edge({
      computedPath: [],
      treeRouting: { points: [], routingMode: 'tree' },
    }), path, 'right', 'left');

    expect(bridged.sourceHandle).toBe('right');
    expect(bridged.targetHandle).toBe('left');
    expect(getDisplayComputedPath(bridged)).toEqual(path);
    expect((bridged.data as any).treeRouting).toMatchObject({
      effectiveSourceHandle: 'right',
      effectiveTargetHandle: 'left',
      points: path,
      routingMode: 'tree',
    });
    expect((bridged.data as any).terminalPortBridgeRepaired).toBe(true);
  });

  it('preserves exact compound handle ids during a same-side geometry repair', () => {
    const source: Edge = {
      ...edge({
        manualHandles: { source: true, target: true },
        treeRouting: { points: [] },
      }),
      sourceHandle: 'source-right-port-1',
      targetHandle: 'target-left-port-1',
    };
    const path = [{ x: 100, y: 50 }, { x: 300, y: 50 }];
    const bridged = withDisplayPortBridge(source, path, 'right', 'left');

    expect(bridged.sourceHandle).toBe('source-right-port-1');
    expect(bridged.targetHandle).toBe('target-left-port-1');
    expect((bridged.data as any).treeRouting).toMatchObject({
      effectiveSourceHandle: 'source-right-port-1',
      effectiveTargetHandle: 'target-left-port-1',
      points: path,
    });
  });

  it('allows router-owned compound runtime handles to adopt a new side', () => {
    const source: Edge = {
      ...edge({ runtimeHandleLock: { source: true, target: true } }),
      sourceHandle: 'source-right-runtime',
      targetHandle: 'target-left-runtime',
    };
    const bridged = withDisplayPortBridge(
      source,
      [{ x: 50, y: 100 }, { x: 50, y: 300 }],
      'bottom',
      'top',
    );

    expect(bridged.sourceHandle).toBe('bottom');
    expect(bridged.targetHandle).toBe('top');
  });

  it('detects a declared-side axis mismatch at a terminal', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(displayTerminalRoleNeedsDeclaredAxisRepair(
      edge(),
      [{ x: 100, y: 50 }, { x: 148, y: 50 }, { x: 300, y: 50 }],
      'source',
      rect,
    )).toBe(false);
    expect(displayTerminalRoleNeedsDeclaredAxisRepair(
      edge(),
      [{ x: 100, y: 50 }, { x: 100, y: 98 }, { x: 300, y: 98 }],
      'source',
      rect,
    )).toBe(true);
  });

  it('keeps an outward source breakout valid at an exact node corner', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };

    expect(displayTerminalRoleNeedsDeclaredAxisRepair(
      edge(),
      [{ x: 100, y: 100 }, { x: 148, y: 100 }, { x: 300, y: 100 }],
      'source',
      rect,
    )).toBe(false);
  });

  it('preserves a terminal tangent while adding an outward declared-axis stub', () => {
    const rect = { x: 2651.2, y: 1204.5, width: 144, height: 96 };
    const path = [
      { x: 2795, y: 1301 },
      { x: 2795, y: 1373 },
      { x: 2827, y: 1373 },
      { x: 2827, y: 1706 },
      { x: 3135, y: 1706 },
    ];

    const candidates = buildDeclaredTerminalAxisStubCandidates(
      path,
      'source',
      rect,
      'right',
      48,
      3,
    );

    expect(candidates[0]).toEqual([
      { x: 2795.2, y: 1301 },
      { x: 2843.2, y: 1301 },
      { x: 2843.2, y: 1706 },
      { x: 3135, y: 1706 },
    ]);
    expect(candidates).toHaveLength(3);
    expect(candidates.every(candidate => candidate[candidate.length - 1].x === 3135)).toBe(true);
  });

  it('orders left-target axis stubs from the nearest outward lane', () => {
    const candidates = buildDeclaredTerminalAxisStubCandidates(
      [
        { x: 100, y: 50 },
        { x: 300, y: 50 },
        { x: 300, y: 100 },
      ],
      'target',
      { x: 300, y: 50, width: 100, height: 100 },
      'left',
      48,
      3,
    );

    expect(candidates.map(candidate => candidate[candidate.length - 2].x))
      .toEqual([252, 228, 204]);
    expect(candidates.every(candidate => candidate.at(-1)?.x === 300)).toBe(true);
  });

  it('builds bounded outer-port variants around a perpendicular crossing', () => {
    const edges = [edge({
      computedPath: [
        { x: 100, y: 50 },
        { x: 300, y: 50 },
      ],
    })];
    const primary: DisplaySegment = {
      edgeIndex: 1,
      segmentIndex: 0,
      axis: 'v',
      direction: 1,
      a: { x: 200, y: -50 },
      b: { x: 200, y: 150 },
    };
    const companion: DisplaySegment = {
      edgeIndex: 0,
      segmentIndex: 0,
      axis: 'h',
      direction: 1,
      a: { x: 100, y: 50 },
      b: { x: 300, y: 50 },
    };

    const variants = buildCrossingCompanionOuterPortVariants(
      edges,
      primary,
      companion,
      [node('source', 0, 0, 100, 100), node('target', 300, 0, 100, 100)],
    );

    expect(variants).toHaveLength(2);
    expect(variants.map(variant => [variant[0].sourceHandle, variant[0].targetHandle]))
      .toEqual([['top', 'top'], ['bottom', 'bottom']]);
    for (const variant of variants) {
      const path = getDisplayComputedPath(variant[0]);
      expect(path).toHaveLength(4);
      expect(path[1].y).toBe(path[2].y);
      expect(path[1].y < 0 || path[1].y > 100).toBe(true);
    }
  });

});
