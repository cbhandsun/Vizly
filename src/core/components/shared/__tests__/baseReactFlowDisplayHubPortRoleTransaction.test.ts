import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { countStrictEdgeCrossings } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  repairBoundedHubPortRoleTransaction,
  type BoundedHubPortRoleTransactionDiagnostics,
} from '../baseReactFlowDisplayHubPortRoleTransaction';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from '../baseReactFlowTerminalAxisRepair';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  measured: { width, height } as any,
  style: { width, height },
  data: {},
});

const edge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  data: { computedPath },
});

describe('repairBoundedHubPortRoleTransaction', () => {
  it('moves a crossing companion to another role on its shared hub', () => {
    const nodes = [
      node('hub', 0, 0, 100, 100),
      node('primary-destination', 0, -200, 100, 100),
      node('left-system', -30, 125, 50, 50),
      node('right-system', 80, 125, 50, 50),
      node('companion-source', 250, 275, 50, 50),
    ];
    const seed = [
      edge('hub-outgoing', 'hub', 'primary-destination', 'top', 'bottom', [
        { x: 50, y: 0 },
        { x: 50, y: -100 },
      ]),
      edge('primary-crossing', 'left-system', 'right-system', 'right', 'left', [
        { x: 20, y: 150 },
        { x: 80, y: 150 },
      ]),
      edge('hub-incoming', 'companion-source', 'hub', 'left', 'bottom', [
        { x: 250, y: 300 },
        { x: 202, y: 300 },
        { x: 202, y: 200 },
        { x: 50, y: 200 },
        { x: 50, y: 100 },
      ]),
    ];

    expect(countStrictEdgeCrossings(seed)).toBe(1);

    const diagnostics: BoundedHubPortRoleTransactionDiagnostics = {};
    const repaired = repairBoundedHubPortRoleTransaction(seed, nodes, seed, {
      primaryEdgeIndexes: [0, 1],
      diagnostics,
    });

    expect(repaired).not.toBe(seed);
    expect(countStrictEdgeCrossings(repaired)).toBe(0);
    expect(repaired[2].targetHandle).not.toBe('bottom');
    expect(diagnostics).toMatchObject({ reason: 'accepted', evaluations: expect.any(Number) });
    expect(diagnostics.roles?.[0]?.selectedBySide.right).toBeGreaterThan(0);
    expect(getDisplayTerminalValidationReport(
      repaired,
      createDisplayTerminalValidationSnapshot(nodes),
    )).toMatchObject({ allAttached: true, allAnchored: true });
  });

  it('rejects invalid or unbounded primary selections without changing edges', () => {
    const edges: Edge[] = [];
    expect(repairBoundedHubPortRoleTransaction(edges, [], edges, {
      primaryEdgeIndexes: [Number.NaN, -1, 99],
    })).toBe(edges);
  });
});
