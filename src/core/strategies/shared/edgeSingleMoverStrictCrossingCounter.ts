import type { Edge } from '@xyflow/react';
import {
  createStrictCrossingSegmentIndex,
  extractPathSegmentRefs,
  extractPathSegmentRefsForPath,
  findStrictCrossings,
  strictCrossingsForEdgeSegments,
  type Point,
} from './edgeDetachedOverlapGeometry';

/** Exact full-graph count for candidates changing one path in a fixed snapshot. */
export const createSingleMoverStrictCrossingCounter = (
  paths: Point[][],
  edges: Edge[],
  moverIndex: number,
): Readonly<{ baseline: number; count: (path: Point[]) => number }> => {
  if (!Number.isSafeInteger(moverIndex) || moverIndex < 0 || moverIndex >= paths.length
    || paths.length !== edges.length) {
    throw new RangeError('Single mover crossing counter requires a valid graph index');
  }
  const snapshot = paths.map(path => path.map(point => ({ ...point })));
  const hits = findStrictCrossings(snapshot, edges);
  const frozenCrossings = hits.filter(hit => hit.a.edgeIndex !== moverIndex && hit.b.edgeIndex !== moverIndex).length;
  const segments = extractPathSegmentRefs(snapshot, edges).filter(segment => segment.edgeIndex !== moverIndex);
  const index = createStrictCrossingSegmentIndex(segments);
  return {
    baseline: hits.length,
    count: path => frozenCrossings + strictCrossingsForEdgeSegments(
      extractPathSegmentRefsForPath(path, moverIndex, []), segments, moverIndex, index,
    ),
  };
};
