// @vitest-environment node

import { describe, expect, it } from 'vitest';
import requests from './fixtures/enterpriseUnroutedDisplayRequests.json';
import initialRequest from './fixtures/enterpriseInitialDisplayRequest.json';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { parseDisplayEdgesWorkerRequest } from '../baseReactFlowDisplayWorkerProtocol';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import { EDGE_ROUTING_CACHE_VERSION } from '../../../routing/routingVersion';

describe('ordinary enterprise route construction', () => {
  it.each([
    // Run the ordinary first-open input before the other graphs warm routing.
    ['first open with unsafe provisional layout paths', 2],
    ['standard process to side-by-side swimlanes', 0],
    ['restored standard process without computed paths', 1],
  ] as const)('commits %s within the unchanged interactive deadline', (_, index) => {
    // Captured ordinary requests, including staged layout candidates and manual
    // port constraints. No capture-mode seed, forced full mode or extra timeout.
    const captured = index === 2 ? initialRequest : requests[index];
    const parsed = parseDisplayEdgesWorkerRequest({
      ...captured,
      inputIdentity: { ...captured.inputIdentity, routingVersion: EDGE_ROUTING_CACHE_VERSION },
    });
    expect(parsed).not.toBeNull();
    if (!parsed || parsed.operation === 'repair') throw new Error('Invalid ordinary routing fixture');
    const identity = computeBaseReactFlowDisplayInputIdentityBundle(parsed);
    const request = { ...parsed, inputIdentity: createDisplayRoutingIdentity(identity.cacheSignature, identity.geometryDigest) };
    const original = structuredClone(request);
    const startedAt = performance.now();
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse(request);
    expect(performance.now() - startedAt).toBeLessThan(12_000);
    expect(response.requestId).toBe(request.requestId);
    expect(response.nextIdentity).toEqual(request.inputIdentity);
    expect(response.hardClean).toBe(true);
    expect(response.hardReport).toMatchObject({
      hardClean: true, obstacleHits: 0, terminalsAttached: true, terminalsAnchored: true,
      minimumClearanceViolations: 0, commercialClearanceViolations: 0,
      quality: {
        nonOrthogonalSegments: 0, strictCrossings: 0, reverseOverlap: 0,
        unrelatedOverlap: 0, unexplainedRelatedOverlap: 0, shortEndpointStubs: 0,
        tinyInteriorDoglegs: 0, hairpins: 0,
      },
    });
    expect(response.edges).toHaveLength(request.edges.length);
    if (index !== 2) {
      expect(response.edges?.find(edge => edge.id === 'edge-dep-back-1'))
        .toMatchObject({ sourceHandle: 'right', targetHandle: 'left' });
    }
    expect(request).toEqual(original);
  }, 15_000);
});
