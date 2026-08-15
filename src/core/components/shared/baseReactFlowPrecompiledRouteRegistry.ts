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
  const merged = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, safePatches);
  if (!merged) return null;
  return baseReactFlowDisplayOutputRouteSignatureMatches(
    merged,
    entry.outputRouteSignature,
  ) ? merged : null;
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
