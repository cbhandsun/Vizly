import type { Edge } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import * as edgeStrictCrossingGuard from '../../../strategies/shared/edgeStrictCrossingGuard';
import * as waypointCandidateRepair from '../../../strategies/shared/edgeWaypointCandidateRepair';
import * as displayEvaluation from '../baseReactFlowDisplayEvaluation';
import * as terminalValidation from '../baseReactFlowTerminalValidation';
import { createAtomicRouteTransactionEvaluation } from '../baseReactFlowDisplayAtomicTransactionEvaluation';
import { createStrictCrossingRepairDiagnostics } from '../baseReactFlowDisplayStrictResidualRepair';
import { buildSafeEndpointSideStepCandidates } from '../baseReactFlowDisplayEndpointStubCandidates';
import {
  countRenderUnsafeEndpointStubs,
  repairFinalShortEndpointStubs,
  repairRenderSafeEndpointStubs,
} from '../baseReactFlowDisplayEndpointStubRepair';

const edgeWithPath = (
  id: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath },
});

describe('baseReactFlowDisplayEndpointStubRepair', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves candidate order and does not mutate the input path', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 100 },
      { x: 200, y: 100 },
    ];
    const edges = [edgeWithPath('candidate-order', path)];
    const originalPath = structuredClone(path);

    const candidates = buildSafeEndpointSideStepCandidates(path, 0, edges, []);

    expect(path).toEqual(originalPath);
    expect(candidates).toHaveLength(16);
    expect(candidates.slice(0, 6)).toEqual([
      [
        { x: 0, y: 0 },
        { x: -48, y: 0 },
        { x: -48, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: -72, y: 0 },
        { x: -72, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: -96, y: 0 },
        { x: -96, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: 48, y: 0 },
        { x: 48, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: 72, y: 0 },
        { x: 72, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: 96, y: 0 },
        { x: 96, y: 100 },
        { x: 200, y: 100 },
      ],
    ]);
  });

  it('extends both render-unsafe terminal stubs without regressing hard quality', () => {
    const edges = [edgeWithPath('short-both', [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 100 },
      { x: 252, y: 100 },
      { x: 252, y: 0 },
      { x: 300, y: 0 },
    ])];
    const baselineQuality = calculateEdgePathQualityScore(edges);

    const repaired = repairRenderSafeEndpointStubs(edges, []);
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    const repairedPath = (repaired[0].data as any).computedPath;

    expect(repaired).not.toBe(edges);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(0);
    expect(repairedPath).toEqual([
      { x: 0, y: 0 },
      { x: 56, y: 0 },
      { x: 56, y: 100 },
      { x: 244, y: 100 },
      { x: 244, y: 0 },
      { x: 300, y: 0 },
    ]);
    expect(repairedQuality.nonOrthogonalSegments).toBeLessThanOrEqual(
      baselineQuality.nonOrthogonalSegments,
    );
    expect(repairedQuality.strictCrossings).toBeLessThanOrEqual(baselineQuality.strictCrossings);
  });

  it('rejects a longer stub when it would introduce a strict crossing', () => {
    const short = edgeWithPath('short-source', [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 100 },
      { x: 300, y: 100 },
    ]);
    const blocker = edgeWithPath('blocker', [
      { x: 52, y: -20 },
      { x: 52, y: 20 },
    ]);
    const edges = [short, blocker];

    const diagnostics = createStrictCrossingRepairDiagnostics();
    const repaired = repairRenderSafeEndpointStubs(
      edges,
      [],
      64,
      undefined,
      undefined,
      diagnostics,
    );

    expect(repaired).toBe(edges);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(1);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
    expect(diagnostics.strictFallbackInvocationCount).toBeGreaterThan(0);
    expect(diagnostics.residualRepairInvocationCount).toBeGreaterThan(0);
    expect(diagnostics.duplicateVariantReferenceCount).toBeGreaterThan(0);
    expect(diagnostics.knownQualityStrictReuseCount).toBeGreaterThan(0);
  });

  it('does not run strict fallback repairs after the evaluation budget is exhausted', () => {
    const short = edgeWithPath('budgeted-short-source', [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 100 },
      { x: 300, y: 100 },
    ]);
    const blocker = edgeWithPath('budgeted-blocker', [
      { x: 52, y: -20 },
      { x: 52, y: 20 },
    ]);
    const diagnostics = createStrictCrossingRepairDiagnostics();

    const repaired = repairRenderSafeEndpointStubs(
      [short, blocker],
      [],
      1,
      undefined,
      undefined,
      diagnostics,
    );

    expect(repaired).toEqual([short, blocker]);
    expect(diagnostics.strictFallbackInvocationCount).toBe(1);
    expect(diagnostics.strictSweepInvocationCount).toBe(0);
    expect(diagnostics.residualRepairInvocationCount).toBe(0);
  });

  it('preserves identity for an unchanged path and never mutates a repaired input', () => {
    const cleanEdges = [edgeWithPath('already-safe', [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 100 },
      { x: 236, y: 100 },
      { x: 236, y: 0 },
      { x: 300, y: 0 },
    ])];
    const unsafeEdges = [edgeWithPath('immutable-input', [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 100 },
      { x: 252, y: 100 },
      { x: 252, y: 0 },
      { x: 300, y: 0 },
    ])];
    const originalUnsafePath = structuredClone(
      (unsafeEdges[0].data as any).computedPath,
    );

    expect(repairRenderSafeEndpointStubs(cleanEdges, [])).toBe(cleanEdges);

    const repaired = repairRenderSafeEndpointStubs(unsafeEdges, []);
    expect(repaired).not.toBe(unsafeEdges);
    expect((unsafeEdges[0].data as any).computedPath).toEqual(originalUnsafePath);
  });

  it('reuses initial short-stub evidence for the first bounded variant', () => {
    const qualitySpy = vi.spyOn(displayEvaluation, 'evaluateDisplayQualityCandidate');
    const obstacleSpy = vi.spyOn(displayEvaluation, 'evaluateDisplayObstacleCandidate');
    const edges = [edgeWithPath('short-evidence', [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 100 },
      { x: 300, y: 100 },
    ])];

    const repaired = repairFinalShortEndpointStubs(edges, []);

    expect(repaired).not.toBe(edges);
    expect(calculateEdgePathQualityScore(repaired).shortEndpointStubs).toBe(0);
    expect(qualitySpy).toHaveBeenCalledTimes(8);
    expect(obstacleSpy).toHaveBeenCalledTimes(8);
  });

  it('does not initialize repair contexts for an already render-safe route', () => {
    const clearanceSpy = vi.spyOn(
      waypointCandidateRepair,
      'createNodeClearanceGraphEvaluationContext',
    );
    const qualityContextSpy = vi.spyOn(
      edgeStrictCrossingGuard,
      'createEdgePathQualityEvaluationContext',
    );
    const obstacleContextSpy = vi.spyOn(
      displayEvaluation,
      'createDisplayObstacleEvaluationContext',
    );
    const terminalValidationSpy = vi.spyOn(
      terminalValidation,
      'createDisplayTerminalValidationSnapshot',
    );
    const cleanEdges = [edgeWithPath('safe-fast-path', [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 100 },
      { x: 300, y: 100 },
    ])];

    expect(repairRenderSafeEndpointStubs(cleanEdges, [])).toBe(cleanEdges);
    expect(clearanceSpy).not.toHaveBeenCalled();
    expect(qualityContextSpy).not.toHaveBeenCalled();
    expect(obstacleContextSpy).not.toHaveBeenCalled();
    expect(terminalValidationSpy).not.toHaveBeenCalled();
  });

  it('reuses transaction evaluation contexts across a multi-pass repair', () => {
    const clearanceSpy = vi.spyOn(
      waypointCandidateRepair,
      'createNodeClearanceGraphEvaluationContext',
    );
    const qualityContextSpy = vi.spyOn(
      edgeStrictCrossingGuard,
      'createEdgePathQualityEvaluationContext',
    );
    const obstacleContextSpy = vi.spyOn(
      displayEvaluation,
      'createDisplayObstacleEvaluationContext',
    );
    const terminalValidationSpy = vi.spyOn(
      terminalValidation,
      'createDisplayTerminalValidationSnapshot',
    );
    const edges = [
      edgeWithPath('first-short', [
        { x: 0, y: 0 },
        { x: 48, y: 0 },
        { x: 48, y: 100 },
        { x: 300, y: 100 },
      ]),
      edgeWithPath('second-short', [
        { x: 0, y: 200 },
        { x: 48, y: 200 },
        { x: 48, y: 300 },
        { x: 300, y: 300 },
      ]),
    ];

    const repaired = repairRenderSafeEndpointStubs(edges, []);

    expect(repaired).not.toBe(edges);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(0);
    expect(clearanceSpy).toHaveBeenCalledTimes(1);
    expect(qualityContextSpy).toHaveBeenCalledTimes(1);
    expect(obstacleContextSpy).toHaveBeenCalledTimes(1);
    expect(terminalValidationSpy).toHaveBeenCalledTimes(1);
  });

  it('reuses only an exact current quality state in the atomic gate', () => {
    const baseline = [edgeWithPath('atomic-state', [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 100 },
    ])];
    const candidate = [edgeWithPath('atomic-state', [
      { x: 0, y: 0 },
      { x: 72, y: 0 },
      { x: 72, y: 100 },
    ])];
    const staleCandidate = [edgeWithPath('atomic-state', [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 100 },
    ])];
    const qualityContext = edgeStrictCrossingGuard
      .createEdgePathQualityEvaluationContext(baseline);
    const baselineState = qualityContext.createState(baseline);
    const candidateState = qualityContext.evaluateStateChanged(
      baselineState,
      candidate,
      [0],
    );
    const staleState = qualityContext.evaluateStateChanged(
      baselineState,
      staleCandidate,
      [0],
    );
    const foreignBaseline = [edgeWithPath('atomic-state', [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 100 },
    ])];
    const foreignContext = edgeStrictCrossingGuard
      .createEdgePathQualityEvaluationContext(foreignBaseline);
    const foreignState = foreignContext.evaluateStateChanged(
      foreignContext.createState(foreignBaseline),
      candidate,
      [0],
    );
    const evaluateStateChanged = vi.fn(qualityContext.evaluateStateChanged);
    const atomic = createAtomicRouteTransactionEvaluation(baseline, [], {
      qualityContext: { ...qualityContext, evaluateStateChanged },
      baselineQuality: baselineState.score,
      baselineQualityState: baselineState,
    });

    expect(atomic.evaluate(candidate, [0], candidateState).quality)
      .toEqual(candidateState.score);
    expect(evaluateStateChanged).not.toHaveBeenCalled();

    expect(atomic.evaluate(candidate, [0], foreignState).quality)
      .toEqual(candidateState.score);
    expect(evaluateStateChanged).toHaveBeenCalledTimes(1);
    expect(atomic.evaluate(candidate, [0], staleState).quality)
      .toEqual(candidateState.score);
    expect(atomic.evaluate(candidate, [0]).quality).toEqual(candidateState.score);
    expect(evaluateStateChanged).toHaveBeenCalledTimes(3);
  });
});
