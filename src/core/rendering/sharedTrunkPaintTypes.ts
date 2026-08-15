import type { SharedTrunkBackbonePaint } from './sharedTrunkBackbonePaint';

export type SharedTrunkRole = 'source' | 'target';

export interface SharedTrunkPaintPoint {
  x: number;
  y: number;
}

export interface SharedTrunkPaintRange {
  from: number;
  to: number;
  role: SharedTrunkRole;
  ownerEdgeId: string;
}

export interface SharedTrunkPaintMembership {
  id: string;
  role: SharedTrunkRole;
  endpointId: string;
  ownerEdgeId: string;
  edgeIds: readonly string[];
  commonLength: number;
}

export interface SharedTrunkBackboneRange {
  from: number;
  to: number;
  role: SharedTrunkRole;
  ownerEdgeId: string;
  membershipId: string;
  paint: SharedTrunkBackbonePaint;
}

export interface SharedTrunkJunctionPlanEntry {
  point: SharedTrunkPaintPoint;
  distance: number;
  role: SharedTrunkRole;
  ownerEdgeId: string;
  membershipId: string;
  paint: SharedTrunkBackbonePaint;
}

export interface SharedTrunkPaintPlan {
  version: 0 | 1;
  edgeId?: string;
  hiddenRanges: readonly SharedTrunkPaintRange[];
  memberships: readonly SharedTrunkPaintMembership[];
  backboneRanges: readonly SharedTrunkBackboneRange[];
  junctions: readonly SharedTrunkJunctionPlanEntry[];
}

export interface SharedTrunkPaintFragment {
  points: readonly SharedTrunkPaintPoint[];
  startsAtSource: boolean;
  endsAtTarget: boolean;
}

export interface SharedTrunkBackboneFragment {
  points: readonly SharedTrunkPaintPoint[];
  from: number;
  to: number;
  roles: readonly SharedTrunkRole[];
  membershipIds: readonly string[];
  paint: SharedTrunkBackbonePaint;
}

export interface SharedTrunkJunctionFragment {
  point: SharedTrunkPaintPoint;
  distance: number;
  roles: readonly SharedTrunkRole[];
  membershipIds: readonly string[];
  paint: SharedTrunkBackbonePaint;
}

export interface SharedTrunkHiddenFragment {
  points: readonly SharedTrunkPaintPoint[];
  from: number;
  to: number;
  roles: readonly SharedTrunkRole[];
  ownerEdgeIds: readonly string[];
  membershipIds: readonly string[];
}
