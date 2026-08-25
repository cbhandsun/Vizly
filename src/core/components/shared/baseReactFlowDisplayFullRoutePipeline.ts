import type { Edge } from '@xyflow/react';

import { prepareBaseReactFlowFullRouteSeed } from './baseReactFlowDisplayFullRouteSeedPhase';
import { createBaseReactFlowFullRouteQualityEdges } from './baseReactFlowDisplayFullRouteQualityPhase';
import { runBaseReactFlowFullRoutePostRenderPhase } from './baseReactFlowDisplayFullRoutePostRenderPhase';
import { runBaseReactFlowFullRouteStrictPhase } from './baseReactFlowDisplayFullRouteStrictPhase';
import { runBaseReactFlowFullRouteTerminalPhase } from './baseReactFlowDisplayFullRouteTerminalPhase';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { repairCrossedSpineWithOuterSkirt } from './baseReactFlowDisplayCrossedSpineSkirtRepair';
import { createDisplayRoutingDefectPlan } from './baseReactFlowDisplayRoutingDefectPlan';
import type {
  BaseReactFlowDisplayEdgesArgs,
  BaseReactFlowPreDisplayFinalEdgesFactory,
} from './baseReactFlowDisplayFullRouteTypes';
import { diffBaseReactFlowEvaluationMetrics } from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export type {
  BaseReactFlowDisplayEdgesArgs,
  BaseReactFlowPreDisplayFinalEdgesFactory,
} from './baseReactFlowDisplayFullRouteTypes';
export { selectBaseReactFlowFullRouteSeedEdges } from './baseReactFlowDisplayFullRouteSeedPhase';

export const createBaseReactFlowFullRouteEdges = (args: BaseReactFlowDisplayEdgesArgs & {
  createPreDisplayFinalEdges?: BaseReactFlowPreDisplayFinalEdgesFactory;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): Edge[] => {
  const candidateCount = args.edges.length;
  const seedTimer = startDisplayRoutingPhaseTrace({
    phase: 'seed',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const seedMetricsBefore = args.evaluationSession?.readMetrics();
  const seedPhaseTrace: DisplayRoutingPhaseTrace[] = [];
  const seedResult = prepareBaseReactFlowFullRouteSeed({
    ...args,
    onSeedPhaseTrace: trace => seedPhaseTrace.push(trace),
  });
  const seedEvaluation = seedResult.kind === 'continue'
    ? seedResult.context.evaluationSession
    : args.evaluationSession;
  seedTimer.finish(
    seedResult.kind === 'finalized' ? 'accepted' : 'skip',
    undefined,
    seedMetricsBefore && seedEvaluation
      ? diffBaseReactFlowEvaluationMetrics(seedMetricsBefore, seedEvaluation.readMetrics())
      : undefined,
  );
  seedPhaseTrace.forEach(trace => args.onPhaseTrace?.(trace));
  if (seedResult.kind === 'finalized') return seedResult.edges;

  const { context } = seedResult;
  const qualityTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const qualityMetricsBefore = context.evaluationSession.readMetrics();
  const qualityEdges = createBaseReactFlowFullRouteQualityEdges(context);
  const qualityReport = context.evaluationSession.hardReport(qualityEdges);
  const defectPlan = createDisplayRoutingDefectPlan(qualityReport);
  if (defectPlan.needsStrictCrossingRepair) {
    const earlyClosureTimer = startDisplayRoutingPhaseTrace({
      phase: 'final-safety-closure',
      parentPhase: 'quality',
      candidateCount,
      onTrace: args.onPhaseTrace,
    });
    const earlyClosedEdges = repairCrossedSpineWithOuterSkirt(
      qualityEdges,
      context.repairNodes,
    );
    const earlyClosedReport = earlyClosedEdges === qualityEdges
      ? qualityReport
      : context.evaluationSession.hardReport(earlyClosedEdges);
    const earlyClosed = earlyClosedReport.hardClean
      && countRenderUnsafeEndpointStubs(earlyClosedEdges) === 0;
    earlyClosureTimer.finish(earlyClosed ? 'accepted' : 'fallback', earlyClosed ? earlyClosedEdges.length : 0);
    if (earlyClosed) {
      qualityTimer.finish(
        'accepted',
        earlyClosedEdges.length,
        diffBaseReactFlowEvaluationMetrics(
          qualityMetricsBefore,
          context.evaluationSession.readMetrics(),
        ),
      );
      return earlyClosedEdges;
    }
  }
  const qualityChangedEdgeCount = countChangedRoutingItems(
    context.normalizedEdges,
    qualityEdges,
  );
  qualityTimer.finish(
    qualityChangedEdgeCount === 0 ? 'skip' : 'accepted',
    qualityChangedEdgeCount,
    diffBaseReactFlowEvaluationMetrics(
      qualityMetricsBefore,
      context.evaluationSession.readMetrics(),
    ),
  );
  if (defectPlan.onlyTerminalAxisDefects) {
    const terminalTimer = startDisplayRoutingPhaseTrace({
      phase: 'terminal',
      candidateCount,
      onTrace: args.onPhaseTrace,
    });
    const terminalEdges = runBaseReactFlowFullRouteTerminalPhase(context, qualityEdges);
    terminalTimer.finish('accepted', terminalEdges.length);
    return terminalEdges;
  }
  const postRenderTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const postRenderMetricsBefore = context.evaluationSession.readMetrics();
  const postRenderResult = runBaseReactFlowFullRoutePostRenderPhase(
    context,
    qualityEdges,
    qualityReport,
  );
  if (postRenderResult.kind === 'finalized') {
    postRenderTimer.finish(
      'accepted',
      postRenderResult.edges.length,
      diffBaseReactFlowEvaluationMetrics(
        postRenderMetricsBefore,
        context.evaluationSession.readMetrics(),
      ),
    );
    return postRenderResult.edges;
  }
  if (postRenderResult.quality.strictCrossings > 0) {
    const postRenderClosureTimer = startDisplayRoutingPhaseTrace({
      phase: 'final-safety-closure',
      parentPhase: 'post-render',
      candidateCount,
      onTrace: args.onPhaseTrace,
    });
    const postRenderClosedEdges = repairCrossedSpineWithOuterSkirt(
      postRenderResult.edges,
      context.repairNodes,
    );
    const postRenderClosedReport = context.evaluationSession.hardReport(postRenderClosedEdges);
    const postRenderClosed = postRenderClosedReport.hardClean
      && countRenderUnsafeEndpointStubs(postRenderClosedEdges) === 0;
    postRenderClosureTimer.finish(
      postRenderClosed ? 'accepted' : 'fallback',
      postRenderClosed ? postRenderClosedEdges.length : 0,
    );
    if (postRenderClosed) {
      postRenderTimer.finish(
        'accepted',
        postRenderClosedEdges.length,
        diffBaseReactFlowEvaluationMetrics(
          postRenderMetricsBefore,
          context.evaluationSession.readMetrics(),
        ),
      );
      return postRenderClosedEdges;
    }
  }
  postRenderTimer.finish(
    'skip',
    undefined,
    diffBaseReactFlowEvaluationMetrics(
      postRenderMetricsBefore,
      context.evaluationSession.readMetrics(),
    ),
  );

  const postRenderDefectPlan = createDisplayRoutingDefectPlan(
    context.evaluationSession.hardReport(postRenderResult.edges),
  );
  if (postRenderResult.edges.length <= 24 && postRenderDefectPlan.terminalClosureEligible) {
    const terminalTimer = startDisplayRoutingPhaseTrace({
      phase: 'terminal',
      candidateCount,
      onTrace: args.onPhaseTrace,
    });
    const terminalMetricsBefore = context.evaluationSession.readMetrics();
    const terminalEdges = runBaseReactFlowFullRouteTerminalPhase(
      context,
      postRenderResult.edges,
    );
    terminalTimer.finish(
      'accepted',
      terminalEdges.length,
      diffBaseReactFlowEvaluationMetrics(
        terminalMetricsBefore,
        context.evaluationSession.readMetrics(),
      ),
    );
    return terminalEdges;
  }

  const strictTimer = startDisplayRoutingPhaseTrace({
    phase: 'strict',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const strictMetricsBefore = context.evaluationSession.readMetrics();
  const strictResult = runBaseReactFlowFullRouteStrictPhase(
    context,
    postRenderResult.edges,
    postRenderResult.quality,
    postRenderResult.skipInitialStrictOverlapRepair,
  );
  strictTimer.finish(
    strictResult.kind === 'finalized' ? 'accepted' : 'fallback',
    undefined,
    diffBaseReactFlowEvaluationMetrics(
      strictMetricsBefore,
      context.evaluationSession.readMetrics(),
    ),
  );
  if (strictResult.kind === 'finalized') return strictResult.edges;
  const terminalTimer = startDisplayRoutingPhaseTrace({
    phase: 'terminal',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const terminalMetricsBefore = context.evaluationSession.readMetrics();
  const terminalEdges = runBaseReactFlowFullRouteTerminalPhase(context, strictResult.edges);
  terminalTimer.finish(
    'accepted',
    terminalEdges.length,
    diffBaseReactFlowEvaluationMetrics(
      terminalMetricsBefore,
      context.evaluationSession.readMetrics(),
    ),
  );
  return terminalEdges;
};
