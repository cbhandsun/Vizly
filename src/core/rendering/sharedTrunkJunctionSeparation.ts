import type { Edge } from '@xyflow/react';
import { isReadableOrthogonalCrossing, READABLE_CROSSING_CLEARANCE } from '../routing/orthogonalCrossingPolicy';
import { pointAtSharedTrunkDistance, sameSharedTrunkPoint, SHARED_TRUNK_LENGTH_TOLERANCE } from './sharedTrunkPaintGeometry';
import type { SharedTrunkPaintPlan, SharedTrunkPaintPoint, SharedTrunkRole } from './sharedTrunkPaintTypes';

type PlannedPath = Readonly<{ edge: Edge; points: SharedTrunkPaintPoint[]; length: number }>;
const close = (a: number, b: number): boolean => Math.abs(a - b) <= SHARED_TRUNK_LENGTH_TOLERANCE;
const MAX_JUNCTION_RELEASES = 128;

const crossingSegment = (path: PlannedPath, point: SharedTrunkPaintPoint, horizontal: boolean) => {
  for (let index = 1; index < path.points.length; index += 1) {
    const a = path.points[index - 1];
    const b = path.points[index];
    if (horizontal
      ? Math.abs(a.y - point.y) < 0.5 && Math.abs(b.y - point.y) < 0.5
        && point.x > Math.min(a.x, b.x) && point.x < Math.max(a.x, b.x)
      : Math.abs(a.x - point.x) < 0.5 && Math.abs(b.x - point.x) < 0.5
        && point.y > Math.min(a.y, b.y) && point.y < Math.max(a.y, b.y)) return { a, b };
  }
  return null;
};

/**
 * A dual-trunk edge can be hidden all the way from a source fork to a target
 * merge at the same crossing. Release a short semantic interval so the horizontal
 * owner can paint its bridge inside a fragment, instead of at an unpaintable
 * fragment boundary. Route points, ports and geometric trunk contracts stay intact.
 */
export const separateSharedTrunkCrossingJunctions = (
  original: ReadonlyMap<string, SharedTrunkPaintPlan>,
  paths: readonly PlannedPath[],
  minimumSharedLength: number,
): ReadonlyMap<string, SharedTrunkPaintPlan> => {
  if (!Number.isFinite(minimumSharedLength) || minimumSharedLength < 0) return original;
  const byId = new Map(paths.map(path => [path.edge.id, path]));
  const plans = new Map(original);
  let releases = 0;
  for (const path of paths) {
    if (releases >= MAX_JUNCTION_RELEASES) break;
    const plan = plans.get(path.edge.id);
    if (!plan) continue;
    const source = plan.hiddenRanges.find(range => range.role === 'source' && close(range.from, 0));
    const target = plan.hiddenRanges.find(range => range.role === 'target' && close(range.to, path.length));
    if (!source || !target || !close(source.to, target.from)) continue;
    const sourceOwner = byId.get(source.ownerEdgeId);
    const targetOwner = byId.get(target.ownerEdgeId);
    if (!sourceOwner || !targetOwner || sourceOwner.edge.source === targetOwner.edge.source
      || sourceOwner.edge.target === targetOwner.edge.target) continue;
    const point = pointAtSharedTrunkDistance(path.points, source.to);
    const sourcePlan = plans.get(sourceOwner.edge.id);
    const targetPlan = plans.get(targetOwner.edge.id);
    if (!sourcePlan?.junctions.some(j => j.role === 'source' && sameSharedTrunkPoint(j.point, point))
      || !targetPlan?.junctions.some(j => j.role === 'target' && sameSharedTrunkPoint(j.point, point))) continue;
    let role: SharedTrunkRole | undefined;
    for (const candidate of ['source', 'target'] as const) {
      const horizontal = crossingSegment(candidate === 'source' ? sourceOwner : targetOwner, point, true);
      const vertical = crossingSegment(candidate === 'source' ? targetOwner : sourceOwner, point, false);
      if (horizontal && vertical && isReadableOrthogonalCrossing(horizontal, vertical)) role = candidate;
    }
    if (!role) continue;
    const owner = role === 'source' ? sourceOwner : targetOwner;
    const commonLength = role === 'source' ? source.to : path.length - target.from;
    const nextLength = commonLength - READABLE_CROSSING_CLEARANCE;
    if (nextLength < minimumSharedLength) continue;
    const ownerPlan = plans.get(owner.edge.id);
    const membership = ownerPlan?.memberships.find(m => m.role === role && m.ownerEdgeId === owner.edge.id
      && m.edgeIds.includes(path.edge.id));
    if (!membership || membership.edgeIds.length > 128) continue;
    const replacements = new Map<string, SharedTrunkPaintPlan>();
    for (const id of membership.edgeIds) {
      const member = byId.get(id);
      const current = plans.get(id);
      if (!member || !current) break;
      const extent = (from: number, to: number) => role === 'source' ? to : member.length - from;
      const relevant = current.hiddenRanges.filter(r => r.role === role && r.ownerEdgeId === owner.edge.id);
      // Do not cut across another nested fork or an independently owned range.
      if (!relevant.some(r => close(extent(r.from, r.to), commonLength))
        || relevant.some(r => extent(r.from, r.to) > commonLength + SHARED_TRUNK_LENGTH_TOLERANCE)
        || relevant.some(r => close(extent(r.from, r.to), commonLength) && r.to - r.from <= READABLE_CROSSING_CLEARANCE)
        || current.backboneRanges.some(r => r.role === role && r.ownerEdgeId === owner.edge.id
          && close(extent(r.from, r.to), commonLength) && r.to - r.from <= READABLE_CROSSING_CLEARANCE)) break;
      const trim = <T extends { from: number; to: number; role: SharedTrunkRole; ownerEdgeId: string }>(range: T): T => (
        range.role === role && range.ownerEdgeId === owner.edge.id && close(extent(range.from, range.to), commonLength)
          ? { ...range, ...(role === 'source' ? { to: nextLength } : { from: member.length - nextLength }) }
          : range
      );
      replacements.set(id, {
        ...current,
        hiddenRanges: current.hiddenRanges.map(trim),
        backboneRanges: current.backboneRanges.map(trim),
        memberships: current.memberships.map(m => m.id === membership.id && close(m.commonLength, commonLength)
          ? { ...m, commonLength: nextLength } : m),
        junctions: current.junctions.map(j => {
          const length = role === 'source' ? j.distance : member.length - j.distance;
          if (j.role !== role || j.ownerEdgeId !== owner.edge.id || !close(length, commonLength)) return j;
          const distance = role === 'source' ? nextLength : member.length - nextLength;
          return { ...j, distance, point: pointAtSharedTrunkDistance(member.points, distance) };
        }),
      });
    }
    if (replacements.size !== membership.edgeIds.length) continue;
    for (const [id, replacement] of replacements) plans.set(id, replacement);
    releases += 1;
  }
  return releases ? plans : original;
};
