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
  sanitizeBaseReactFlowPrecompiledRoutePatches,
} from '../baseReactFlowPrecompiledRouteArtifact';
import {
  loadBaseReactFlowPrecompiledRouteCandidateFromRegistry,
} from '../baseReactFlowPrecompiledRouteRegistry';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import { GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS } from '../generated/baseReactFlowPrecompiledRouteLoaders';

const SOURCE_HASH = `source-v1:${'a'.repeat(64)}`;

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

  it('replays the explicitly authorized router-owned trunk intent', async () => {
    const routedWithIntent = [{
      ...routedEdges[0],
      data: {
        ...(routedEdges[0].data || {}),
        sharedTrunkAware: true,
        sharedTrunkSynthesized: false,
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

  it('keeps the generated WMS artifact parseable through its lazy descriptor', async () => {
    const [generatedSignature, descriptor] = Object.entries(
      GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS,
    )[0] ?? [];
    expect(generatedSignature).toMatch(/^\d{1,10}$/);
    expect(descriptor).toBeTruthy();
    const raw = await descriptor.load();
    expect(parseBaseReactFlowPrecompiledRouteArtifact(raw, {
      inputSignature: generatedSignature,
      inputGeometryDigest: descriptor.geometryDigest,
      sourceHash: descriptor.sourceHash,
    })).not.toBeNull();
  });
});
