export type OuterPortTerminalSide = 'top' | 'right' | 'bottom' | 'left';

export type OuterPortTerminalStubProfile = {
  sourceStub: number;
  targetStub: number;
};

export type OuterPortTerminalStubPlan = {
  preferred: OuterPortTerminalStubProfile[];
  fallback: OuterPortTerminalStubProfile[];
};

const MIN_ENDPOINT_STUB = 48;
const MIN_DECLARED_SAFE_STUB = 56;
const SIDES = new Set<OuterPortTerminalSide>(['top', 'right', 'bottom', 'left']);

const profileSignature = (profile: OuterPortTerminalStubProfile): string => (
  `${profile.sourceStub.toFixed(3)}:${profile.targetStub.toFixed(3)}`
);

const uniqueProfiles = (
  profiles: OuterPortTerminalStubProfile[],
): OuterPortTerminalStubProfile[] => Array.from(
  new Map(profiles.map(profile => [profileSignature(profile), profile])).values(),
);

/**
 * Produces an ordered, bounded terminal-stub search plan. A terminal that
 * stays on its declared side gets the render-safe 56px stub first; a switched
 * terminal retains the regular 48px minimum. The fourth Cartesian profile is
 * held back as a fallback, so normal searches never pay a 2x2 expansion.
 */
export const buildOuterPortTerminalStubPlan = (
  minimumStub: number,
  sourceSide: OuterPortTerminalSide,
  targetSide: OuterPortTerminalSide,
  declaredSourceSide: OuterPortTerminalSide | null,
  declaredTargetSide: OuterPortTerminalSide | null,
): OuterPortTerminalStubPlan => {
  if (
    !Number.isFinite(minimumStub)
    || minimumStub <= 0
    || !SIDES.has(sourceSide)
    || !SIDES.has(targetSide)
    || (declaredSourceSide !== null && !SIDES.has(declaredSourceSide))
    || (declaredTargetSide !== null && !SIDES.has(declaredTargetSide))
  ) return { preferred: [], fallback: [] };

  const regular = Math.max(MIN_ENDPOINT_STUB, minimumStub);
  const safe = Math.max(MIN_DECLARED_SAFE_STUB, regular);
  const sourceDeclared = sourceSide === declaredSourceSide;
  const targetDeclared = targetSide === declaredTargetSide;
  const regularProfile = { sourceStub: regular, targetStub: regular };

  if (regular >= MIN_DECLARED_SAFE_STUB || (!sourceDeclared && !targetDeclared)) {
    return { preferred: [regularProfile], fallback: [] };
  }
  if (sourceDeclared && targetDeclared) {
    return {
      preferred: uniqueProfiles([
        { sourceStub: safe, targetStub: safe },
        { sourceStub: safe, targetStub: regular },
        { sourceStub: regular, targetStub: safe },
      ]),
      fallback: [regularProfile],
    };
  }
  return {
    preferred: [
      sourceDeclared
        ? { sourceStub: safe, targetStub: regular }
        : { sourceStub: regular, targetStub: safe },
      regularProfile,
    ],
    fallback: [],
  };
};
