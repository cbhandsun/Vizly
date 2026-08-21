import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  BASE_DISPLAY_ROUTING_VERSION,
  computeBaseReactFlowDisplayCacheSignature,
  computeBaseReactFlowDisplayOutputRouteSignature,
} from '../baseReactFlowDisplayCache';
import { computeBaseReactFlowDisplayGeometryDigest } from '../baseReactFlowDisplayInputIdentity';
import {
  BASE_REACT_FLOW_PRECOMPILED_ROUTE_SCHEMA,
  parseBaseReactFlowPrecompiledRouteArtifact,
  parseBaseReactFlowPrecompiledRoutePatches,
  sanitizeBaseReactFlowPrecompiledRoutePatches,
} from '../baseReactFlowPrecompiledRouteArtifact';
import { loadBaseReactFlowPrecompiledRouteAsset } from '../baseReactFlowPrecompiledRouteAsset';
import {
  hasBaseReactFlowPrecompiledRouteCandidateInRegistry,
  loadBaseReactFlowPrecompiledRouteCandidateFromRegistry,
} from '../baseReactFlowPrecompiledRouteRegistry';
import {
  prefetchBaseReactFlowPrecompiledRouteFromRegistry,
} from '../baseReactFlowPrecompiledRoutePrefetch';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import { auditBaseReactFlowDisplayCommercialQuality } from '../baseReactFlowDisplayCommercialQuality';
import { GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS } from '../generated/baseReactFlowPrecompiledRouteLoaders';
import { getGeneratedPrecompiledRouteArtifactForTest } from './fixtures/generatedPrecompiledRouteArtifacts';

const SOURCE_HASH = `source-v1:${'a'.repeat(64)}`;
const TEST_PRESET_ID = 'test-preset';
const generatedDemandAllocationArtifact = getGeneratedPrecompiledRouteArtifactForTest(
  'wms-demand-allocation-strategy-v2',
) as {
  schema: typeof BASE_REACT_FLOW_PRECOMPILED_ROUTE_SCHEMA;
  routingVersion: string;
  sourceHash: string;
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  hardClean: true;
  patches: Edge[];
};

type NodeWithResolvedPosition = Node & {
  positionAbsolute: { x: number; y: number };
};

const nodes: NodeWithResolvedPosition[] = [
  {
    id: 'source',
    type: 'custom',
    position: { x: 0, y: 0 },
    positionAbsolute: { x: 0, y: 0 },
    measured: { width: 100, height: 60 },
    data: { layoutDirection: 'LR' },
  },
  {
    id: 'target',
    type: 'custom',
    position: { x: 300, y: 0 },
    positionAbsolute: { x: 300, y: 0 },
    measured: { width: 100, height: 60 },
    data: { layoutDirection: 'LR' },
  },
];

const sourceEdges: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  type: 'advanced-smart-step',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {
    computedPath: [
      { x: 100, y: 30 },
      { x: 180, y: 30 },
      { x: 180, y: 90 },
      { x: 300, y: 90 },
    ],
  },
}];

const routedEdges: Edge[] = [{
  ...sourceEdges[0],
  data: {
    ...(sourceEdges[0].data || {}),
    computedPath: [
      { x: 100, y: 30 },
      { x: 200, y: 30 },
      { x: 200, y: 30 },
      { x: 300, y: 30 },
    ],
  },
}];

const identityInput = {
  nodes,
  edges: sourceEdges,
  enableSmartEdges: true,
  smartEdgePadding: 20,
  isLargeGraph: false,
};

const inputSignature = computeBaseReactFlowDisplayCacheSignature(identityInput);
const inputGeometryDigest = computeBaseReactFlowDisplayGeometryDigest(identityInput);
const patches = createBaseReactFlowDisplayEdgePatches(sourceEdges, routedEdges)!;
const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(routedEdges)!;

const artifact = {
  schema: BASE_REACT_FLOW_PRECOMPILED_ROUTE_SCHEMA,
  routingVersion: BASE_DISPLAY_ROUTING_VERSION,
  sourceHash: SOURCE_HASH,
  inputSignature,
  inputGeometryDigest,
  outputRouteSignature,
  hardClean: true,
  patches,
};

describe('baseReactFlowPrecompiledRouteRegistry', () => {
  it('recognizes only an own exact signature and geometry descriptor', () => {
    const descriptor = {
      sourceHash: SOURCE_HASH,
      geometryDigest: inputGeometryDigest,
      load: vi.fn(async () => artifact),
    };
    expect(hasBaseReactFlowPrecompiledRouteCandidateInRegistry(
      inputSignature,
      inputGeometryDigest,
      { [inputSignature]: descriptor },
    )).toBe(true);
    expect(hasBaseReactFlowPrecompiledRouteCandidateInRegistry(
      inputSignature,
      'geometry-v1:00000000000000000000000000000000',
      { [inputSignature]: descriptor },
    )).toBe(false);
    expect(hasBaseReactFlowPrecompiledRouteCandidateInRegistry(
      'toString',
      inputGeometryDigest,
      {},
    )).toBe(false);
  });

  it('lazy-loads an exact signature and digest hit into the current source graph', async () => {
    const load = vi.fn(async () => artifact);
    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...identityInput, inputSignature },
      {
        [inputSignature]: {
          sourceHash: SOURCE_HASH,
          geometryDigest: inputGeometryDigest,
          load,
        },
      },
    )).resolves.toEqual(routedEdges);
    expect(load).toHaveBeenCalledOnce();
  });

  it('prefetches a known preset once without treating the preset id as route identity', async () => {
    const load = vi.fn(async () => artifact);
    const cache = new Map<string, Promise<boolean>>();
    const registry = {
      [TEST_PRESET_ID]: {
        presetId: TEST_PRESET_ID,
        sourceHash: SOURCE_HASH,
        geometryDigest: inputGeometryDigest,
        load,
      },
    };

    await expect(prefetchBaseReactFlowPrecompiledRouteFromRegistry(
      TEST_PRESET_ID,
      registry,
      cache,
    )).resolves.toBe(true);
    await expect(prefetchBaseReactFlowPrecompiledRouteFromRegistry(
      TEST_PRESET_ID,
      registry,
      cache,
    )).resolves.toBe(true);
    await expect(prefetchBaseReactFlowPrecompiledRouteFromRegistry(
      'unknown-preset',
      registry,
      cache,
    )).resolves.toBe(false);
    await expect(prefetchBaseReactFlowPrecompiledRouteFromRegistry(
      '__proto__',
      registry,
      cache,
    )).resolves.toBe(false);
    await expect(prefetchBaseReactFlowPrecompiledRouteFromRegistry(
      'x'.repeat(201),
      registry,
      cache,
    )).resolves.toBe(false);
    expect(load).toHaveBeenCalledOnce();

    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...identityInput, inputSignature: '123' },
      {},
    )).resolves.toBeNull();
  });

  it('allows a failed preset prefetch to retry safely', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('transient chunk failure'))
      .mockResolvedValueOnce(artifact);
    const cache = new Map<string, Promise<boolean>>();
    const registry = {
      [TEST_PRESET_ID]: {
        presetId: TEST_PRESET_ID,
        sourceHash: SOURCE_HASH,
        geometryDigest: inputGeometryDigest,
        load,
      },
    };

    await expect(prefetchBaseReactFlowPrecompiledRouteFromRegistry(
      TEST_PRESET_ID,
      registry,
      cache,
    )).resolves.toBe(false);
    await expect(prefetchBaseReactFlowPrecompiledRouteFromRegistry(
      TEST_PRESET_ID,
      registry,
      cache,
    )).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('replays the explicitly authorized router-owned trunk intent', async () => {
    const routedWithIntent = [{
      ...routedEdges[0],
      data: {
        ...(routedEdges[0].data || {}),
        sharedTrunkAware: true,
        sharedTrunkSynthesized: false,
        overextendedTargetTrunkCorridorReclaimed: true,
      },
    }];
    const intentArtifact = {
      ...artifact,
      patches: createBaseReactFlowDisplayEdgePatches(sourceEdges, routedWithIntent)!,
      outputRouteSignature: computeBaseReactFlowDisplayOutputRouteSignature(routedWithIntent)!,
    };
    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...identityInput, inputSignature },
      {
        [inputSignature]: {
          sourceHash: SOURCE_HASH,
          geometryDigest: inputGeometryDigest,
          load: async () => intentArtifact,
        },
      },
    )).resolves.toEqual(routedWithIntent);
  });

  it('rejects precompiled handle changes that violate fixed terminal policy', async () => {
    const fixedSourceEdges: Edge[] = [{
      ...sourceEdges[0],
      data: {
        ...(sourceEdges[0].data || {}),
        sourceHandleLocked: true,
        targetPortPolicy: 'fixed',
      },
    }];
    const changedPatch = [{
      ...patches[0],
      sourceHandle: 'left',
      targetHandle: 'right',
    }];
    expect(sanitizeBaseReactFlowPrecompiledRoutePatches(
      fixedSourceEdges,
      changedPatch,
    )).toBeNull();

    const fixedInput = { ...identityInput, edges: fixedSourceEdges };
    const fixedSignature = computeBaseReactFlowDisplayCacheSignature(fixedInput);
    const fixedDigest = computeBaseReactFlowDisplayGeometryDigest(fixedInput);
    const changedEdges = [{
      ...fixedSourceEdges[0],
      sourceHandle: 'left',
      targetHandle: 'right',
      data: {
        ...(fixedSourceEdges[0].data || {}),
        computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
      },
    }];
    const fixedArtifact = {
      ...artifact,
      inputSignature: fixedSignature,
      inputGeometryDigest: fixedDigest,
      patches: createBaseReactFlowDisplayEdgePatches(fixedSourceEdges, changedEdges)!,
      outputRouteSignature: computeBaseReactFlowDisplayOutputRouteSignature(changedEdges)!,
    };
    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...fixedInput, inputSignature: fixedSignature },
      {
        [fixedSignature]: {
          sourceHash: SOURCE_HASH,
          geometryDigest: fixedDigest,
          load: async () => fixedArtifact,
        },
      },
    )).resolves.toBeNull();
  });

  it('accepts router-owned runtime-lock refinements in a trusted precompiled route', async () => {
    const runtimeLockedSource: Edge[] = [{
      ...sourceEdges[0],
      data: {
        ...(sourceEdges[0].data || {}),
        runtimeHandleLock: { source: true, target: true },
      },
    }];
    const runtimeRefinement = [{
      ...patches[0],
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [{ x: 50, y: 60 }, { x: 50, y: 160 }],
        treeRouting: {
          effectiveSourceHandle: 'bottom',
          effectiveTargetHandle: 'top',
          points: [{ x: 50, y: 60 }, { x: 50, y: 160 }],
        },
      },
    }];

    expect(sanitizeBaseReactFlowPrecompiledRoutePatches(
      runtimeLockedSource,
      runtimeRefinement,
    )).toEqual(runtimeRefinement);

    const runtimeInput = { ...identityInput, edges: runtimeLockedSource };
    const runtimeSignature = computeBaseReactFlowDisplayCacheSignature(runtimeInput);
    const runtimeDigest = computeBaseReactFlowDisplayGeometryDigest(runtimeInput);
    const refinedEdges = [{
      ...runtimeLockedSource[0],
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        ...(runtimeLockedSource[0].data || {}),
        ...(runtimeRefinement[0].data || {}),
      },
    }];
    const runtimeArtifact = {
      ...artifact,
      inputSignature: runtimeSignature,
      inputGeometryDigest: runtimeDigest,
      outputRouteSignature: computeBaseReactFlowDisplayOutputRouteSignature(refinedEdges)!,
      patches: runtimeRefinement,
    };
    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...runtimeInput, inputSignature: runtimeSignature },
      {
        [runtimeSignature]: {
          sourceHash: SOURCE_HASH,
          geometryDigest: runtimeDigest,
          load: async () => runtimeArtifact,
        },
      },
    )).resolves.toEqual(refinedEdges);
  });

  it('returns a safe miss without loading for absent signatures and digest collisions', async () => {
    const load = vi.fn(async () => artifact);
    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...identityInput, inputSignature: '123' },
      {},
    )).resolves.toBeNull();
    const movedNodes = nodes.map((node, index) => (
      index === 0
        ? { ...node, positionAbsolute: { x: 0.125, y: 0 } }
        : node
    ));
    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...identityInput, nodes: movedNodes, inputSignature },
      {
        [inputSignature]: {
          sourceHash: SOURCE_HASH,
          geometryDigest: inputGeometryDigest,
          load,
        },
      },
    )).resolves.toBeNull();
    expect(computeBaseReactFlowDisplayGeometryDigest({
      ...identityInput,
      nodes: movedNodes,
    })).not.toBe(inputGeometryDigest);
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ['schema', { ...artifact, schema: 'old-schema' }],
    ['version', { ...artifact, routingVersion: 'old-routing-version' }],
    ['source hash', { ...artifact, sourceHash: `source-v1:${'b'.repeat(64)}` }],
    ['digest', { ...artifact, inputGeometryDigest: `geometry-v1:${'0'.repeat(32)}` }],
    ['output signature', { ...artifact, outputRouteSignature: 'route-v2:1:4:0000000000000000' }],
    ['routing-only patch keys', {
      ...artifact,
      patches: [{ ...patches[0], label: 'must not be patched' }],
    }],
    ['routing-only data keys', {
      ...artifact,
      patches: [{ ...patches[0], data: { label: 'must not be patched' } }],
    }],
    ['non-boolean routing intent', {
      ...artifact,
      patches: [{
        ...patches[0],
        data: { ...(patches[0].data || {}), sharedTrunkAware: 'yes' },
      }],
    }],
    ['oversized line-hop identity', {
      ...artifact,
      patches: [{
        ...patches[0],
        data: { ...(patches[0].data || {}), h: 'x'.repeat(129) },
      }],
    }],
    ['unknown quality intent', {
      ...artifact,
      patches: [{
        ...patches[0],
        data: { ...(patches[0].data || {}), trustedQualityIntent: true },
      }],
    }],
  ])('rejects invalid %s artifacts and falls back safely', async (_name, invalidArtifact) => {
    const load = vi.fn(async () => invalidArtifact);
    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...identityInput, inputSignature },
      {
        [inputSignature]: {
          sourceHash: SOURCE_HASH,
          geometryDigest: inputGeometryDigest,
          load,
        },
      },
    )).resolves.toBeNull();
    expect(load).toHaveBeenCalledOnce();
  });

  it('treats loader failures as cache misses', async () => {
    const load = vi.fn(async () => { throw new Error('chunk failed'); });
    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...identityInput, inputSignature },
      {
        [inputSignature]: {
          sourceHash: SOURCE_HASH,
          geometryDigest: inputGeometryDigest,
          load,
        },
      },
    )).resolves.toBeNull();
  });

  it('rejects malformed lookup signatures even when artifact and expectation agree', () => {
    expect(parseBaseReactFlowPrecompiledRouteArtifact(
      { ...artifact, inputSignature: 'not-a-cache-key' },
      {
        inputSignature: 'not-a-cache-key',
        inputGeometryDigest,
        sourceHash: SOURCE_HASH,
      },
    )).toBeNull();
  });

  it('rejects an unknown renderer even with a matching output signature', async () => {
    const unknownRendererEdges = [{ ...routedEdges[0], type: 'unknown-renderer' }];
    const unknownRendererArtifact = {
      ...artifact,
      patches: createBaseReactFlowDisplayEdgePatches(sourceEdges, unknownRendererEdges)!,
      outputRouteSignature: computeBaseReactFlowDisplayOutputRouteSignature(unknownRendererEdges)!,
    };
    await expect(loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
      { ...identityInput, inputSignature },
      {
        [inputSignature]: {
          sourceHash: SOURCE_HASH,
          geometryDigest: inputGeometryDigest,
          load: async () => unknownRendererArtifact,
        },
      },
    )).resolves.toBeNull();
  });

  it('rejects artifacts whose aggregate routing paths exceed the worker budget', () => {
    const maximumPath = Array.from({ length: 2_000 }, (_, index) => ({ x: index, y: 0 }));
    const oversizedArtifact = {
      ...artifact,
      patches: Array.from({ length: 101 }, (_, index) => ({
        id: `edge-${index}`,
        source: 'source',
        target: 'target',
        data: { computedPath: maximumPath },
      })),
    };
    expect(parseBaseReactFlowPrecompiledRouteArtifact(oversizedArtifact, {
      inputSignature,
      inputGeometryDigest,
      sourceHash: SOURCE_HASH,
    })).toBeNull();
  });

  it('rejects a hard-clean claim with an excessive bend chain', () => {
    const excessiveBendEdges: Edge[] = [{
      ...routedEdges[0],
      data: {
        computedPath: [
          { x: 100, y: 30 }, { x: 100, y: 50 }, { x: 120, y: 50 },
          { x: 120, y: 70 }, { x: 140, y: 70 }, { x: 140, y: 90 },
          { x: 160, y: 90 }, { x: 160, y: 110 }, { x: 180, y: 110 },
          { x: 180, y: 130 }, { x: 200, y: 130 }, { x: 200, y: 150 },
          { x: 220, y: 150 }, { x: 220, y: 170 }, { x: 300, y: 170 },
        ],
      },
    }];
    const excessiveBendArtifact = {
      ...artifact,
      outputRouteSignature: computeBaseReactFlowDisplayOutputRouteSignature(excessiveBendEdges),
      patches: createBaseReactFlowDisplayEdgePatches(sourceEdges, excessiveBendEdges),
    };

    expect(parseBaseReactFlowPrecompiledRouteArtifact(excessiveBendArtifact, {
      inputSignature,
      inputGeometryDigest,
      sourceHash: SOURCE_HASH,
    })).toBeNull();
  });

  it('keeps the generated demand-allocation artifact parseable through its data descriptor', () => {
    const generatedEntry = Object.entries(
      GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS,
    ).find(([, candidate]) => (
      candidate.presetId === 'wms-demand-allocation-strategy-v2'
    ));
    expect(generatedEntry).toBeTruthy();
    if (!generatedEntry) throw new Error('Missing generated demand-allocation route descriptor');
    const [generatedSignature, descriptor] = generatedEntry;
    expect(generatedSignature).toMatch(/^\d{1,10}$/);
    expect(descriptor).toBeTruthy();
    expect(descriptor.load).toEqual(expect.any(Function));
    const parsedPatches = parseBaseReactFlowPrecompiledRoutePatches(
      generatedDemandAllocationArtifact.patches,
    );
    expect(parsedPatches).not.toBeNull();
    expect(auditBaseReactFlowDisplayCommercialQuality(parsedPatches ?? [])).toEqual([]);
    expect({
      schema: generatedDemandAllocationArtifact.schema,
      routingVersion: generatedDemandAllocationArtifact.routingVersion,
      sourceHash: generatedDemandAllocationArtifact.sourceHash,
      inputSignature: generatedDemandAllocationArtifact.inputSignature,
      inputGeometryDigest: generatedDemandAllocationArtifact.inputGeometryDigest,
      hardClean: generatedDemandAllocationArtifact.hardClean,
    }).toEqual({
      schema: BASE_REACT_FLOW_PRECOMPILED_ROUTE_SCHEMA,
      routingVersion: BASE_DISPLAY_ROUTING_VERSION,
      sourceHash: descriptor.sourceHash,
      inputSignature: generatedSignature,
      inputGeometryDigest: descriptor.geometryDigest,
      hardClean: true,
    });
    expect(parseBaseReactFlowPrecompiledRouteArtifact(generatedDemandAllocationArtifact, {
      inputSignature: generatedSignature,
      inputGeometryDigest: descriptor.geometryDigest,
      sourceHash: descriptor.sourceHash,
    })).not.toBeNull();
  });
});

describe('precompiled route asset boundary', () => {
  const sameOriginUrl = new URL('/assets/route-1.json', globalThis.location.href);

  it('deduplicates concurrent and repeated default asset loads', async () => {
    const cachedUrl = new URL('/assets/route-cache-success.json', globalThis.location.href);
    const fetchArtifact = vi.fn(async () => new Response('{"hardClean":true}', {
      headers: { 'content-length': '18', 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchArtifact);
    try {
      const [first, second] = await Promise.all([
        loadBaseReactFlowPrecompiledRouteAsset(cachedUrl),
        loadBaseReactFlowPrecompiledRouteAsset(cachedUrl),
      ]);
      await expect(loadBaseReactFlowPrecompiledRouteAsset(cachedUrl))
        .resolves.toEqual({ hardClean: true });
      expect(first).toEqual({ hardClean: true });
      expect(second).toEqual({ hardClean: true });
      expect(fetchArtifact).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('evicts a failed default asset load so a retry can recover', async () => {
    const retryUrl = new URL('/assets/route-cache-retry.json', globalThis.location.href);
    const fetchArtifact = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"hardClean":true}'));
    vi.stubGlobal('fetch', fetchArtifact);
    try {
      await expect(loadBaseReactFlowPrecompiledRouteAsset(retryUrl)).rejects.toThrow('HTTP 503');
      await expect(loadBaseReactFlowPrecompiledRouteAsset(retryUrl))
        .resolves.toEqual({ hardClean: true });
      expect(fetchArtifact).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('loads a bounded same-origin JSON document with constrained fetch options', async () => {
    const fetchArtifact = vi.fn(async () => new Response('{"hardClean":true}', {
      headers: { 'content-length': '18', 'content-type': 'application/json' },
    }));

    await expect(loadBaseReactFlowPrecompiledRouteAsset(sameOriginUrl, fetchArtifact))
      .resolves.toEqual({ hardClean: true });
    expect(fetchArtifact).toHaveBeenCalledWith(sameOriginUrl, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      redirect: 'error',
    });
  });

  it.each([
    ['cross-origin URL', new URL('https://example.invalid/route.json')],
    ['non-HTTP URL', new URL('file:///tmp/route.json')],
  ])('rejects a %s before issuing a request', async (_label, url) => {
    const fetchArtifact = vi.fn();
    await expect(loadBaseReactFlowPrecompiledRouteAsset(url, fetchArtifact)).rejects.toThrow(
      'same-origin HTTP(S)',
    );
    expect(fetchArtifact).not.toHaveBeenCalled();
  });

  it('rejects non-success responses, declared oversize bodies, and actual oversize bodies', async () => {
    await expect(loadBaseReactFlowPrecompiledRouteAsset(
      sameOriginUrl,
      async () => new Response('', { status: 503 }),
    )).rejects.toThrow('HTTP 503');
    await expect(loadBaseReactFlowPrecompiledRouteAsset(
      sameOriginUrl,
      async () => new Response('{}', { headers: { 'content-length': '1000001' } }),
    )).rejects.toThrow('byte limit');
    await expect(loadBaseReactFlowPrecompiledRouteAsset(
      sameOriginUrl,
      async () => new Response(`"${'x'.repeat(1_000_001)}"`),
    )).rejects.toThrow('byte limit');
  });

  it.each(['', 'not-json'])('rejects invalid JSON body %j', async (body) => {
    await expect(loadBaseReactFlowPrecompiledRouteAsset(
      sameOriginUrl,
      async () => new Response(body),
    )).rejects.toBeInstanceOf(SyntaxError);
  });
});
