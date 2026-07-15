import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  buildFacingPortPathCandidates,
  type SharedNodePortPoint,
  type SharedNodePortRect,
  type SharedNodePortSide,
} from './baseReactFlowSharedNodePortRoleRepair';
import type { OuterPortTerminalStubProfile } from './baseReactFlowDisplayOuterPortStubProfiles';

const SIDES = new Set<SharedNodePortSide>(['top', 'right', 'bottom', 'left']);

const validRect = (rect: SharedNodePortRect): boolean => (
  Number.isFinite(rect.x)
  && Number.isFinite(rect.y)
  && Number.isFinite(rect.width)
  && Number.isFinite(rect.height)
  && rect.width > 0
  && rect.height > 0
);

const endpoint = (
  rect: SharedNodePortRect,
  side: SharedNodePortSide,
): SharedNodePortPoint => {
  if (side === 'top') return { x: rect.x + rect.width / 2, y: rect.y };
  if (side === 'bottom') return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  if (side === 'left') return { x: rect.x, y: rect.y + rect.height / 2 };
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
};

const outward = (
  point: SharedNodePortPoint,
  side: SharedNodePortSide,
  distance: number,
): SharedNodePortPoint => {
  if (side === 'top') return { x: point.x, y: point.y - distance };
  if (side === 'bottom') return { x: point.x, y: point.y + distance };
  if (side === 'left') return { x: point.x - distance, y: point.y };
  return { x: point.x + distance, y: point.y };
};

const pathSignature = (path: readonly SharedNodePortPoint[]): string => path
  .map(point => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
  .join('|');

const uniquePaths = (paths: SharedNodePortPoint[][]): SharedNodePortPoint[][] => Array.from(
  new Map(paths.map(path => [pathSignature(path), path])).values(),
);

type StubInput = number | OuterPortTerminalStubProfile;

const normalizeStubProfile = (input: StubInput): OuterPortTerminalStubProfile | null => {
  const profile = typeof input === 'number'
    ? { sourceStub: input, targetStub: input }
    : input;
  return Number.isFinite(profile?.sourceStub)
    && profile.sourceStub > 0
    && Number.isFinite(profile?.targetStub)
    && profile.targetStub > 0
    ? profile
    : null;
};

const outwardDistance = (
  endpointPoint: SharedNodePortPoint,
  outwardPoint: SharedNodePortPoint,
  side: SharedNodePortSide,
): number => {
  if (side === 'top') return endpointPoint.y - outwardPoint.y;
  if (side === 'bottom') return outwardPoint.y - endpointPoint.y;
  if (side === 'left') return endpointPoint.x - outwardPoint.x;
  return outwardPoint.x - endpointPoint.x;
};

const preservesTerminalStubs = (
  path: SharedNodePortPoint[],
  sourceSide: SharedNodePortSide,
  targetSide: SharedNodePortSide,
  profile: OuterPortTerminalStubProfile,
): boolean => (
  path.length >= 2
  && outwardDistance(path[0], path[1], sourceSide) >= profile.sourceStub - 0.1
  && outwardDistance(path[path.length - 1], path[path.length - 2], targetSide)
    >= profile.targetStub - 0.1
);

const buildIndependentFacingPortPathCandidates = (
  sourceRect: SharedNodePortRect,
  targetRect: SharedNodePortRect,
  sourceSide: SharedNodePortSide,
  targetSide: SharedNodePortSide,
  profile: OuterPortTerminalStubProfile,
): SharedNodePortPoint[][] => {
  const source = endpoint(sourceRect, sourceSide);
  const target = endpoint(targetRect, targetSide);
  const sourceStub = outward(source, sourceSide, profile.sourceStub);
  const targetStub = outward(target, targetSide, profile.targetStub);
  const sourceVertical = sourceSide === 'top' || sourceSide === 'bottom';
  const bridges = sourceVertical
    ? [
      { x: sourceStub.x, y: targetStub.y },
      { x: targetStub.x, y: sourceStub.y },
    ]
    : [
      { x: targetStub.x, y: sourceStub.y },
      { x: sourceStub.x, y: targetStub.y },
    ];
  return uniquePaths(bridges.map(bridge => compactOrthogonalPath([
    source,
    sourceStub,
    bridge,
    targetStub,
    target,
  ]))).filter(path => preservesTerminalStubs(
    path,
    sourceSide,
    targetSide,
    profile,
  ));
};

export const buildOuterFacingPortPathCandidates = (
  sourceRect: SharedNodePortRect,
  targetRect: SharedNodePortRect,
  sourceSide: SharedNodePortSide,
  targetSide: SharedNodePortSide,
  stubInput: StubInput = 48,
): SharedNodePortPoint[][] => {
  const profile = normalizeStubProfile(stubInput);
  if (
    !validRect(sourceRect)
    || !validRect(targetRect)
    || !SIDES.has(sourceSide)
    || !SIDES.has(targetSide)
    || !profile
  ) return [];
  const sourceVertical = sourceSide === 'top' || sourceSide === 'bottom';
  const targetVertical = targetSide === 'top' || targetSide === 'bottom';
  if (sourceVertical !== targetVertical) return [];

  const source = endpoint(sourceRect, sourceSide);
  const target = endpoint(targetRect, targetSide);
  const sourceStub = outward(source, sourceSide, profile.sourceStub);
  const targetStub = outward(target, targetSide, profile.targetStub);
  if (sourceVertical) {
    const unionLeft = Math.min(sourceRect.x, targetRect.x);
    const unionRight = Math.max(
      sourceRect.x + sourceRect.width,
      targetRect.x + targetRect.width,
    );
    const clearance = Math.max(profile.sourceStub, profile.targetStub);
    return uniquePaths([unionLeft - clearance, unionRight + clearance].map(escapeX => (
      compactOrthogonalPath([
        source,
        sourceStub,
        { x: escapeX, y: sourceStub.y },
        { x: escapeX, y: targetStub.y },
        targetStub,
        target,
      ])
    ))).filter(path => preservesTerminalStubs(
      path,
      sourceSide,
      targetSide,
      profile,
    ));
  }

  const unionTop = Math.min(sourceRect.y, targetRect.y);
  const unionBottom = Math.max(
    sourceRect.y + sourceRect.height,
    targetRect.y + targetRect.height,
  );
  const clearance = Math.max(profile.sourceStub, profile.targetStub);
  return uniquePaths([unionTop - clearance, unionBottom + clearance].map(escapeY => (
    compactOrthogonalPath([
      source,
      sourceStub,
      { x: sourceStub.x, y: escapeY },
      { x: targetStub.x, y: escapeY },
      targetStub,
      target,
    ])
  ))).filter(path => preservesTerminalStubs(
    path,
    sourceSide,
    targetSide,
    profile,
  ));
};

export const buildDiverseFacingPortPathCandidates = (
  sourceRect: SharedNodePortRect,
  targetRect: SharedNodePortRect,
  sourceSide: SharedNodePortSide,
  targetSide: SharedNodePortSide,
  stubInput: StubInput = 48,
): SharedNodePortPoint[][] => {
  const profile = normalizeStubProfile(stubInput);
  if (
    !profile
    || !validRect(sourceRect)
    || !validRect(targetRect)
    || !SIDES.has(sourceSide)
    || !SIDES.has(targetSide)
  ) return [];
  const direct = typeof stubInput === 'number'
    ? buildFacingPortPathCandidates(sourceRect, targetRect, sourceSide, targetSide, stubInput)
    : buildIndependentFacingPortPathCandidates(
      sourceRect,
      targetRect,
      sourceSide,
      targetSide,
      profile,
    );
  return uniquePaths([
    ...direct,
    ...buildOuterFacingPortPathCandidates(
      sourceRect,
      targetRect,
      sourceSide,
      targetSide,
      profile,
    ),
  ]);
};
