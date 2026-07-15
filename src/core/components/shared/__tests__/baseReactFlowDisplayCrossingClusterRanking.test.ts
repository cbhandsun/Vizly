import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  DISPLAY_CROSSING_CLUSTER_ENDPOINT_STUB,
  DISPLAY_CROSSING_CLUSTER_MAX_LOCAL_CANDIDATES,
  rankDisplayCrossingClusterCandidates,
  type DisplayCrossingClusterLocalCandidate,
} from '../baseReactFlowDisplayCrossingClusterRanking';

const legacyRankCandidates = (
  candidates: DisplayCrossingClusterLocalCandidate[],
  primaryCorridorAxis: 'x' | 'y',
): DisplayCrossingClusterLocalCandidate[] => {
  const sorted = [...candidates].sort((first, second) => (
    first.obstacleHits - second.obstacleHits
    || first.strictCrossings - second.strictCrossings
    || first.unrelatedOverlap - second.unrelatedOverlap
    || first.length - second.length
    || first.path.length - second.path.length
    || first.pairRank - second.pairRank
  ));
  const selected: DisplayCrossingClusterLocalCandidate[] = [];
  const selectedSignatures = new Set<string>();
  const append = (candidate: DisplayCrossingClusterLocalCandidate | undefined): void => {
    if (!candidate || selected.length >= DISPLAY_CROSSING_CLUSTER_MAX_LOCAL_CANDIDATES) return;
    const signature = `${String(candidate.sourceHandle)}:${String(candidate.targetHandle)}:${candidate.pathSignature}`;
    if (selectedSignatures.has(signature)) return;
    selectedSignatures.add(signature);
    selected.push(candidate);
  };
  const appendPairQuota = (pairRank: number, quota: number, preserveNearAndFar: boolean): void => {
    const pairCandidates = sorted.filter(candidate => candidate.pairRank === pairRank);
    const before = selected.length;
    for (const group of [`${primaryCorridorAxis}-low`, `${primaryCorridorAxis}-high`]) {
      const groupCandidates = pairCandidates.filter(candidate => candidate.group === group);
      const nearest = groupCandidates[0];
      append(nearest);
      if (selected.length - before >= quota) return;
      if (preserveNearAndFar && nearest) {
        append(groupCandidates
          .filter(candidate => (
            candidate.obstacleHits === nearest.obstacleHits
            && candidate.strictCrossings <= nearest.strictCrossings + 2
          ))
          .sort((first, second) => second.laneExcursion - first.laneExcursion)[0]);
        if (selected.length - before >= quota) return;
      }
    }
    for (const group of [
      `${primaryCorridorAxis}-middle`,
      `${primaryCorridorAxis === 'x' ? 'y' : 'x'}-low`,
      `${primaryCorridorAxis === 'x' ? 'y' : 'x'}-high`,
      `${primaryCorridorAxis === 'x' ? 'y' : 'x'}-middle`,
    ]) {
      append(pairCandidates.find(candidate => candidate.group === group));
      if (selected.length - before >= quota) return;
    }
    for (const candidate of pairCandidates) {
      append(candidate);
      if (selected.length - before >= quota) return;
    }
  };
  appendPairQuota(0, 4, true);
  appendPairQuota(1, 2, false);
  appendPairQuota(2, 2, false);
  for (const candidate of sorted) append(candidate);
  const currentPairCandidates = sorted
    .filter(candidate => candidate.pairRank === 0)
    .sort((first, second) => (
      first.obstacleHits - second.obstacleHits
      || first.strictCrossings - second.strictCrossings
      || first.unrelatedOverlap - second.unrelatedOverlap
      || first.length - second.length
    ));
  const outerCurrentPairCandidates = [...currentPairCandidates].sort((first, second) => (
    first.obstacleHits - second.obstacleHits
    || first.strictCrossings - second.strictCrossings
    || first.unrelatedOverlap - second.unrelatedOverlap
    || second.laneExcursion - first.laneExcursion
  ));
  const extendedSourceCandidates = currentPairCandidates
    .filter(candidate => candidate.sourceClearance > DISPLAY_CROSSING_CLUSTER_ENDPOINT_STUB)
    .sort((first, second) => (
      first.obstacleHits - second.obstacleHits
      || first.strictCrossings - second.strictCrossings
      || first.unrelatedOverlap - second.unrelatedOverlap
      || second.sourceClearance - first.sourceClearance
      || first.targetClearance - second.targetClearance
      || second.laneExcursion - first.laneExcursion
    ));
  const extendedTargetCandidates = currentPairCandidates
    .filter(candidate => candidate.targetClearance > DISPLAY_CROSSING_CLUSTER_ENDPOINT_STUB)
    .sort((first, second) => (
      first.obstacleHits - second.obstacleHits
      || first.strictCrossings - second.strictCrossings
      || first.unrelatedOverlap - second.unrelatedOverlap
      || second.targetClearance - first.targetClearance
      || first.sourceClearance - second.sourceClearance
      || second.laneExcursion - first.laneExcursion
    ));
  const preferred = [
    currentPairCandidates[0],
    sorted.find(candidate => candidate.group === 'loop-shortcut'),
    extendedSourceCandidates[0],
    extendedTargetCandidates[0],
    outerCurrentPairCandidates[0],
    selected.find(candidate => candidate.pairRank === 1),
    selected.find(candidate => candidate.pairRank === 2),
  ].filter((candidate): candidate is DisplayCrossingClusterLocalCandidate => Boolean(candidate));
  const ranked: DisplayCrossingClusterLocalCandidate[] = [];
  const rankedSignatures = new Set<string>();
  const appendRanked = (candidate: DisplayCrossingClusterLocalCandidate): void => {
    if (ranked.length >= DISPLAY_CROSSING_CLUSTER_MAX_LOCAL_CANDIDATES) return;
    const signature = `${String(candidate.sourceHandle)}:${String(candidate.targetHandle)}:${candidate.pathSignature}`;
    if (rankedSignatures.has(signature)) return;
    rankedSignatures.add(signature);
    ranked.push(candidate);
  };
  for (const candidate of preferred) appendRanked(candidate);
  for (const candidate of selected) appendRanked(candidate);
  for (const candidate of sorted) appendRanked(candidate);
  return ranked;
};

const materializedEdge = (id: string): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: {},
});

const candidate = (
  index: number,
  overrides: Partial<DisplayCrossingClusterLocalCandidate> = {},
): DisplayCrossingClusterLocalCandidate => ({
  kind: 'materialized',
  edge: materializedEdge(`edge-${index}`),
  group: 'x-low',
  laneExcursion: index,
  length: 100 + index,
  obstacleHits: 0,
  pairRank: index % 3,
  path: [{ x: 0, y: 0 }, { x: index + 1, y: 0 }],
  pathSignature: `path-${index}`,
  sourceHandle: 'right',
  sourceClearance: index % 2 === 0 ? 48 : 96,
  strictCrossings: 0,
  targetHandle: 'left',
  targetClearance: index % 3 === 0 ? 96 : 48,
  unrelatedOverlap: 0,
  ...overrides,
} as DisplayCrossingClusterLocalCandidate);

const seededCandidates = (seed: number, count: number): DisplayCrossingClusterLocalCandidate[] => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const groups = ['x-low', 'x-high', 'x-middle', 'y-low', 'y-high', 'y-middle', 'loop-shortcut'];
  const handles = ['left', 'right', 'top', 'bottom'] as const;
  return Array.from({ length: count }, (_, index) => candidate(index, {
    group: groups[next() % groups.length],
    laneExcursion: next() % 200,
    length: next() % 1_000,
    obstacleHits: next() % 4,
    pairRank: next() % 5,
    path: Array.from(
      { length: (next() % 5) + 2 },
      (_unused, pointIndex) => ({ x: pointIndex, y: index }),
    ),
    pathSignature: `path-${next() % Math.max(1, Math.floor(count * 0.75))}`,
    sourceHandle: handles[next() % handles.length],
    sourceClearance: next() % 2 === 0 ? 48 : 96,
    strictCrossings: next() % 7,
    targetHandle: handles[next() % handles.length],
    targetClearance: next() % 2 === 0 ? 48 : 96,
    unrelatedOverlap: next() % 80,
  }));
};

const expectLegacyParity = (
  candidates: DisplayCrossingClusterLocalCandidate[],
  axis: 'x' | 'y',
): void => {
  const expected = legacyRankCandidates(candidates, axis);
  const actual = rankDisplayCrossingClusterCandidates(candidates, axis);
  expect(actual).toEqual(expected);
  expect(actual).toHaveLength(expected.length);
  actual.forEach((item, index) => expect(item).toBe(expected[index]));
};

describe('display crossing cluster candidate ranking', () => {
  it.each(['x', 'y'] as const)('matches the legacy empty result for %s corridors', (axis) => {
    expectLegacyParity([], axis);
  });

  it.each(['x', 'y'] as const)('retains stable-first order for completely tied %s candidates', (axis) => {
    const tied = Array.from({ length: 20 }, (_, index) => candidate(index, {
      group: `${axis}-low`,
      laneExcursion: 48,
      length: 100,
      obstacleHits: 0,
      pairRank: 0,
      path: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      sourceClearance: 48,
      strictCrossings: 0,
      targetClearance: 48,
      unrelatedOverlap: 0,
    }));
    expectLegacyParity(tied, axis);
  });

  it('matches legacy ordering for extreme finite metrics', () => {
    const huge = Number.MAX_VALUE / 4;
    const values = seededCandidates(0xabad1dea, 40).map((item, index) => ({
      ...item,
      laneExcursion: index % 2 === 0 ? huge : -huge,
      length: index % 3 === 0 ? huge : -huge,
      unrelatedOverlap: index % 5 === 0 ? huge : 0,
    } as DisplayCrossingClusterLocalCandidate));
    expectLegacyParity(values, 'x');
    expectLegacyParity(values, 'y');
  });

  it('falls back to legacy stable-sort semantics for non-finite boundary metrics', () => {
    const values = seededCandidates(0x13579bdf, 24);
    values[1].laneExcursion = Number.POSITIVE_INFINITY;
    values[2].length = Number.NaN;
    values[3].strictCrossings = Number.NEGATIVE_INFINITY;
    expectLegacyParity(values, 'x');
    expectLegacyParity(values, 'y');
  });

  it.each([
    [0x12345678, 1],
    [0x9abcdef0, 8],
    [0x0badcafe, 32],
    [0xdecafbad, 128],
  ])('matches the seeded legacy matrix seed=%i count=%i', (seed, count) => {
    const values = seededCandidates(seed, count);
    expectLegacyParity(values, 'x');
    expectLegacyParity(values, 'y');
  });
});
