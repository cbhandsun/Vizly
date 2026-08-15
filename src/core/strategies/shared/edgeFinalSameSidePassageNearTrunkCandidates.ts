import { EPS } from './edgeSharedEndpointPortOrderGeometry';

const ASSIMILATION_TOLERANCE = 16;
const MAX_BLOCKS = 12;

type NearTrunkLeg = Readonly<{
  edgeId: string;
  branchDirection: number;
  outwardDirection: number;
}>;

type NearTrunkBlock = Readonly<{
  legs: readonly NearTrunkLeg[];
  terminalCoordinate: number;
  remoteMinimum: number;
  remoteMaximum: number;
}>;

type CandidateScore = Readonly<{
  passageDefects: number;
  nearTrunkOpportunities: number;
}>;

type RankedCandidate<TCandidate> = Readonly<{
  candidate: TCandidate;
  passageDefects: number;
  nearTrunkOpportunities: number;
  movement: number;
  memberKey: string;
}>;

export function acceptFirstRankedPassageCandidate<TCandidate, TResult>(
  candidates: readonly TCandidate[],
  score: (candidate: TCandidate) => CandidateScore,
  accept: (candidate: TCandidate) => TResult | null,
): TResult | null {
  const ranked = candidates.map((candidate, index): RankedCandidate<TCandidate> => ({
    candidate,
    ...score(candidate),
    movement: 0,
    memberKey: String(index).padStart(8, '0'),
  })).sort((first, second) => (
    first.passageDefects - second.passageDefects
    || first.nearTrunkOpportunities - second.nearTrunkOpportunities
    || first.memberKey.localeCompare(second.memberKey)
  ));
  for (const candidate of ranked) {
    const accepted = accept(candidate.candidate);
    if (accepted !== null) return accepted;
  }
  return null;
}

const memberKey = (block: NearTrunkBlock): string => (
  block.legs.map(leg => leg.edgeId).sort().join(',')
);

function compatibleChildSector(first: NearTrunkBlock, second: NearTrunkBlock): boolean {
  const firstDirections = new Set(first.legs.map(leg => leg.branchDirection).filter(value => value !== 0));
  const secondDirections = new Set(second.legs.map(leg => leg.branchDirection).filter(value => value !== 0));
  if (firstDirections.size === 0 && secondDirections.size === 0) return true;
  return [...firstDirections].some(direction => secondDirections.has(direction));
}

function hasInterveningPeer(
  first: NearTrunkBlock,
  second: NearTrunkBlock,
  blocks: readonly NearTrunkBlock[],
): boolean {
  const minimum = Math.min(first.remoteMinimum, second.remoteMinimum);
  const maximum = Math.max(first.remoteMaximum, second.remoteMaximum);
  return blocks.some((block) => {
    if (block === first || block === second) return false;
    const center = (block.remoteMinimum + block.remoteMaximum) / 2;
    return [block.remoteMinimum, center, block.remoteMaximum]
      .some(value => value > minimum + EPS && value < maximum - EPS);
  });
}

export function buildRankedNearTrunkCandidates<
  TBlock extends NearTrunkBlock,
  TCandidate,
>(
  blocks: readonly TBlock[],
  isEligible: (block: TBlock) => boolean,
  materialize: (winner: TBlock, loser: TBlock) => TCandidate | null,
  score: (candidate: TCandidate) => CandidateScore,
): TCandidate[] {
  const eligible = blocks.filter(isEligible).sort((first, second) => (
    first.terminalCoordinate - second.terminalCoordinate
    || memberKey(first).localeCompare(memberKey(second))
  )).slice(0, MAX_BLOCKS);
  const candidates: Array<RankedCandidate<TCandidate>> = [];
  for (let firstIndex = 0; firstIndex < eligible.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < eligible.length; secondIndex += 1) {
      const first = eligible[firstIndex];
      const second = eligible[secondIndex];
      if (
        Math.abs(first.terminalCoordinate - second.terminalCoordinate) > ASSIMILATION_TOLERANCE + EPS
        || first.legs[0]?.outwardDirection !== second.legs[0]?.outwardDirection
        || !compatibleChildSector(first, second)
        || hasInterveningPeer(first, second, blocks)
      ) continue;
      const [winner, loser] = [first, second].sort((left, right) => (
        right.legs.length - left.legs.length
        || left.terminalCoordinate - right.terminalCoordinate
        || memberKey(left).localeCompare(memberKey(right))
      ));
      const candidate = materialize(winner, loser);
      if (!candidate) continue;
      const candidateScore = score(candidate);
      candidates.push({
        candidate,
        ...candidateScore,
        movement: Math.abs(winner.terminalCoordinate - loser.terminalCoordinate) * loser.legs.length,
        memberKey: [memberKey(first), memberKey(second)].sort().join('|'),
      });
    }
  }
  return candidates.sort((first, second) => (
    first.passageDefects - second.passageDefects
    || first.nearTrunkOpportunities - second.nearTrunkOpportunities
    || first.movement - second.movement
    || first.memberKey.localeCompare(second.memberKey)
  )).map(candidate => candidate.candidate);
}
