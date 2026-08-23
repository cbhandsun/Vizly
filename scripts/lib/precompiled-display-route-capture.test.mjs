import { describe, expect, it } from 'vitest';

import {
  createPrecompiledDisplayRoutePatches,
  isFreshFullRouteResolution,
  isFreshFullRouteRequestResponse,
  isMatchingHardCleanDisplayWorkerResponse,
  precompiledDisplayRouteContractsMatch,
  replayPrecompiledDisplayRoutePatches,
  replayTrustedDisplayRoutePatches,
} from './precompiled-display-route-capture.mjs';

const source = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  type: 'advanced-smart-step',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
}];

const routed = [{
  ...source[0],
  type: 'stablePath',
  data: {
    computedPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }],
    sharedTrunkAware: true,
    overextendedTargetTrunkCorridorReclaimed: true,
  },
}];

describe('precompiled display route capture', () => {
  it('treats an in-job final repair as a fresh full route', () => {
    expect(isFreshFullRouteResolution('full-route')).toBe(true);
    expect(isFreshFullRouteResolution('full-route-repaired')).toBe(true);
    expect(isFreshFullRouteResolution('validated-candidate')).toBe(false);
    expect(isFreshFullRouteResolution('repaired-candidate')).toBe(false);
    expect(isFreshFullRouteResolution(null)).toBe(false);
  });

  it('requires a candidate-free route request for regeneration capture', () => {
    const response = { routeResolution: 'full-route' };
    expect(isFreshFullRouteRequestResponse({ operation: 'route' }, response)).toBe(true);
    expect(isFreshFullRouteRequestResponse({
      operation: 'route',
      candidateEdges: [],
    }, response)).toBe(false);
    expect(isFreshFullRouteRequestResponse({
      operation: 'validate-or-route',
    }, response)).toBe(false);
    expect(isFreshFullRouteRequestResponse({ operation: 'route' }, {
      routeResolution: 'validated-candidate',
    })).toBe(false);
  });

  it('accepts only the matching final hard-clean worker response', () => {
    const request = { operation: 'route', requestId: 'request-1', edges: source };
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1',
      hardClean: true,
      routeResolution: 'full-route',
      edges: routed,
    })).toBe(true);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1',
      hardClean: true,
      routeResolution: 'full-route-repaired',
      edges: routed,
    })).toBe(true);
    expect(isMatchingHardCleanDisplayWorkerResponse({
      ...request,
      operation: 'validate-or-route',
    }, {
      requestId: 'request-1',
      hardClean: true,
      routeResolution: 'repaired-candidate',
      edges: routed,
    })).toBe(true);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-2',
      hardClean: true,
      routeResolution: 'full-route',
      edges: routed,
    })).toBe(false);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1:repair',
      hardClean: true,
      routeResolution: 'repair',
      edges: routed,
    })).toBe(false);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1',
      boundedCandidate: {},
    })).toBe(false);
    expect(isMatchingHardCleanDisplayWorkerResponse(request, {
      requestId: 'request-1',
      hardClean: false,
      routeResolution: 'full-route',
      edges: routed,
    })).toBe(false);
  });

  it('projects only explicit routing fields including authorized trunk intent', () => {
    expect(createPrecompiledDisplayRoutePatches(source, routed)).toEqual([{
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }],
        sharedTrunkAware: true,
        overextendedTargetTrunkCorridorReclaimed: true,
      },
    }]);
    expect(createPrecompiledDisplayRoutePatches(
      [{ ...source[0], sourceHandle: undefined }],
      [{ ...routed[0], sourceHandle: undefined }],
    )?.[0]).not.toHaveProperty('sourceHandle');
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      sourceHandle: 'bottom',
      targetHandle: 'top',
    }])).toMatchObject([{
      sourceHandle: 'bottom',
      targetHandle: 'top',
    }]);
  });

  it('captures unchanged projected terminals so replay is independent of raw source defaults', () => {
    const patches = createPrecompiledDisplayRoutePatches(source, routed);
    expect(patches?.[0]).toMatchObject({
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
    });
  });

  it('captures only bounded line-hop quality identity', () => {
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      data: { ...routed[0].data, h: ';50,50;' },
    }])?.[0].data).toMatchObject({ h: ';50,50;' });
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      data: { ...routed[0].data, h: 'x'.repeat(129) },
    }])).toBeNull();
  });

  it('rejects malformed intent and routing-field deletion', () => {
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      data: { ...routed[0].data, sharedTrunkAware: 'yes' },
    }])).toBeNull();
    expect(createPrecompiledDisplayRoutePatches(source, [{
      ...routed[0],
      data: { ...routed[0].data, overextendedTargetTrunkCorridorReclaimed: 1 },
    }])).toBeNull();
    const missingHandle = { ...routed[0] };
    delete missingHandle.sourceHandle;
    expect(createPrecompiledDisplayRoutePatches(source, [missingHandle])).toBeNull();
  });

  it('replaces the complete tree-routing contract instead of retaining stale source fields', () => {
    const sourceWithStaleTree = [{
      ...source[0],
      data: {
        ...source[0].data,
        businessLabel: 'preserved',
        treeRouting: {
          effectiveSourceHandle: 'right',
          effectiveTargetHandle: 'left',
          points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        },
      },
    }];
    const routedWithoutTreeFields = [{
      ...routed[0],
      data: {
        ...routed[0].data,
        businessLabel: 'preserved',
        treeRouting: {},
      },
    }];
    const patches = createPrecompiledDisplayRoutePatches(
      sourceWithStaleTree,
      routedWithoutTreeFields,
    );
    expect(patches).not.toBeNull();
    const replayed = replayPrecompiledDisplayRoutePatches(sourceWithStaleTree, patches);

    expect(replayed?.[0].data).toMatchObject({
      businessLabel: 'preserved',
      treeRouting: {},
    });
    expect(replayed?.[0].data.treeRouting).toEqual({});
    expect(precompiledDisplayRouteContractsMatch(replayed, routedWithoutTreeFields)).toBe(true);
  });

  it('fails replay proof when any route-signature field differs', () => {
    const patches = createPrecompiledDisplayRoutePatches(source, routed);
    const replayed = replayPrecompiledDisplayRoutePatches(source, patches);
    expect(precompiledDisplayRouteContractsMatch(replayed, routed)).toBe(true);
    expect(precompiledDisplayRouteContractsMatch(replayed, [{
      ...routed[0],
      data: {
        ...routed[0].data,
        computedPath: [{ x: 0, y: 0 }, { x: 101, y: 0 }],
      },
    }])).toBe(false);
  });

  it('replays committed display patches before projecting the generated artifact', () => {
    const committedPatches = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      data: {
        computedPath: routed[0].data.computedPath,
        treeRouting: {
          effectiveSourceHandle: 'right',
          points: [{ x: 0, y: 0 }, { x: 100, y: 50 }],
        },
      },
    }];
    const replayed = replayTrustedDisplayRoutePatches(source, committedPatches);
    expect(replayed?.[0]).toMatchObject({
      type: 'stablePath',
      data: {
        computedPath: routed[0].data.computedPath,
        treeRouting: {
          effectiveSourceHandle: 'right',
          points: [{ x: 0, y: 0 }, { x: 100, y: 50 }],
        },
      },
    });
    expect(replayTrustedDisplayRoutePatches(source, [{
      ...committedPatches[0],
      id: 'wrong-edge',
    }])).toBeNull();
  });
});
