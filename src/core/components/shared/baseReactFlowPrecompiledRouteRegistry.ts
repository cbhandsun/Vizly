import type { Edge } from '@xyflow/react';

import {
  baseReactFlowDisplayOutputRouteSignatureMatches,
  type BaseReactFlowDisplayEdgesCacheEntry,
} from './baseReactFlowDisplayCache';
import {
  mergeBaseReactFlowDisplayEdgePatches,
} from './baseReactFlowDisplayRoutingTransaction';
import {
  computeBaseReactFlowDisplayGeometryDigest,
  isBaseReactFlowDisplayGeometryDigest,
  type BaseReactFlowDisplayInputIdentity,
} from './baseReactFlowDisplayInputIdentity';
import {
  parseBaseReactFlowPrecompiledRouteArtifact,
  sanitizeBaseReactFlowPrecompiledRoutePatches,
} from './baseReactFlowPrecompiledRouteArtifact';
import {
  GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS,
  type GeneratedBaseReactFlowPrecompiledRouteDescriptor,
} from './generated/baseReactFlowPrecompiledRouteLoaders';

export type BaseReactFlowPrecompiledRouteLookupInput = BaseReactFlowDisplayInputIdentity & {
  inputSignature: string;
  /** Trusted runtime memo; callers outside the routing hook should omit it. */
  inputGeometryDigest?: string;
};

export type BaseReactFlowPrecompiledRouteLoaderRegistry = Record<
  string,
  GeneratedBaseReactFlowPrecompiledRouteDescriptor
>;

export const hasBaseReactFlowPrecompiledRouteCandidateInRegistry = (
  inputSignature: string,
  inputGeometryDigest: string,
  registry: BaseReactFlowPrecompiledRouteLoaderRegistry,
): boolean => {
  if (!Object.prototype.hasOwnProperty.call(registry, inputSignature)) return false;
  const descriptor = registry[inputSignature];
  return Boolean(descriptor && descriptor.geometryDigest === inputGeometryDigest);
};

export const hasBaseReactFlowPrecompiledRouteCandidate = (
  inputSignature: string,
  inputGeometryDigest: string,
): boolean => hasBaseReactFlowPrecompiledRouteCandidateInRegistry(
  inputSignature,
  inputGeometryDigest,
  GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS,
);

/**
 * Precompiled artifacts have a stricter build-time schema than mutable browser
 * storage and may carry the three router-owned trunk booleans. They therefore
 * use a dedicated merge path; persistent-cache sanitization remains unchanged.
 */
export const mergeTrustedBaseReactFlowPrecompiledRouteArtifact = (
  sourceEdges: Edge[],
  entry: BaseReactFlowDisplayEdgesCacheEntry,
): Edge[] | null => {
  if (entry.hardClean !== true) return null;
  const safePatches = sanitizeBaseReactFlowPrecompiledRoutePatches(sourceEdges, entry.edges);
  if (!safePatches) return null;
  const merged = mergeBaseReactFlowPrecompiledRoutePatches(sourceEdges, safePatches);
  if (!merged) return null;
  return baseReactFlowDisplayOutputRouteSignatureMatches(
    merged,
    entry.outputRouteSignature,
  ) ? merged : null;
};

/**
 * Generated route artifacts carry a complete `treeRouting` contract. The
 * ordinary Worker/cache patch merger is intentionally recursive because those
 * patches are incremental. Reusing it without this replacement step can retain
 * stale source points or effective handles that are absent from the generated
 * route and invalidate the artifact's output signature.
 */
export const mergeBaseReactFlowPrecompiledRoutePatches = (
  sourceEdges: Edge[],
  patches: Edge[],
): Edge[] | null => {
  const merged = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, patches);
  if (!merged) return null;
  return merged.map((edge, index) => {
    const patchData = patches[index]?.data;
    if (
      !patchData
      || typeof patchData !== 'object'
      || Array.isArray(patchData)
      || !Object.prototype.hasOwnProperty.call(patchData, 'treeRouting')
    ) return edge;
    const edgeData = edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
      ? edge.data
      : {};
    return {
      ...edge,
      data: {
        ...edgeData,
        treeRouting: patchData.treeRouting,
      },
    };
  });
};

export const loadBaseReactFlowPrecompiledRouteCandidateFromRegistry = async (
  input: BaseReactFlowPrecompiledRouteLookupInput,
  registry: BaseReactFlowPrecompiledRouteLoaderRegistry,
): Promise<Edge[] | null> => {
  const descriptor = registry[input.inputSignature];
  if (!descriptor) return null;
  const inputGeometryDigest = typeof input.inputGeometryDigest === 'undefined'
    ? computeBaseReactFlowDisplayGeometryDigest(input)
    : (isBaseReactFlowDisplayGeometryDigest(input.inputGeometryDigest)
      ? input.inputGeometryDigest
      : null);
  if (!inputGeometryDigest) return null;
  if (descriptor.geometryDigest !== inputGeometryDigest) return null;
  try {
    const artifact = await descriptor.load();
    const entry = parseBaseReactFlowPrecompiledRouteArtifact(artifact, {
      inputSignature: input.inputSignature,
      inputGeometryDigest,
      sourceHash: descriptor.sourceHash,
    });
    if (!entry) return null;
    return mergeTrustedBaseReactFlowPrecompiledRouteArtifact(input.edges, entry);
  } catch {
    return null;
  }
};

export const loadBaseReactFlowPrecompiledRouteCandidate = (
  input: BaseReactFlowPrecompiledRouteLookupInput,
): Promise<Edge[] | null> => loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
  input,
  GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS,
);
