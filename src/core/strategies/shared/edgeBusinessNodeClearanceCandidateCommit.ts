import type { Edge } from '@xyflow/react';

import type { EdgePathQualityScore } from './edgeStrictCrossingGuard';

type Point = { x: number; y: number };

export const withBusinessNodeClearancePath = (edge: Edge, path: Point[]): Edge => {
  const data: Record<string, unknown> = {
    ...(edge.data ?? {}),
    computedPath: path,
    displayNodeClearanceRepaired: true,
  };
  const treeRouting = data.treeRouting;
  if (treeRouting && typeof treeRouting === 'object' && !Array.isArray(treeRouting)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  return { ...edge, data };
};

export const businessNodeClearanceHardQualityDoesNotRegress = (
  before: EdgePathQualityScore,
  after: EdgePathQualityScore,
  allowTransientStrictCrossing = false,
): boolean => after.nonOrthogonalSegments <= before.nonOrthogonalSegments
  && after.strictCrossings <= before.strictCrossings + (allowTransientStrictCrossing ? 1 : 0)
  && after.reverseOverlap <= before.reverseOverlap
  && after.unrelatedOverlap <= before.unrelatedOverlap
  && after.unexplainedRelatedOverlap <= before.unexplainedRelatedOverlap
  && after.shortEndpointStubs <= before.shortEndpointStubs
  && after.tinyInteriorDoglegs <= before.tinyInteriorDoglegs
  && after.hairpins <= before.hairpins;
