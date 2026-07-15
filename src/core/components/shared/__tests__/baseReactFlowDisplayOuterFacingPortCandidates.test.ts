import { describe, expect, it } from 'vitest';

import {
  buildDiverseFacingPortPathCandidates,
  buildOuterFacingPortPathCandidates,
} from '../baseReactFlowDisplayOuterFacingPortCandidates';
import { buildFacingPortPathCandidates } from '../baseReactFlowSharedNodePortRoleRepair';

const sourceRect = { x: 5401.6, y: 447, width: 168, height: 100 };
const targetRect = { x: 2205.34, y: 146, width: 168, height: 100 };

describe('outer facing port path candidates', () => {
  it('derives both escape lanes from the union bounds', () => {
    const candidates = buildOuterFacingPortPathCandidates(
      sourceRect,
      targetRect,
      'top',
      'top',
      48,
    );

    expect(candidates).toContainEqual([
      { x: 5485.6, y: 447 },
      { x: 5485.6, y: 399 },
      { x: 5617.6, y: 399 },
      { x: 5617.6, y: 98 },
      { x: 2289.34, y: 98 },
      { x: 2289.34, y: 146 },
    ]);
    expect(candidates).toHaveLength(2);
  });

  it.each([
    ['top', 'top'],
    ['bottom', 'bottom'],
    ['left', 'left'],
    ['right', 'right'],
  ] as const)('builds two unique, finite orthogonal routes for %s to %s', (sourceSide, targetSide) => {
    const candidates = buildOuterFacingPortPathCandidates(
      { x: 20, y: 40, width: 80, height: 60 },
      { x: 260, y: 220, width: 100, height: 70 },
      sourceSide,
      targetSide,
      48,
    );
    const signatures = new Set(candidates.map(path => JSON.stringify(path)));

    expect(candidates).toHaveLength(2);
    expect(signatures.size).toBe(candidates.length);
    expect(candidates.every(path => path.every(point => (
      Number.isFinite(point.x) && Number.isFinite(point.y)
    )))).toBe(true);
    expect(candidates.every(path => path.slice(1).every((point, index) => (
      Math.abs(point.x - path[index].x) < 0.5
      || Math.abs(point.y - path[index].y) < 0.5
    )))).toBe(true);
  });

  it.each([
    [{ ...sourceRect, width: 0 }, targetRect, 'top', 'top', 48],
    [{ ...sourceRect, x: Number.NaN }, targetRect, 'top', 'top', 48],
    [sourceRect, targetRect, 'top', 'left', 48],
    [sourceRect, targetRect, 'top', 'top', 0],
    [sourceRect, targetRect, 'top', 'top', Number.POSITIVE_INFINITY],
    [sourceRect, targetRect, 'diagonal', 'top', 48],
  ] as const)('rejects invalid or cross-axis input %#', (source, target, sourceSide, targetSide, minStub) => {
    expect(buildOuterFacingPortPathCandidates(
      source,
      target,
      sourceSide as any,
      targetSide,
      minStub,
    )).toEqual([]);
  });

  it('merges direct and outer top-to-top topologies without duplicates', () => {
    const direct = buildFacingPortPathCandidates(sourceRect, targetRect, 'top', 'top', 48);
    const outer = buildOuterFacingPortPathCandidates(sourceRect, targetRect, 'top', 'top', 48);
    const combined = buildDiverseFacingPortPathCandidates(sourceRect, targetRect, 'top', 'top', 48);
    const signatures = new Set(combined.map(path => JSON.stringify(path)));

    expect(combined.length).toBeGreaterThan(direct.length);
    expect(combined).toEqual(expect.arrayContaining(outer));
    expect(signatures.size).toBe(combined.length);
  });

  it('supports independent outward source and target stub lengths', () => {
    const candidates = buildDiverseFacingPortPathCandidates(
      sourceRect,
      targetRect,
      'top',
      'top',
      { sourceStub: 48, targetStub: 56 },
    );

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(path => path[0].y - path[1].y >= 48)).toBe(true);
    expect(candidates.every(path => (
      path[path.length - 1].y - path[path.length - 2].y >= 56
    ))).toBe(true);
    expect(candidates.every(path => path.slice(1).every((point, index) => (
      Math.abs(point.x - path[index].x) < 0.5
      || Math.abs(point.y - path[index].y) < 0.5
    )))).toBe(true);
  });

  it('rejects an invalid independent stub profile', () => {
    expect(buildDiverseFacingPortPathCandidates(
      sourceRect,
      targetRect,
      'top',
      'top',
      { sourceStub: 48, targetStub: Number.NaN },
    )).toEqual([]);
  });
});
