import { describe, expect, it } from 'vitest';
import { ROUTING_IDENTIFIER_MAX_LENGTH } from '../../../routing/routingBoundaryLimits';
import { parseDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayWorkerProtocol';
import type { DisplayEdgesWorkerResponse } from '../baseReactFlowDisplayWorkerProtocol';
import { createDisplayEdgesTransportResponse } from '../baseReactFlowDisplayWorkerScope';
import { createTestDisplayHardReport } from './baseReactFlowDisplayWorkerTestFixtures';

const edge = { id: 'edge', source: 'source', target: 'target', data: {
  computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
} };
const response: DisplayEdgesWorkerResponse = {
  requestId: 'scope', edges: [edge], hardClean: true,
  hardReport: createTestDisplayHardReport(), routeResolution: 'incremental-route',
  affectedEdgeCount: 1, fallbackLevel: 'none', eligibleEdgeIds: [edge.id],
};
const parse = (value: unknown) => parseDisplayEdgesWorkerResponse(value, 'scope');

describe('final incremental repair eligibility evidence', () => {
  it('preserves scope across patch transport and structured cloning', () => {
    const transport = createDisplayEdgesTransportResponse(response, [edge]);
    expect(transport.edges).toBeUndefined();
    expect(transport.routingPatches).toHaveLength(1);
    expect(parse(structuredClone(transport))?.eligibleEdgeIds).toEqual([edge.id]);
  });

  it('distinguishes absent metadata from an explicitly empty scope', () => {
    expect(parse({ ...response, eligibleEdgeIds: undefined })?.eligibleEdgeIds).toBeUndefined();
    expect(parse({ ...response, eligibleEdgeIds: [] })?.eligibleEdgeIds).toEqual([]);
    expect(parse({ ...response, edges: [], eligibleEdgeIds: [] })?.eligibleEdgeIds).toEqual([]);
  });

  it.each([null, 'edge', {}, [null], [1], [''], ['edge', 'edge'], ['unknown'],
    ['x'.repeat(ROUTING_IDENTIFIER_MAX_LENGTH + 1)], Array(10_001).fill('edge'),
    ['__proto__'], ['<script>alert(1)</script>'], [NaN], [Infinity],
  ])('rejects invalid or foreign identifiers: %j', eligibleEdgeIds => {
    expect(parse({ ...response, eligibleEdgeIds })).toBeNull();
  });

  it('returns an independent array and treats valid identifiers as opaque data', () => {
    const eligibleEdgeIds = ['__proto__'];
    const parsed = parse({ ...response, edges: [{ ...edge, id: '__proto__' }], eligibleEdgeIds });
    expect(parsed?.eligibleEdgeIds).toEqual(eligibleEdgeIds);
    expect(parsed?.eligibleEdgeIds).not.toBe(eligibleEdgeIds);
  });

  it('accepts the protocol item limit without truncating scope', () => {
    const edges = Array.from({ length: 10_000 }, (_, index) => ({ ...edge, id: `edge-${index}` }));
    expect(parse({ ...response, edges, eligibleEdgeIds: edges.map(item => item.id) })?.eligibleEdgeIds)
      .toHaveLength(10_000);
  });

  it.each(['full-route', 'full-route-repaired', 'repair', 'validated-candidate'])(
    'rejects scope attached to resolution %s', routeResolution => {
      expect(parse({ ...response, routeResolution })).toBeNull();
    },
  );

  it.each([
    { fallbackLevel: 'full' }, { fallbackLevel: undefined },
    { hardClean: false }, { affectedEdgeCount: undefined },
    { requestId: 'stale' }, { hardReport: undefined },
  ])('rejects incompatible final metadata: %j', override => {
    expect(parse({ ...response, ...override })).toBeNull();
  });

  it.each([
    { error: 'failed' },
    { boundedCandidate: createTestDisplayHardReport() },
    { phaseProgress: {} },
  ])('rejects scope on non-final messages: %j', message => {
    expect(parse({ requestId: 'scope', ...message, eligibleEdgeIds: [] })).toBeNull();
  });
});
