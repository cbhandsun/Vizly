import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import type { RoutingCrossingScorerOptions } from './routingCrossingScorer';

export interface WaypointRefinementOptions {
  buddyGroups?: BuddyGroup[];
  fixedEdgeIds?: Set<string>;
  hardObstacles?: Rectangle[];
  softObstacles?: Rectangle[];
  spacing?: number;
  maxPasses?: number;
  maxEdgesPerPass?: number;
  candidateAxes?: {
    horizontal?: number[];
    vertical?: number[];
  };
  enableReroute?: boolean;
  maxRerouteEdges?: number;
  maxRerouteCandidates?: number;
  maxSegmentShiftCandidatesPerEdge?: number;
  scoring?: Omit<RoutingCrossingScorerOptions, 'buddyGroups' | 'softObstacles'>;
}

export interface ScoreSummary {
  totalScore: number;
  hardCrossings: number;
  buddyCrossings: number;
  parallelOverlaps: number;
  softCrossings: number;
  softNearMisses: number;
  turnbacks: number;
  bends: number;
}

export interface WaypointRefinementSummary {
  initial: ScoreSummary;
  final: ScoreSummary;
  segmentShiftChanges: number;
  rerouteChanges: number;
  changedEdgeIds: string[];
  consideredEdges: number;
  skippedBuddyEdges: number;
}

export interface WaypointRefinementResult {
  paths: Map<string, Point[]>;
  summary: WaypointRefinementSummary;
}

export interface ProtectedTrunkLocks {
  lockFirstJunction?: boolean;
  lockLastJunction?: boolean;
}

export type OrthogonalDirection = 'L' | 'R' | 'U' | 'D';

export interface EndpointLocks {
  firstJunction?: Point;
  lastJunction?: Point;
}
