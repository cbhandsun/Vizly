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

export type {
  BaseReactFlowDisplayEdgesArgs,
  BaseReactFlowPreDisplayFinalEdgesFactory,
} from './baseReactFlowDisplayFullRouteTypes';
export { selectBaseReactFlowFullRouteSeedEdges } from './baseReactFlowDisplayFullRouteSeedPhase';

export const createBaseReactFlowFullRouteEdges = (args: BaseReactFlowDisplayEdgesArgs & {
  createPreDisplayFinalEdges?: BaseReactFlowPreDisplayFinalEdgesFactory;
}): Edge[] => {
  const seedResult = prepareBaseReactFlowFullRouteSeed(args);
  if (seedResult.kind === 'finalized') return seedResult.edges;

  const { context } = seedResult;
  const qualityEdges = createBaseReactFlowFullRouteQualityEdges(context);
  const postRenderResult = runBaseReactFlowFullRoutePostRenderPhase(context, qualityEdges);
  if (postRenderResult.kind === 'finalized') return postRenderResult.edges;

  const strictResult = runBaseReactFlowFullRouteStrictPhase(
    context,
    postRenderResult.edges,
    postRenderResult.quality,
  );
  if (strictResult.kind === 'finalized') return strictResult.edges;
  return runBaseReactFlowFullRouteTerminalPhase(context, strictResult.edges);
};
