import type { Edge } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { buildSharedNodeTerminalSideCandidates } from './baseReactFlowSharedNodePortRoleRepair';
import type { DisplayPoint, DisplayRect } from './baseReactFlowDisplayGeometry';
import { displayTerminalSideCanSwitch } from './baseReactFlowDisplayTerminalPolicy';
import { withDisplayPortBridge } from './baseReactFlowDisplayTerminalPortBridge';

const TERMINAL_SIDES = ['top', 'bottom', 'left', 'right'] as const;
const MAX_VARIANTS_PER_SIDE = 1;
const MAX_PAIRED_CANDIDATES = 16;

type TerminalSide = typeof TERMINAL_SIDES[number];

type PairedTerminalCandidate = Readonly<{
  edge: Edge;
  sourceVariant: number;
  targetVariant: number;
  sourceSide: TerminalSide;
  targetSide: TerminalSide;
}>;

const oppositeSide = (side: ReturnType<typeof normalizeHandle>): TerminalSide | null => {
  if (side === 'l') return 'right';
  if (side === 'r') return 'left';
  if (side === 't') return 'bottom';
  if (side === 'b') return 'top';
  return null;
};

const pairPriority = (
  sourceSide: TerminalSide,
  targetSide: TerminalSide,
  oppositeSource: TerminalSide | null,
  oppositeTarget: TerminalSide | null,
): number => {
  if (sourceSide === oppositeSource && targetSide === oppositeTarget) return 0;
  const oppositeMatches = Number(sourceSide === oppositeSource) + Number(targetSide === oppositeTarget);
  if (oppositeMatches === 1) return 1;
  const facing = (
    (sourceSide === 'left' && targetSide === 'right')
    || (sourceSide === 'right' && targetSide === 'left')
    || (sourceSide === 'top' && targetSide === 'bottom')
    || (sourceSide === 'bottom' && targetSide === 'top')
  );
  return facing ? 2 : 3;
};

/**
 * Builds an atomic two-terminal transaction for feedback edges whose current
 * source and target ports are both occupied by the forward-flow bundle. A
 * one-ended repair cannot be committed because the untouched end remains a
 * declared-axis defect; breadth-first variant ordering keeps every side pair
 * reachable before spending budget on secondary lane variants.
 */
export const buildPairedTerminalPortRoleCandidates = ({
  edge,
  path,
  sourceRect,
  targetRect,
}: {
  edge: Edge;
  path: DisplayPoint[];
  sourceRect: DisplayRect;
  targetRect: DisplayRect;
}): Edge[] => {
  const candidates: PairedTerminalCandidate[] = [];
  const seen = new Set<string>();
  const oppositeSource = oppositeSide(normalizeHandle(edge.sourceHandle));
  const oppositeTarget = oppositeSide(normalizeHandle(edge.targetHandle));
  const sidePairs = TERMINAL_SIDES.flatMap(sourceSide => (
    TERMINAL_SIDES.map(targetSide => ({ sourceSide, targetSide }))
  )).sort((first, second) => (
    pairPriority(first.sourceSide, first.targetSide, oppositeSource, oppositeTarget)
      - pairPriority(second.sourceSide, second.targetSide, oppositeSource, oppositeTarget)
    || TERMINAL_SIDES.indexOf(first.sourceSide) - TERMINAL_SIDES.indexOf(second.sourceSide)
    || TERMINAL_SIDES.indexOf(first.targetSide) - TERMINAL_SIDES.indexOf(second.targetSide)
  ));

  for (const { sourceSide, targetSide } of sidePairs) {
    if (candidates.length >= MAX_PAIRED_CANDIDATES) break;
    if (!displayTerminalSideCanSwitch(edge, 'source', sourceSide)) continue;
    if (!displayTerminalSideCanSwitch(edge, 'target', targetSide)) continue;
    const sourcePaths = buildSharedNodeTerminalSideCandidates(
      path,
      'source',
      sourceRect,
      sourceSide,
      48,
      MAX_VARIANTS_PER_SIDE,
    );
    sourcePaths.forEach((sourcePath, sourceVariant) => {
      buildSharedNodeTerminalSideCandidates(
        sourcePath,
        'target',
        targetRect,
        targetSide,
        48,
        MAX_VARIANTS_PER_SIDE,
      ).forEach((candidatePath, targetVariant) => {
        const key = `${sourceSide}:${targetSide}:${candidatePath
          .map(point => `${point.x}:${point.y}`)
          .join('|')}`;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({
          edge: withDisplayPortBridge(edge, candidatePath, sourceSide, targetSide),
          sourceVariant,
          targetVariant,
          sourceSide,
          targetSide,
        });
      });
    });
  }

  return candidates
    .sort((first, second) => (
      first.sourceVariant + first.targetVariant
        - (second.sourceVariant + second.targetVariant)
      || first.sourceVariant - second.sourceVariant
      || first.targetVariant - second.targetVariant
      || pairPriority(first.sourceSide, first.targetSide, oppositeSource, oppositeTarget)
        - pairPriority(second.sourceSide, second.targetSide, oppositeSource, oppositeTarget)
      || TERMINAL_SIDES.indexOf(first.sourceSide) - TERMINAL_SIDES.indexOf(second.sourceSide)
      || TERMINAL_SIDES.indexOf(first.targetSide) - TERMINAL_SIDES.indexOf(second.targetSide)
    ))
    .slice(0, MAX_PAIRED_CANDIDATES)
    .map(candidate => candidate.edge);
};
