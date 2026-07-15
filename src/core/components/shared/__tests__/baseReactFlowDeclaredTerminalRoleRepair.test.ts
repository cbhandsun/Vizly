import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildDeclaredTerminalRoleRepairPaths,
  repairDeclaredTerminalRolesWithHardGate,
  repairDeclaredTerminalRolesWithHardGateWithOutcome,
} from '../baseReactFlowDeclaredTerminalRoleRepair';
import { getDisplayComputedPath, getDisplayNodeRect } from '../baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { displayTerminalRoleNeedsDeclaredAxisRepair } from '../baseReactFlowDisplayTerminalPortCandidates';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from '../baseReactFlowTerminalAxisRepair';
import { node } from './baseReactFlowDisplayEdges.testUtils';

const nodes = (): Node[] => [
  node('source', 700, 500, 100, 80),
  node('target', 100, 850, 140, 120),
];

const axisMismatchedEdge = (): Edge => ({
  id: 'axis-mismatched',
  source: 'source',
  target: 'target',
  sourceHandle: 'left',
  targetHandle: 'right',
  data: {
    computedPath: [
      { x: 700, y: 540 },
      { x: 640, y: 540 },
      { x: 640, y: 980 },
      { x: 240, y: 980 },
      { x: 240, y: 910 },
    ],
  },
});

describe('baseReactFlowDeclaredTerminalRoleRepair', () => {
  it('builds a target-right outward stub by reconnecting to an existing prefix lane', () => {
    const graphNodes = nodes();
    const edge = axisMismatchedEdge();
    const targetRect = getDisplayNodeRect(graphNodes[1]);
    expect(targetRect).not.toBeNull();

    const candidates = buildDeclaredTerminalRoleRepairPaths(
      getDisplayComputedPath(edge),
      'target',
      targetRect!,
      'right',
    );

    expect(candidates.some(path => {
      const endpoint = path.at(-1)!;
      const stub = path.at(-2)!;
      const bridge = path.at(-3)!;
      return endpoint.x === targetRect!.x + targetRect!.width
        && stub.x - endpoint.x >= 56
        && stub.y === endpoint.y
        && bridge.x === stub.x;
    })).toBe(true);
  });

  it('atomically repairs an ordinarily anchored target that violates its declared right handle', () => {
    const graphNodes = nodes();
    const edge = axisMismatchedEdge();
    const terminalSnapshot = createDisplayTerminalValidationSnapshot(graphNodes);
    expect(getDisplayTerminalValidationReport([edge], terminalSnapshot).allAnchored).toBe(true);
    expect(displayTerminalRoleNeedsDeclaredAxisRepair(
      edge,
      getDisplayComputedPath(edge),
      'target',
      getDisplayNodeRect(graphNodes[1])!,
    )).toBe(true);

    const repaired = repairDeclaredTerminalRolesWithHardGate([edge], graphNodes);
    const repairedPath = getDisplayComputedPath(repaired[0]);
    const endpoint = repairedPath.at(-1)!;
    const stub = repairedPath.at(-2)!;

    expect(repaired).not.toEqual([edge]);
    expect(stub.y).toBe(endpoint.y);
    expect(stub.x - endpoint.x).toBeGreaterThanOrEqual(56);
    expect(getDisplayHardQualityGateReport(repaired, graphNodes, 'polished').hardClean).toBe(true);
  });

  it('keeps the original graph when every declared outward stub hits a blocker', () => {
    const graphNodes = [
      ...nodes(),
      node('blocker', 250, 830, 120, 160),
    ];
    const edges = [axisMismatchedEdge()];

    const repaired = repairDeclaredTerminalRolesWithHardGate(edges, graphNodes);

    expect(repaired).toBe(edges);
  });

  it('reports zero consumed evaluations when terminal preconditions reject the graph', () => {
    const graphNodes = nodes();
    const detachedEdge: Edge = {
      ...axisMismatchedEdge(),
      data: {
        computedPath: [
          { x: 680, y: 540 },
          { x: 640, y: 540 },
          { x: 640, y: 980 },
          { x: 240, y: 980 },
          { x: 240, y: 910 },
        ],
      },
    };
    const edges = [detachedEdge];

    const outcome = repairDeclaredTerminalRolesWithHardGateWithOutcome(
      edges,
      graphNodes,
      64,
    );

    expect(outcome.edges).toBe(edges);
    expect(outcome.exactEvaluations).toBe(0);
  });

  it('reports the actual bounded evaluations while preserving the legacy edge-only API', () => {
    const graphNodes = nodes();
    const edge = axisMismatchedEdge();
    const outcome = repairDeclaredTerminalRolesWithHardGateWithOutcome(
      [edge],
      graphNodes,
      64,
    );

    expect(outcome.exactEvaluations).toBeGreaterThan(0);
    expect(outcome.exactEvaluations).toBeLessThanOrEqual(64);
    expect(getDisplayHardQualityGateReport(outcome.edges, graphNodes, 'polished').hardClean).toBe(true);
    expect(repairDeclaredTerminalRolesWithHardGate([edge], graphNodes, 64)).toEqual(outcome.edges);
  });
});
