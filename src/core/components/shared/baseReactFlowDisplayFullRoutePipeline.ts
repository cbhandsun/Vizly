import type { Edge } from '@xyflow/react';

import { prepareBaseReactFlowFullRouteSeed } from './baseReactFlowDisplayFullRouteSeedPhase';
import { createBaseReactFlowFullRouteQualityEdges } from './baseReactFlowDisplayFullRouteQualityPhase';
import { runBaseReactFlowFullRoutePostRenderPhase } from './baseReactFlowDisplayFullRoutePostRenderPhase';
import { runBaseReactFlowFullRouteStrictPhase } from './baseReactFlowDisplayFullRouteStrictPhase';
import { runBaseReactFlowFullRouteTerminalPhase } from './baseReactFlowDisplayFullRouteTerminalPhase';
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
  const seedResult = prepareBaseReactFlowFullRouteSeed(args);
  seedTimer.finish(seedResult.kind === 'finalized' ? 'accepted' : 'skip');
  if (seedResult.kind === 'finalized') return seedResult.edges;

  const { context } = seedResult;
  const qualityTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const qualityEdges = createBaseReactFlowFullRouteQualityEdges(context);
  qualityTimer.finish('accepted', qualityEdges.length);
  const postRenderTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const postRenderResult = runBaseReactFlowFullRoutePostRenderPhase(context, qualityEdges);
  postRenderTimer.finish(postRenderResult.kind === 'finalized' ? 'accepted' : 'skip');
  if (postRenderResult.kind === 'finalized') return postRenderResult.edges;

  const strictTimer = startDisplayRoutingPhaseTrace({
    phase: 'strict',
    candidateCount,
    onTrace: args.onPhaseTrace,
  });
  const strictResult = runBaseReactFlowFullRouteStrictPhase(
    context,
    postRenderResult.edges,
    postRenderResult.quality,
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
