import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createBaseReactFlowDisplayMicroSafetyContext } from '../../../components/shared/baseReactFlowDisplayMicroSafety';
import { countDisplayObstacleHits } from '../../../components/shared/baseReactFlowDisplayEvaluation';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from '../../../components/shared/baseReactFlowTerminalAxisRepair';
import {
  calculateEdgePathQualityScore,
} from '../edgeStrictCrossingGuard';
import {
  createDisplayMicroCleanupDiagnostics,
  repairDisplayMicroArtifacts,
} from '../edgeDisplayMicroCleanup';

type Point = { x: number; y: number };

const node = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Node & { positionAbsolute: Point } => ({
  id,
  position: { x, y },
  positionAbsolute: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

const edge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  computedPath: Point[],
): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  type: 'advanced-smart-step',
  data: { computedPath, layoutPathLocked: true },
});

const measuredNodes: Node[] = [
  node('order-center', 1120.25, 605, 406, 197),
  node('warehouse', 42, 962, 420, 236),
  node('warehouse-control', 32, 1358, 420, 236),
  node('transport', 1113.25, 962, 420, 236),
  node('customs', 1853.25, 981.5, 420, 197),
  node('billing', 772, 1377.5, 378, 197),
  node('yard', 1470, 1377.5, 389, 197),
  node('carrier', 1608.4875, 80, 322, 197),
  node('visibility', 1579.6875, 1922, 420, 236),
  node('upstream', 985.4875, 119, 303, 119),
  node('downstream', 2250.4875, 119, 336, 119),
];

const compoundCleanupFixture = (): Edge[] => [
  edge('customs-flow', 'order-center', 'customs', 'bottom', 'top', [
    { x: 1323, y: 803 },
    { x: 1323, y: 885 },
    { x: 2063, y: 885 },
    { x: 2063, y: 981 },
  ]),
  edge('transport-flow', 'order-center', 'transport', 'bottom', 'top', [
    { x: 1323, y: 803 },
    { x: 1323, y: 962 },
  ]),
  edge('visibility-flow', 'order-center', 'visibility', 'bottom', 'top', [
    { x: 1275, y: 803 },
    { x: 1275, y: 899 },
    { x: 18, y: 899 },
    { x: 18, y: 1825 },
    { x: 1790, y: 1825 },
    { x: 1790, y: 1921 },
  ]),
  edge('warehouse-flow', 'order-center', 'warehouse', 'bottom', 'top', [
    { x: 1323, y: 803 },
    { x: 1323, y: 899 },
    { x: 1306, y: 899 },
    { x: 1306, y: 905 },
    { x: 252, y: 905 },
    { x: 252, y: 961 },
  ]),
  edge('transport-billing-flow', 'transport', 'billing', 'left', 'top', [
    { x: 1113.25, y: 1187 },
    { x: 1024, y: 1187 },
    { x: 1024, y: 1377 },
  ]),
  edge('carrier-flow', 'transport', 'carrier', 'top', 'bottom', [
    { x: 1306, y: 961 },
    { x: 1306, y: 865 },
    { x: 1323, y: 865 },
    { x: 1323, y: 877 },
    { x: 1769, y: 877 },
    { x: 1769, y: 278 },
  ]),
  edge('downstream-flow', 'transport', 'downstream', 'bottom', 'bottom', [
    { x: 1323, y: 1198 },
    { x: 1323, y: 1294 },
    { x: 2422, y: 1294 },
    { x: 2422, y: 239 },
  ]),
  edge('transport-visibility-flow', 'transport', 'visibility', 'bottom', 'top', [
    { x: 1306, y: 1199 },
    { x: 1306, y: 1825 },
    { x: 1790, y: 1825 },
    { x: 1790, y: 1921 },
  ]),
  edge('yard-flow', 'transport', 'yard', 'bottom', 'top', [
    { x: 1306, y: 1199 },
    { x: 1306, y: 1295 },
    { x: 1665, y: 1295 },
    { x: 1665, y: 1377 },
  ]),
  edge('upstream-flow', 'upstream', 'order-center', 'bottom', 'top', [
    { x: 1137, y: 239 },
    { x: 1137, y: 328 },
    { x: 1323, y: 328 },
    { x: 1323, y: 604 },
  ]),
  edge('visibility-downstream-flow', 'visibility', 'downstream', 'top', 'bottom', [
    { x: 1916, y: 1922 },
    { x: 1916, y: 1827 },
    { x: 2474, y: 1827 },
    { x: 2474, y: 239 },
  ]),
  edge('warehouse-billing-flow', 'warehouse', 'billing', 'bottom', 'top', [
    { x: 252, y: 1199 },
    { x: 252, y: 1295 },
    { x: 898, y: 1295 },
    { x: 898, y: 1377 },
  ]),
  edge('warehouse-visibility-flow', 'warehouse', 'visibility', 'bottom', 'top', [
    { x: 247, y: 1199 },
    { x: 247, y: 1295 },
    { x: 537, y: 1295 },
    { x: 537, y: 1825 },
    { x: 1790, y: 1825 },
    { x: 1790, y: 1921 },
  ]),
  edge('warehouse-control-flow', 'warehouse', 'warehouse-control', 'bottom', 'top', [
    { x: 242, y: 1199 },
    { x: 242, y: 1357 },
  ]),
];

describe('edgeDisplayMicroCleanup node safety', () => {
  it('rejects compound peer shifts that trade tiny doglegs for node hits or terminal regressions', () => {
    const baseline = compoundCleanupFixture();
    const terminalSnapshot = createDisplayTerminalValidationSnapshot(measuredNodes);
    const baselineTerminals = getDisplayTerminalValidationReport(baseline, terminalSnapshot);
    const compoundDiagnostics = createDisplayMicroCleanupDiagnostics();
    const unguarded = repairDisplayMicroArtifacts(baseline, undefined, compoundDiagnostics);

    expect(countDisplayObstacleHits(baseline, measuredNodes)).toBe(0);
    expect(baselineTerminals.allAttached).toBe(true);
    expect(baselineTerminals.allAnchored).toBe(true);
    expect(countDisplayObstacleHits(unguarded, measuredNodes)).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(unguarded).tinyInteriorDoglegs)
      .toBeLessThan(calculateEdgePathQualityScore(baseline).tinyInteriorDoglegs);

    const singleEdgeDiagnostics = createDisplayMicroCleanupDiagnostics();
    repairDisplayMicroArtifacts(
      baseline,
      undefined,
      singleEdgeDiagnostics,
      { allowCompoundRepairs: false },
    );
    expect(singleEdgeDiagnostics.generatedCandidateCount)
      .toBeLessThan(compoundDiagnostics.generatedCandidateCount);

    const safetyContext = createBaseReactFlowDisplayMicroSafetyContext(
      baseline,
      measuredNodes,
    );
    const guarded = repairDisplayMicroArtifacts(baseline, safetyContext);
    const guardedTerminals = getDisplayTerminalValidationReport(guarded, terminalSnapshot);

    expect(countDisplayObstacleHits(guarded, measuredNodes)).toBe(0);
    expect(guardedTerminals.allAttached).toBe(true);
    expect(guardedTerminals.allAnchored).toBe(true);
    expect(calculateEdgePathQualityScore(guarded).strictCrossings)
      .toBeLessThanOrEqual(calculateEdgePathQualityScore(baseline).strictCrossings);
  });

  it('falls back to exact full safety evaluation for invalid deltas and handles empty graphs', () => {
    const baseline = compoundCleanupFixture();
    const context = createBaseReactFlowDisplayMicroSafetyContext(baseline, measuredNodes);
    const candidate = repairDisplayMicroArtifacts(baseline);

    expect(context.evaluate(candidate, [-1])).toEqual(context.evaluate(candidate));

    const emptyContext = createBaseReactFlowDisplayMicroSafetyContext([], []);
    expect(emptyContext.baseline).toEqual({
      obstacleHits: 0,
      attachedTerminals: 0,
      anchoredTerminals: 0,
    });
    expect(repairDisplayMicroArtifacts([], emptyContext)).toEqual([]);
  });
});
