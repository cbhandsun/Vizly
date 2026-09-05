import type { Edge } from '@xyflow/react';
import type { EdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import type { DisplaySegment } from './baseReactFlowDisplayGeometry';
import { displayCrossingClusterCrossingPairSignature } from './baseReactFlowDisplayCrossingClusterGeometry';

export type BeamState<T extends Edge[]> = {
  edges: T;
  segments: DisplaySegment[];
  quality: EdgePathQualityScore;
  obstacleHits: number;
  changedIndexes: number[];
  signature: string;
};
export const MAX_BEAM_WIDTH = 8;

export const compareBeamStates = <T extends Edge[]>(first: BeamState<T>, second: BeamState<T>): number => (
  first.quality.strictCrossings - second.quality.strictCrossings
  || first.obstacleHits - second.obstacleHits
  || first.changedIndexes.length - second.changedIndexes.length
  || first.quality.bends - second.quality.bends
  || first.quality.totalLength - second.quality.totalLength
);

/**
 * A residual crossing can migrate from one edge pair to another while a valid
 * multi-edge repair is being assembled. Keeping only the globally shortest
 * partial paths tends to discard that progress because all intermediate
 * states can still have the same strict-crossing count. Preserve a small,
 * deterministic sample across both crossing topology and changed-edge sets,
 * then fill the remaining beam slots by the normal quality ordering.
 */
export const selectDiverseBeamStates = <T extends Edge[]>(states: BeamState<T>[]): BeamState<T>[] => {
  const sorted = [...states].sort(compareBeamStates);
  const selected: BeamState<T>[] = [];
  const selectedSignatures = new Set<string>();
  const crossingPairs = new Set<string>();
  const changedSets = new Set<string>();
  const append = (state: BeamState<T>): void => {
    if (selected.length >= MAX_BEAM_WIDTH || selectedSignatures.has(state.signature)) return;
    selectedSignatures.add(state.signature);
    selected.push(state);
  };

  for (const state of sorted) {
    const pairSignature = displayCrossingClusterCrossingPairSignature(state.segments);
    if (crossingPairs.has(pairSignature)) continue;
    crossingPairs.add(pairSignature);
    append(state);
    if (selected.length >= Math.min(4, MAX_BEAM_WIDTH)) break;
  }

  for (const state of sorted) {
    const changedSet = state.changedIndexes.join(':');
    if (changedSets.has(changedSet)) continue;
    changedSets.add(changedSet);
    append(state);
    if (selected.length >= Math.min(6, MAX_BEAM_WIDTH)) break;
  }

  for (const state of sorted) append(state);
  return selected;
};
