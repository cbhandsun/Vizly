import type { Edge } from '@xyflow/react';

import { getSegments } from '../../strategies/shared/edgePathQualityGeometry';
import { createReusableEdgePathQualitySegmentIndex } from '../../strategies/shared/edgePathQualitySegmentIndex';
import { getDisplayComputedPath } from './baseReactFlowDisplayGeometry';

const displayPathsEqual = (first: Edge, second: Edge): boolean => {
  const firstPath = getDisplayComputedPath(first);
  const secondPath = getDisplayComputedPath(second);
  return firstPath.length === secondPath.length
    && firstPath.every((point, index) => (
      point.x === secondPath[index]?.x
      && point.y === secondPath[index]?.y
    ));
};

export const changedDisplayPathIndexes = (
  baseline: Edge[],
  candidate: Edge[],
): number[] => {
  if (
    baseline.length !== candidate.length
    || baseline.some((edge, index) => edge.id !== candidate[index]?.id)
  ) {
    return candidate.map((_, index) => index);
  }
  return candidate.flatMap((edge, index) => (
    displayPathsEqual(baseline[index], edge) ? [] : [index]
  ));
};

export const collectDisplayRoutingAffectedEdgeIndexes = (
  baseline: Edge[],
  derivative: Edge[],
): number[] => {
  const changedIndexes = changedDisplayPathIndexes(baseline, derivative);
  if (changedIndexes.length === 0) return [];
  if (baseline.length !== derivative.length) return changedIndexes;

  const paths = derivative.map(getDisplayComputedPath);
  const allSegments = getSegments(paths);
  const edgeSegments = derivative.map((_, edgeIndex) => (
    allSegments.filter(segment => segment.edgeIndex === edgeIndex)
  ));
  const segmentIndex = createReusableEdgePathQualitySegmentIndex(edgeSegments);
  const candidateIndexes = new Set(changedIndexes);
  const changedSet = new Set(changedIndexes);
  for (const changedIndex of changedIndexes) {
    const changedEdge = derivative[changedIndex];
    const query = segmentIndex.queryPotentialEdgeIndexes(
      edgeSegments[changedIndex] ?? [],
      changedSet,
    );
    query.edgeIndexes.forEach(index => candidateIndexes.add(index));
    derivative.forEach((edge, index) => {
      if (
        index !== changedIndex
        && (
          edge.source === changedEdge.source
          || edge.target === changedEdge.target
        )
      ) candidateIndexes.add(index);
    });
  }
  return [...candidateIndexes].sort((first, second) => first - second);
};
