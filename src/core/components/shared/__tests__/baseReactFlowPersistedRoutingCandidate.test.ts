import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  BASE_REACT_FLOW_PERSISTED_ROUTING_SCHEMA,
  createBaseReactFlowPersistedRoutingCandidate,
  parseBaseReactFlowPersistedRoutingCandidate,
} from '../baseReactFlowPersistedRoutingCandidate';

const routingVersion = 'routing-test-v1';
const inputSignature = '12345';
const inputGeometryDigest = `geometry-v1:${'a'.repeat(32)}`;
const outputRouteSignature = 'route-v2:1:2:0123456789abcdef';
const patches: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  type: 'stablePath',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {
    computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  },
}];
const expectation = { routingVersion, inputSignature, inputGeometryDigest };

describe('persisted routing-only candidate boundary', () => {
  it('creates a versioned clone and parses it only for the bound identity', () => {
    const candidate = createBaseReactFlowPersistedRoutingCandidate({
      routingVersion,
      inputSignature,
      inputGeometryDigest,
      outputRouteSignature,
      patches,
      writtenAt: 123,
    });

    expect(candidate).toEqual({
      schema: BASE_REACT_FLOW_PERSISTED_ROUTING_SCHEMA,
      routingVersion,
      inputSignature,
      inputGeometryDigest,
      writtenAt: 123,
      hardClean: true,
      outputRouteSignature,
      patches,
    });
    expect(candidate?.patches).not.toBe(patches);
    expect(parseBaseReactFlowPersistedRoutingCandidate(candidate, {
      ...expectation,
      inputGeometryDigest: `geometry-v1:${'b'.repeat(32)}`,
    })).toBeNull();
  });

  it.each([
    ['empty', { patches: [] }],
    ['old schema', { schema: 'vizly-routing-only-candidate-v0' }],
    ['wrong version', { routingVersion: 'routing-test-v0' }],
    ['unsigned', { outputRouteSignature: 'forged' }],
    ['unverified', { hardClean: false }],
    ['future field', { userLabel: 'must-not-enter-routing' }],
  ])('fails closed for %s candidate input', (_name, override) => {
    const candidate = {
      schema: BASE_REACT_FLOW_PERSISTED_ROUTING_SCHEMA,
      routingVersion,
      inputSignature,
      inputGeometryDigest,
      writtenAt: 123,
      hardClean: true,
      outputRouteSignature,
      patches,
      ...override,
    };
    expect(parseBaseReactFlowPersistedRoutingCandidate(candidate, expectation)).toBeNull();
  });

  it('rejects non-finite, excessive, and metadata-bearing patch geometry', () => {
    const base = {
      schema: BASE_REACT_FLOW_PERSISTED_ROUTING_SCHEMA,
      routingVersion,
      inputSignature,
      inputGeometryDigest,
      writtenAt: 123,
      hardClean: true,
      outputRouteSignature,
      patches,
    };
    expect(parseBaseReactFlowPersistedRoutingCandidate({
      ...base,
      patches: [{
        ...patches[0],
        data: { computedPath: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }] },
      }],
    }, expectation)).toBeNull();
    expect(parseBaseReactFlowPersistedRoutingCandidate({
      ...base,
      patches: [{ ...patches[0], label: 'business-label' }],
    }, expectation)).toBeNull();
    expect(parseBaseReactFlowPersistedRoutingCandidate({
      ...base,
      patches: Array.from({ length: 301 }, (_, index) => ({
        id: `edge-${index}`, source: 'source', target: 'target',
      })),
    }, expectation)).toBeNull();
    expect(parseBaseReactFlowPersistedRoutingCandidate({
      ...base,
      patches: [{
        ...patches[0],
        data: {
          computedPath: Array.from({ length: 2_001 }, (_, x) => ({ x, y: 0 })),
        },
      }],
    }, expectation)).toBeNull();
  });
});
