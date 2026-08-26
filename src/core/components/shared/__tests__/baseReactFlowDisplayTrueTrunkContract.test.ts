import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { SameSideEndpointTrunkIdentity } from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  preservesCommercialTrueTrunkMembership,
  preservesInitialTrueTrunks,
  preservesInitialTrueTrunksWithPreferredSourceSupersession,
  preservesInitialTrueTrunksWithinClearanceMargin,
} from '../baseReactFlowDisplayTrueTrunkContract';

const trunk = (
  role: 'source' | 'target',
  edgeIds: string[],
  commonStemLength: number,
): SameSideEndpointTrunkIdentity => ({
  id: `hub|${role}|bottom|${edgeIds.join(',')}`,
  nodeId: 'hub',
  role,
  side: 'bottom',
  edgeIds,
  commonStemLength,
});

describe('baseReactFlowDisplayTrueTrunkContract', () => {
  it('preserves source and target identities independently for a dual-role edge', () => {
    const baseline = [
      trunk('source', ['dual', 'source-peer'], 64),
      trunk('target', ['dual', 'target-peer'], 72),
    ];
    const candidate = [
      trunk('source', ['dual', 'source-peer', 'source-extra'], 64),
      trunk('target', ['dual', 'target-peer'], 72),
    ];

    expect(preservesInitialTrueTrunks(baseline, candidate)).toBe(true);
  });

  it('rejects a candidate that keeps only a subset of the original trunk', () => {
    expect(preservesInitialTrueTrunks(
      [trunk('source', ['first', 'second', 'third'], 64)],
      [trunk('source', ['first', 'second'], 96)],
    )).toBe(false);
  });

  it('allows only the documented bounded stem reduction above the commercial floor', () => {
    const baseline = [trunk('source', ['first', 'second'], 72)];

    expect(preservesInitialTrueTrunksWithinClearanceMargin(
      baseline,
      [trunk('source', ['first', 'second'], 56)],
    )).toBe(true);
    expect(preservesCommercialTrueTrunkMembership(
      baseline,
      [trunk('source', ['first', 'second'], 40)],
    )).toBe(false);
  });

  it('allows a nested pair stem to be absorbed by a commercial-length superset trunk', () => {
    const baseline = [
      trunk('source', ['first', 'second'], 72),
      trunk('source', ['first', 'second', 'third'], 60),
    ];
    const candidate = [trunk('source', ['first', 'second', 'third'], 60)];

    expect(preservesInitialTrueTrunks(baseline, candidate)).toBe(false);
    expect(preservesInitialTrueTrunksWithinClearanceMargin(baseline, candidate)).toBe(true);
  });

  it('supersedes only a smaller intersecting source trunk at the restored endpoint', () => {
    const provisional = {
      ...trunk('source', ['dual', 'side-peer'], 56),
      side: 'right' as const,
    };
    const target = trunk('target', ['dual', 'target-peer'], 72);
    const restored = trunk('source', ['dual', 'near-peer', 'far-peer'], 70);

    expect(preservesInitialTrueTrunksWithPreferredSourceSupersession(
      [provisional, target],
      [restored, target],
      restored,
    )).toBe(true);
    expect(preservesInitialTrueTrunksWithPreferredSourceSupersession(
      [provisional, target],
      [restored],
      restored,
    )).toBe(false);
  });

  it('allows an authored reverse branch to leave an overextended source trunk', () => {
    const baseline = [trunk('source', ['first', 'second', 'third', 'reverse'], 70)];
    const candidate = [trunk('source', ['first', 'second', 'third'], 70)];
    const preferredEdges = [
      { id: 'first', sourceHandle: 'bottom' },
      { id: 'second', sourceHandle: 'bottom' },
      { id: 'third', sourceHandle: 'bottom' },
      { id: 'reverse', sourceHandle: 'right' },
    ] as Edge[];

    expect(preservesInitialTrueTrunksWithPreferredSourceSupersession(
      baseline,
      candidate,
      undefined,
      preferredEdges,
    )).toBe(true);
    expect(preservesInitialTrueTrunksWithPreferredSourceSupersession(
      baseline,
      candidate,
      undefined,
    )).toBe(false);
    expect(preservesInitialTrueTrunksWithPreferredSourceSupersession(
      baseline,
      candidate,
      undefined,
      preferredEdges.map(edge => ({ ...edge, sourceHandle: 'bottom' })),
      new Set(['reverse']),
    )).toBe(true);
    expect(preservesInitialTrueTrunksWithPreferredSourceSupersession(
      baseline,
      candidate,
      undefined,
      preferredEdges.map(edge => ({ ...edge, sourceHandle: 'bottom' })),
    )).toBe(false);
  });
});
