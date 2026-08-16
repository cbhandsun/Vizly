import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  canUseFlatElkSafetyFallback,
  isLayoutRoutingHardQualityRejection,
  resolveLegacyDomainQualityFallback,
  resolveLegacyDomainTopologyFallback,
  shouldPreferElkForLegacyDomainTopology,
  shouldUseElkSafetyFallback,
} from '../legacyDomainLayoutFallback';

const node = (id: string, x: number): Node => ({
  id,
  position: { x, y: 0 },
  measured: { width: 100, height: 60 },
  data: {},
});

const withDomain = (nodes: Node[]): Node[] => nodes.map(item => ({
  ...item,
  data: { ...item.data, domain: 'semantic-domain' },
}));

const edge = (
  id: string,
  source: string,
  target: string,
  computedPath?: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source,
  target,
  sourceHandle: 'right',
  targetHandle: 'left',
  data: computedPath ? { computedPath } : {},
});

describe('legacy domain layout ELK safety fallback', () => {
  it('recognizes only the explicit routing hard-quality rejection boundary', () => {
    expect(isLayoutRoutingHardQualityRejection(
      new Error('layout-routing-hard-quality-rejected'),
    )).toBe(true);
    expect(isLayoutRoutingHardQualityRejection(new Error('layout-routing-cancelled'))).toBe(false);
    expect(isLayoutRoutingHardQualityRejection('layout-routing-hard-quality-rejected')).toBe(false);
    expect(isLayoutRoutingHardQualityRejection(null)).toBe(false);
  });

  it('allows the flat ELK fallback only when both semantic container layers are disabled', () => {
    expect(canUseFlatElkSafetyFallback({
      generateDomainGroups: false,
      generateSubDomainGroups: false,
    })).toBe(true);
    expect(canUseFlatElkSafetyFallback({
      generateDomainGroups: true,
      generateSubDomainGroups: false,
    })).toBe(false);
    expect(canUseFlatElkSafetyFallback({
      generateDomainGroups: false,
      generateSubDomainGroups: true,
    })).toBe(false);
    expect(canUseFlatElkSafetyFallback({})).toBe(false);
    expect(canUseFlatElkSafetyFallback({
      generateDomainGroups: true,
      generateSubDomainGroups: true,
    }, [node('flat', 0)])).toBe(true);
    expect(canUseFlatElkSafetyFallback({
      generateDomainGroups: true,
      generateSubDomainGroups: true,
    }, withDomain([node('grouped', 0)]))).toBe(false);
  });

  it('uses hard quality as the final safety net even for a forest candidate', () => {
    const nodes = [node('source', 0), node('sibling', 200), node('target', 400)];
    const edges = [edge('source-target', 'source', 'target', [
      { x: 100, y: 30 },
      { x: 400, y: 30 },
    ])];

    expect(shouldUseElkSafetyFallback(nodes, edges)).toBe(true);
  });

  it('does not guess when a complex candidate has no complete route geometry', () => {
    const nodes = [node('a', 0), node('b', 200), node('target', 400)];
    const edges = [
      edge('a-target', 'a', 'target'),
      edge('b-target', 'b', 'target'),
    ];

    expect(shouldUseElkSafetyFallback(nodes, edges)).toBe(false);
  });

  it('moves a hard-defective multi-parent candidate to the layered safety engine', () => {
    const nodes = [node('a', 0), node('b', 200), node('target', 400)];
    const edges = [
      edge('a-target', 'a', 'target', [
        { x: 100, y: 30 },
        { x: 400, y: 30 },
      ]),
      edge('b-target', 'b', 'target', [
        { x: 300, y: 30 },
        { x: 348, y: 30 },
        { x: 348, y: 100 },
        { x: 352, y: 100 },
        { x: 352, y: 30 },
        { x: 400, y: 30 },
      ]),
    ];

    expect(shouldUseElkSafetyFallback(nodes, edges)).toBe(true);
    expect(shouldPreferElkForLegacyDomainTopology(nodes, edges)).toBe(true);
    expect(resolveLegacyDomainQualityFallback({
      generateDomainGroups: false,
      generateSubDomainGroups: false,
    }, nodes, edges)).toBe('flat-elk');
    const semanticNodes = withDomain(nodes);
    expect(resolveLegacyDomainQualityFallback({
      generateDomainGroups: true,
      generateSubDomainGroups: true,
    }, semanticNodes, edges)).toBe('domain-compound-elk');
    expect(resolveLegacyDomainTopologyFallback({
      generateDomainGroups: false,
      generateSubDomainGroups: false,
    }, nodes, edges)).toBe('flat-elk');
    expect(resolveLegacyDomainTopologyFallback({
      generateDomainGroups: true,
      generateSubDomainGroups: true,
    }, semanticNodes, edges)).toBe('domain-compound-elk');
  });

  it('keeps simple forest topology on the requested legacy domain engine', () => {
    const nodes = [node('source', 0), node('target', 400)];
    const edges = [edge('source-target', 'source', 'target', [
      { x: 100, y: 30 },
      { x: 400, y: 30 },
    ])];

    expect(shouldPreferElkForLegacyDomainTopology(nodes, edges)).toBe(false);
    expect(shouldUseElkSafetyFallback(nodes, edges)).toBe(false);
    expect(resolveLegacyDomainQualityFallback({
      generateDomainGroups: true,
      generateSubDomainGroups: true,
    }, nodes, edges)).toBeNull();
    expect(resolveLegacyDomainTopologyFallback({
      generateDomainGroups: true,
      generateSubDomainGroups: true,
    }, nodes, edges)).toBeNull();
  });
});
