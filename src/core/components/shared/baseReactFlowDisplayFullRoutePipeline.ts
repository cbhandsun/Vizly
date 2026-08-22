import type { Edge } from '@xyflow/react';

import { prepareBaseReactFlowFullRouteSeed } from './baseReactFlowDisplayFullRouteSeedPhase';
import { createBaseReactFlowFullRouteQualityEdges } from './baseReactFlowDisplayFullRouteQualityPhase';
import { runBaseReactFlowFullRoutePostRenderPhase } from './baseReactFlowDisplayFullRoutePostRenderPhase';
import { runBaseReactFlowFullRouteStrictPhase } from './baseReactFlowDisplayFullRouteStrictPhase';
import { runBaseReactFlowFullRouteTerminalPhase } from './baseReactFlowDisplayFullRouteTerminalPhase';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { repairCrossedSpineWithOuterSkirt } from './baseReactFlowDisplayCrossedSpineSkirtRepair';
import { createDisplayRoutingDefectPlan } from './baseReactFlowDisplayRoutingDefectPlan';
import type {
  BaseReactFlowDisplayEdgesArgs,
  BaseReactFlowPreDisplayFinalEdgesFactory,
} from './baseReactFlowDisplayFullRouteTypes';
import {
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
  const seedPhaseTrace: DisplayRoutingPhaseTrace[] = [];
  const seedResult = prepareBaseReactFlowFullRouteSeed({
    ...args,
    onSeedPhaseTrace: trace => seedPhaseTrace.push(trace),
  });
  seedTimer.finish(seedResult.kind === 'finalized' ? 'accepted' : 'skip');
  seedPhaseTrace.forEach(trace => args.onPhaseTrace?.(trace));
  if (seedResult.kind === 'finalized') return seedResult.edges;

  const { context } = seedResult;
  const qualityTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const qualityEdges = createBaseReactFlowFullRouteQualityEdges(context);
  qualityTimer.finish('accepted', qualityEdges.length);
  const qualityReport = getDisplayHardQualityGateReport(
    qualityEdges,
    context.repairNodes,
    'polished',
  );
  const defectPlan = createDisplayRoutingDefectPlan(qualityReport);
  if (defectPlan.needsStrictCrossingRepair) {
    const earlyClosureTimer = startDisplayRoutingPhaseTrace({
      phase: 'final-safety-closure',
      candidateCount,
      onTrace: args.onPhaseTrace,
    });
    const earlyClosedEdges = repairCrossedSpineWithOuterSkirt(
      qualityEdges,
      context.repairNodes,
    );
    const earlyClosedReport = earlyClosedEdges === qualityEdges
      ? qualityReport
      : getDisplayHardQualityGateReport(
          earlyClosedEdges,
          context.repairNodes,
          'polished',
        );
    const earlyClosed = earlyClosedReport.hardClean
      && countRenderUnsafeEndpointStubs(earlyClosedEdges) === 0;
    earlyClosureTimer.finish(earlyClosed ? 'accepted' : 'fallback', earlyClosed ? earlyClosedEdges.length : 0);
    if (earlyClosed) return earlyClosedEdges;
  }
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
  const postRenderResult = runBaseReactFlowFullRoutePostRenderPhase(
    context,
    qualityEdges,
    qualityReport,
  );
  postRenderTimer.finish(postRenderResult.kind === 'finalized' ? 'accepted' : 'skip');
  if (postRenderResult.kind === 'finalized') return postRenderResult.edges;
  if (postRenderResult.quality.strictCrossings > 0) {
    const postRenderClosureTimer = startDisplayRoutingPhaseTrace({
      phase: 'final-safety-closure',
      candidateCount,
      onTrace: args.onPhaseTrace,
    });
    const postRenderClosedEdges = repairCrossedSpineWithOuterSkirt(
      postRenderResult.edges,
      context.repairNodes,
    );
    const postRenderClosedReport = getDisplayHardQualityGateReport(
      postRenderClosedEdges,
      context.repairNodes,
      'polished',
    );
    const postRenderClosed = postRenderClosedReport.hardClean
      && countRenderUnsafeEndpointStubs(postRenderClosedEdges) === 0;
    postRenderClosureTimer.finish(
      postRenderClosed ? 'accepted' : 'fallback',
      postRenderClosed ? postRenderClosedEdges.length : 0,
    );
    if (postRenderClosed) return postRenderClosedEdges;
  }

  const strictTimer = startDisplayRoutingPhaseTrace({
    phase: 'strict',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const strictResult = runBaseReactFlowFullRouteStrictPhase(
    context,
    postRenderResult.edges,
    postRenderResult.quality,
    postRenderResult.skipInitialStrictOverlapRepair,
  );
  strictTimer.finish(strictResult.kind === 'finalized' ? 'accepted' : 'fallback');
  if (strictResult.kind === 'finalized') return strictResult.edges;
  const terminalTimer = startDisplayRoutingPhaseTrace({
    phase: 'terminal',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const terminalEdges = runBaseReactFlowFullRouteTerminalPhase(context, strictResult.edges);
  terminalTimer.finish('accepted', terminalEdges.length);
  return terminalEdges;
};
