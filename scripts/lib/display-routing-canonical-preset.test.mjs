import { describe, expect, it } from 'vitest';

import {
  parseCanonicalPresetIdentity,
  verifyCanonicalPresetMount,
} from './display-routing-canonical-preset.mjs';

const source = {
  id: 'preset-a',
  nodes: [{ id: 'one' }, { id: 'two' }],
  edges: [{ id: 'edge-one-two' }],
};

describe('display routing canonical preset identity', () => {
  it('proves source, request, and mounted identities while allowing derived container nodes', () => {
    const identity = parseCanonicalPresetIdentity(source, 'preset-a');
    expect(verifyCanonicalPresetMount({
      identity,
      requestNodes: [...source.nodes, { id: 'derived-container' }],
      requestEdges: source.edges,
      mountedNodes: [...source.nodes, { id: 'derived-container' }],
      mountedEdges: source.edges,
    })).toEqual({
      presetId: 'preset-a',
      sourceNodeCount: 2,
      sourceEdgeCount: 1,
      mountedNodeCount: 3,
      mountedEdgeCount: 1,
    });
  });

  it.each([
    [{ ...source, id: 'wrong' }, 'preset-a'],
    [{ ...source, nodes: null }, 'preset-a'],
    [{ ...source, edges: [{ id: '' }] }, 'preset-a'],
    [{ ...source, nodes: [{ id: 'one' }, { id: 'one' }] }, 'preset-a'],
  ])('rejects malformed or mismatched source identity', (value, expectedPresetId) => {
    expect(() => parseCanonicalPresetIdentity(value, expectedPresetId)).toThrow();
  });

  it('fails closed when autosave or mounted data differs from the canonical preset', () => {
    const identity = parseCanonicalPresetIdentity(source, 'preset-a');
    expect(() => verifyCanonicalPresetMount({
      identity,
      requestNodes: source.nodes,
      requestEdges: [{ id: 'autosaved-edge' }],
      mountedNodes: source.nodes,
      mountedEdges: source.edges,
    })).toThrow(/identity mismatch/);
    expect(() => verifyCanonicalPresetMount({
      identity,
      requestNodes: source.nodes,
      requestEdges: [...source.edges, { id: 'unexpected' }],
      mountedNodes: source.nodes,
      mountedEdges: source.edges,
    })).toThrow(/unexpected logical edges/);
  });
});
