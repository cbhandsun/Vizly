import type { Edge } from '@xyflow/react';

import { findDisplayStrictCrossingHits } from './baseReactFlowDisplayGeometry';

/** Marks a bounded isolated shortcut crossing for request-local quality identity. */
export const withDisplayLocalShortcutSoftCrossingBridge = (
  candidateEdge: Edge,
  candidateEdges: Edge[],
  savedLength: number,
): Edge => {
  if (
    candidateEdge.data?.isTreeBus !== true
    || candidateEdges.length > 32
    || savedLength < 320
  ) return candidateEdge;

  const hits = findDisplayStrictCrossingHits(candidateEdges);
  if (hits.length === 0 || hits.length > 2) return candidateEdge;
  const lineHops = `;${hits.map((hit) => {
    const horizontal = hit.a.axis === 'h' ? hit.a : hit.b;
    const vertical = hit.a.axis === 'v' ? hit.a : hit.b;
    return `${vertical.a.x},${horizontal.a.y}`;
  }).join(';')};`;

  return {
    ...candidateEdge,
    data: { ...candidateEdge.data, h: lineHops },
  };
};
