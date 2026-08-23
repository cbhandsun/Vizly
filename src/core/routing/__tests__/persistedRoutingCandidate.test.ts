import { afterEach, describe, expect, it } from 'vitest';

import {
  createPersistedRoutingCandidate,
  createRoutingOnlyDocumentSnapshot,
  parseRoutingOnlyDocumentSnapshot,
  ROUTING_ONLY_DOCUMENT_SNAPSHOT_SCHEMA,
} from '../persistedRoutingCandidate';
import { stripRoutingOwnedDocumentEdge } from '../routingDocumentSanitizer';
import { EDGE_ROUTING_CACHE_VERSION } from '../routingVersion';
import {
  clearRoutingOnlyDocumentCandidates,
  readRoutingOnlyDocumentCandidate,
  registerRoutingOnlyDocumentCandidate,
} from '../routingDocumentCandidateRegistry';

const candidate = () => createPersistedRoutingCandidate({
  routingVersion: EDGE_ROUTING_CACHE_VERSION,
  inputSignature: '1234',
  inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
  outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
  writtenAt: 42,
  patches: [{
    id: 'edge-1',
    source: 'source',
    target: 'target',
    type: 'stablePath',
    data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  }],
});

afterEach(() => clearRoutingOnlyDocumentCandidates());

describe('routing-only document snapshot', () => {
  it('round-trips a current, bounded routing-only candidate', () => {
    const current = candidate();
    if (!current) throw new Error('expected a valid candidate fixture');

    const snapshot = createRoutingOnlyDocumentSnapshot(current);

    expect(snapshot).toEqual({
      schema: ROUTING_ONLY_DOCUMENT_SNAPSHOT_SCHEMA,
      candidate: current,
    });
    expect(parseRoutingOnlyDocumentSnapshot(JSON.parse(JSON.stringify(snapshot))))
      .toEqual(snapshot);
  });

  it('fails closed for unknown fields, old versions, and non-finite paths', () => {
    const current = candidate();
    if (!current) throw new Error('expected a valid candidate fixture');
    const snapshot = {
      schema: ROUTING_ONLY_DOCUMENT_SNAPSHOT_SCHEMA,
      candidate: current,
    };

    expect(parseRoutingOnlyDocumentSnapshot({ ...snapshot, extra: true })).toBeNull();
    expect(parseRoutingOnlyDocumentSnapshot({
      ...snapshot,
      candidate: { ...current, routingVersion: 'old' },
    })).toBeNull();
    expect(parseRoutingOnlyDocumentSnapshot({
      ...snapshot,
      candidate: {
        ...current,
        patches: [{
          ...current.patches[0],
          data: { computedPath: [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }] },
        }],
      },
    })).toBeNull();
  });

  it('strips routing geometry while preserving business and manual metadata', () => {
    const edge = {
      id: 'edge-1',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      markerEnd: 'arrow',
      data: {
        label: 'business label',
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        layoutPathLocked: true,
        autoSource: true,
        autoTarget: true,
        manualHandleSides: ['source'],
      },
    };

    expect(stripRoutingOwnedDocumentEdge(edge)).toEqual({
      ...edge,
      type: 'advanced-smart-step',
      sourceHandle: 'right',
      targetHandle: undefined,
      data: {
        label: 'business label',
        manualHandleSides: ['source'],
      },
    });
  });

  it('keeps parsed document candidates in a bounded identity-scoped registry', () => {
    const current = candidate();
    if (!current) throw new Error('expected a valid candidate fixture');
    const snapshot = createRoutingOnlyDocumentSnapshot(current);

    expect(registerRoutingOnlyDocumentCandidate(snapshot)).toBe(true);
    expect(readRoutingOnlyDocumentCandidate({
      routingVersion: EDGE_ROUTING_CACHE_VERSION,
      inputSignature: current.inputSignature,
      inputGeometryDigest: current.inputGeometryDigest,
    })).toEqual(current);
    expect(readRoutingOnlyDocumentCandidate({
      routingVersion: EDGE_ROUTING_CACHE_VERSION,
      inputSignature: '9999',
      inputGeometryDigest: current.inputGeometryDigest,
    })).toBeNull();
    expect(registerRoutingOnlyDocumentCandidate({
      schema: ROUTING_ONLY_DOCUMENT_SNAPSHOT_SCHEMA,
      candidate: { ...current, routingVersion: 'old' },
    })).toBe(false);
  });
});
