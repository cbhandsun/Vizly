import type { Edge } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import * as edgeStrictCrossingGuard from '../../../strategies/shared/edgeStrictCrossingGuard';
import * as waypointCandidateRepair from '../../../strategies/shared/edgeWaypointCandidateRepair';
import * as displayEvaluation from '../baseReactFlowDisplayEvaluation';
import * as terminalValidation from '../baseReactFlowTerminalValidation';
import * as stubCandidates from '../baseReactFlowDisplayEndpointStubCandidates';
import * as terminalPortRepair from '../baseReactFlowDisplayTerminalPortRepair';
import * as strictSweep from '../baseReactFlowDisplayStrictSweepRepair';
import { createAtomicRouteTransactionEvaluation } from '../baseReactFlowDisplayAtomicTransactionEvaluation';
import { createStrictCrossingRepairDiagnostics } from '../baseReactFlowDisplayStrictResidualRepair';
import { buildSharedRenderSafeStubCandidate } from '../baseReactFlowDisplaySharedStubCandidate';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { buildSafeEndpointSideStepCandidates } from '../baseReactFlowDisplayEndpointStubCandidates';
import {
  commercialClearanceRiskIsGloballyMinimal,
  countRenderUnsafeEndpointStubs,
  repairFinalShortEndpointStubs,
  repairRenderSafeEndpointStubs,
  renderSafeEndpointStubRepairUsesGlobalStrictFallback,
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

  it('recognizes only finite non-negative zero commercial risk as globally minimal', () => {
    expect(commercialClearanceRiskIsGloballyMinimal(0)).toBe(true);
    expect(commercialClearanceRiskIsGloballyMinimal(1e-6)).toBe(true);
    expect(commercialClearanceRiskIsGloballyMinimal(1e-6 + Number.EPSILON)).toBe(false);
    expect(commercialClearanceRiskIsGloballyMinimal(-Number.EPSILON)).toBe(false);
    expect(commercialClearanceRiskIsGloballyMinimal(Number.NaN)).toBe(false);
    expect(commercialClearanceRiskIsGloballyMinimal(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('keeps global strict fallback bounded to small endpoint repair transactions', () => {
    expect(renderSafeEndpointStubRepairUsesGlobalStrictFallback(0)).toBe(true);
    expect(renderSafeEndpointStubRepairUsesGlobalStrictFallback(36)).toBe(true);
    expect(renderSafeEndpointStubRepairUsesGlobalStrictFallback(37)).toBe(false);
    expect(renderSafeEndpointStubRepairUsesGlobalStrictFallback(-1)).toBe(false);
    expect(renderSafeEndpointStubRepairUsesGlobalStrictFallback(Number.NaN)).toBe(false);
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

  it.each([
    [false, false, false], [true, false, false], [false, true, false], [true, true, false],
    [false, false, true], [true, false, true], [false, true, true], [true, true, true],
  ])('extends an exact shared trunk (transpose=%s, reflect=%s, target=%s)', (transpose, reflect, target) => {
    const point = (x: number, y: number) => {
      const horizontal = reflect ? -x : x;
      return transpose ? { x: y, y: horizontal } : { x: horizontal, y };
    };
    const orient = (edge: Edge): Edge => target ? {
      ...edge, source: edge.target, target: edge.source,
      data: { ...edge.data, computedPath: [...getDisplayComputedPath(edge)].reverse() },
    } : edge;
    const primary = { ...edgeWithPath('shared-primary', [
      point(0, 0), point(55, 0), point(55, 100), point(300, 100),
    ]), source: 'shared' };
    const sibling = { ...edgeWithPath('shared-sibling', [
      point(0, 0), point(55, 0), point(55, 50), point(400, 50), point(400, 200), point(500, 200),
    ]), source: 'shared' };
    const baseline = [orient(primary), orient(sibling)];
    const before = structuredClone(baseline);
    const repaired = repairRenderSafeEndpointStubs(baseline, []);
    expect(baseline).toEqual(before);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(0);
    expect(calculateEdgePathQualityScore(repaired)).toMatchObject({
      strictCrossings: 0, unexplainedRelatedOverlap: 0, tinyInteriorDoglegs: 0, hairpins: 0,
    });
    const primaryExpected = [
      point(0, 0), point(56, 0), point(56, 100), point(300, 100),
    ];
    const siblingExpected = [
      point(0, 0), point(56, 0), point(56, 50), point(400, 50), point(400, 200), point(500, 200),
    ];
    expect(repaired[0].data?.computedPath).toEqual(target ? primaryExpected.reverse() : primaryExpected);
    expect(repaired[1].data?.computedPath).toEqual(target ? siblingExpected.reverse() : siblingExpected);
  });

  it('does not synthesize a shared stub for missing, invalid or distinct terminals', () => {
    const primary = edgeWithPath('primary', [
      { x: 0, y: 0 }, { x: 55, y: 0 }, { x: 55, y: 100 }, { x: 300, y: 100 },
    ]);
    const proposed = edgeWithPath('primary', [
      { x: 0, y: 0 }, { x: 56, y: 0 }, { x: 56, y: 100 }, { x: 300, y: 100 },
    ]);
    const empty: Edge[] = [];
    expect(buildSharedRenderSafeStubCandidate(empty, empty, 0)).toBe(empty);
    const invalid: Edge = { ...primary, data: { computedPath: [{ x: Infinity, y: 0 }] } };
    for (const sibling of [
      edgeWithPath('unrelated', getDisplayComputedPath(primary)),
      { ...primary, id: 'missing-path', data: {} },
      { ...invalid, id: 'invalid' },
      { ...primary, id: 'different-anchor', data: { computedPath: [
        { x: 0, y: 1 }, { x: 55, y: 1 }, { x: 55, y: 100 }, { x: 300, y: 100 },
      ] } },
    ]) {
      const baseline = [primary, sibling];
      const candidate = [proposed, sibling];
      expect(buildSharedRenderSafeStubCandidate(baseline, candidate, 0)).toBe(candidate);
      expect(buildSharedRenderSafeStubCandidate(baseline, candidate, Number.NaN)).toBe(candidate);
    }
    const candidate = [proposed];
    expect(buildSharedRenderSafeStubCandidate([invalid], candidate, 0)).toBe(candidate);
    expect(buildSharedRenderSafeStubCandidate([], candidate, 0)).toBe(candidate);
  });

  it('moves intermediate shared bends without moving longer trunks or endpoints', () => {
    const edge = (id: string, stub: number) => ({ ...edgeWithPath(id, [
      { x: 0, y: 0 }, { x: stub, y: 0 }, { x: stub, y: 100 }, { x: 300, y: 100 },
    ]), source: 'shared' });
    const baseline = [edge('primary', 48), edge('intermediate', 55), edge('longer', 72)];
    const candidate = [edge('primary', 56), ...baseline.slice(1)];
    const before = structuredClone({ baseline, candidate });
    const shared = buildSharedRenderSafeStubCandidate(baseline, candidate, 0);
    expect(shared[0]).toBe(candidate[0]);
    expect(getDisplayComputedPath(shared[1])).toEqual(getDisplayComputedPath(edge('intermediate', 56)));
    expect(shared[2]).toBe(baseline[2]);
    expect({ baseline, candidate }).toEqual(before);
    const reversed = [edge('primary', -56), ...baseline.slice(1)];
    expect(buildSharedRenderSafeStubCandidate(baseline, reversed, 0)).toBe(reversed);
    const shorter = [edge('primary', 40), ...baseline.slice(1)];
    expect(buildSharedRenderSafeStubCandidate(baseline, shorter, 0)).toBe(shorter);
  });


  it('skips expensive strict tiers after a zero-risk companion closes the crossing', () => {
    const short = edgeWithPath('companion-short-source', [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 100 },
      { x: 300, y: 100 },
    ]);
    const movableBlocker = edgeWithPath('movable-blocker', [
      { x: 40, y: -20 },
      { x: 52, y: -20 },
      { x: 52, y: 20 },
      { x: 64, y: 20 },
    ]);
    const edges = [short, movableBlocker];
    const diagnostics = createStrictCrossingRepairDiagnostics();

    const repaired = repairRenderSafeEndpointStubs(
      edges,
      [],
      64,
      undefined,
      undefined,
      diagnostics,
    );

    expect(repaired).not.toBe(edges);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(0);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
    expect(diagnostics.strictFallbackInvocationCount).toBe(1);
    expect(diagnostics.strictSweepInvocationCount).toBe(0);
    expect(diagnostics.residualRepairInvocationCount).toBe(0);
  });

  it('keeps the formal 48px baseline when strict fallback is disabled', () => {
    const short = edgeWithPath('commercial-preference-short', [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 100 },
      { x: 300, y: 100 },
    ]);
    const movableBlocker = edgeWithPath('commercial-preference-blocker', [
      { x: 40, y: -20 },
      { x: 52, y: -20 },
      { x: 52, y: 20 },
      { x: 64, y: 20 },
    ]);
    const edges = [short, movableBlocker];
    const baselineUnsafeStubCount = countRenderUnsafeEndpointStubs(edges);
    const diagnostics = createStrictCrossingRepairDiagnostics();

    const repaired = repairRenderSafeEndpointStubs(
      edges,
      [],
      64,
      undefined,
      undefined,
      diagnostics,
      false,
    );

    expect(repaired).toBe(edges);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(baselineUnsafeStubCount);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
    expect(diagnostics.strictFallbackInvocationCount).toBe(0);
    expect(diagnostics.strictSweepInvocationCount).toBe(0);
    expect(diagnostics.residualRepairInvocationCount).toBe(0);
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

  it.each([0, 6, 7, 8, 100])('materializes the strict fallback only inside the budget with %i companions', companionCount => {
    const edges = [edgeWithPath('lazy-short-stub', [
      { x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 100 }, { x: 300, y: 100 },
    ])];
    const original = structuredClone(edges);
    const candidatePath = [
      { x: 0, y: 0 }, { x: 64, y: 0 }, { x: 64, y: 100 }, { x: 300, y: 100 },
    ];
    vi.spyOn(stubCandidates, 'buildSafeEndpointSideStepCandidates').mockReturnValue([candidatePath]);
    const candidateQuality = { ...calculateEdgePathQualityScore(edges), strictCrossings: 1, shortEndpointStubs: 0 };
    vi.spyOn(displayEvaluation, 'evaluateDisplayQualityCandidate').mockReturnValue(candidateQuality);
    vi.spyOn(terminalPortRepair, 'buildStrictCrossingCompanionShiftVariants')
      .mockImplementation(candidate => Array.from({ length: companionCount }, () => candidate));
    const sweep = vi.spyOn(strictSweep, 'finalStrictDisplaySweep').mockImplementation(candidate => candidate);

    expect(repairFinalShortEndpointStubs(edges, [])).toBe(edges);
    expect(sweep).toHaveBeenCalledTimes(companionCount < 7 ? 1 : 0);
    expect(edges).toEqual(original);
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
