import type { Edge } from '@xyflow/react';
import { ROUTING_PATCH_DATA_KEYS, type RoutingPatch } from '../../routing/routingPatch';

import {
  BASE_DISPLAY_ROUTING_VERSION,
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
import { baseReactFlowDisplayCommercialQualityIsClean } from './baseReactFlowDisplayCommercialQuality';
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
  /** Debug-only aggregate status; never include graph content or artifact payloads. */
  onDiagnostic?: (diagnostic: BaseReactFlowPrecompiledRouteDiagnostic) => void;
};

export type BaseReactFlowPrecompiledRouteDiagnosticReason =
  | 'hit'
  | 'miss:invalid-geometry-digest'
  | 'miss:no-descriptor'
  | 'miss:geometry-digest'
  | 'reject:load-error'
  | 'reject:artifact-schema'
  | 'reject:routing-version'
  | 'reject:routing-source-hash'
  | 'reject:source-hash'
  | 'reject:input-identity'
  | 'reject:contract-dirty'
  | 'reject:commercial-quality'
  | 'reject:patch-merge';

export type BaseReactFlowPrecompiledRouteDiagnostic = Readonly<{
  reason: BaseReactFlowPrecompiledRouteDiagnosticReason;
  inputSignature: string;
  inputGeometryDigest?: string;
  presetId?: string;
  variantId?: string;
}>;

type BaseReactFlowPrecompiledRouteLoaderBucket =
  | GeneratedBaseReactFlowPrecompiledRouteDescriptor
  | readonly GeneratedBaseReactFlowPrecompiledRouteDescriptor[];

export type BaseReactFlowPrecompiledRouteLoaderRegistry = Record<
  string,
  BaseReactFlowPrecompiledRouteLoaderBucket
>;

const findExactPrecompiledRouteDescriptor = (
  inputSignature: string,
  inputGeometryDigest: string,
  registry: BaseReactFlowPrecompiledRouteLoaderRegistry,
): GeneratedBaseReactFlowPrecompiledRouteDescriptor | null => {
  if (!Object.prototype.hasOwnProperty.call(registry, inputSignature)) return null;
  const entry = registry[inputSignature];
  const descriptors = Array.isArray(entry) ? entry : [entry];
  return descriptors.find(descriptor => (
    descriptor?.geometryDigest === inputGeometryDigest
  )) ?? null;
};

const emitPrecompiledRouteDiagnostic = (
  input: BaseReactFlowPrecompiledRouteLookupInput,
  diagnostic: Omit<BaseReactFlowPrecompiledRouteDiagnostic, 'inputSignature'>,
): void => {
  input.onDiagnostic?.({
    inputSignature: input.inputSignature,
    ...diagnostic,
  });
};

const classifyPrecompiledRouteArtifactRejection = (
  artifact: unknown,
  expectation: {
    inputSignature: string;
    inputGeometryDigest: string;
    sourceHash: string;
    routingSourceHash?: string;
  },
): BaseReactFlowPrecompiledRouteDiagnosticReason => {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return 'reject:artifact-schema';
  }
  const record = artifact as Record<string, unknown>;
  if (record.routingVersion !== BASE_DISPLAY_ROUTING_VERSION) return 'reject:routing-version';
  if (
    typeof expectation.routingSourceHash !== 'undefined'
    && record.routingSourceHash !== expectation.routingSourceHash
  ) return 'reject:routing-source-hash';
  if (record.sourceHash !== expectation.sourceHash) return 'reject:source-hash';
  if (
    record.inputSignature !== expectation.inputSignature
    || record.inputGeometryDigest !== expectation.inputGeometryDigest
  ) return 'reject:input-identity';
  const contract = record.routingContract;
  if (
    contract
    && typeof contract === 'object'
    && !Array.isArray(contract)
    && (
      (contract as { clean?: unknown }).clean !== true
      || (contract as { hardClean?: unknown }).hardClean !== true
    )
  ) return 'reject:contract-dirty';
  if (Array.isArray(record.patches) && !baseReactFlowDisplayCommercialQualityIsClean(record.patches as RoutingPatch[])) {
    return 'reject:commercial-quality';
  }
  return 'reject:artifact-schema';
};

export const hasBaseReactFlowPrecompiledRouteCandidateInRegistry = (
  inputSignature: string,
  inputGeometryDigest: string,
  registry: BaseReactFlowPrecompiledRouteLoaderRegistry,
): boolean => {
  return findExactPrecompiledRouteDescriptor(
    inputSignature,
    inputGeometryDigest,
    registry,
  ) !== null;
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
 * Generated route artifacts carry a complete routing-data contract. The
 * ordinary Worker/cache patch merger is intentionally recursive because those
 * patches are incremental. Reusing it without this replacement step can retain
 * stale source paths, jump hints or trunk flags absent from the generated
 * route and invalidate the artifact's output signature.
 */
export const mergeBaseReactFlowPrecompiledRoutePatches = (
  sourceEdges: Edge[],
  patches: RoutingPatch[],
): Edge[] | null => {
  const merged = mergeBaseReactFlowDisplayEdgePatches(sourceEdges, patches);
  if (!merged) return null;
  return merged.map((edge, index) => {
    const patchData = patches[index]?.data;
    if (
      !patchData
      || typeof patchData !== 'object'
      || Array.isArray(patchData)
    ) return edge;
    const edgeData = edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
      ? edge.data
      : {};
    const data: Record<string, unknown> = { ...edgeData };
    for (const key of ROUTING_PATCH_DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patchData, key)) data[key] = patchData[key];
      else delete data[key];
    }
    return { ...edge, data };
  });
};

export const loadBaseReactFlowPrecompiledRouteCandidateFromRegistry = async (
  input: BaseReactFlowPrecompiledRouteLookupInput,
  registry: BaseReactFlowPrecompiledRouteLoaderRegistry,
): Promise<Edge[] | null> => {
  const inputGeometryDigest = typeof input.inputGeometryDigest === 'undefined'
    ? computeBaseReactFlowDisplayGeometryDigest(input)
    : (isBaseReactFlowDisplayGeometryDigest(input.inputGeometryDigest)
      ? input.inputGeometryDigest
      : null);
  if (!inputGeometryDigest) {
    emitPrecompiledRouteDiagnostic(input, { reason: 'miss:invalid-geometry-digest' });
    return null;
  }
  const descriptor = findExactPrecompiledRouteDescriptor(
    input.inputSignature,
    inputGeometryDigest,
    registry,
  );
  if (!descriptor) {
    emitPrecompiledRouteDiagnostic(input, {
      reason: Object.prototype.hasOwnProperty.call(registry, input.inputSignature)
        ? 'miss:geometry-digest'
        : 'miss:no-descriptor',
      inputGeometryDigest,
    });
    return null;
  }
  try {
    const artifact = await descriptor.load();
    const expectation = {
      inputSignature: input.inputSignature,
      inputGeometryDigest,
      sourceHash: descriptor.sourceHash,
      routingSourceHash: descriptor.routingSourceHash,
    };
    const entry = parseBaseReactFlowPrecompiledRouteArtifact(artifact, expectation);
    if (!entry) {
      emitPrecompiledRouteDiagnostic(input, {
        reason: classifyPrecompiledRouteArtifactRejection(artifact, expectation),
        inputGeometryDigest,
        presetId: descriptor.presetId,
        variantId: descriptor.variantId,
      });
      return null;
    }
    const merged = mergeTrustedBaseReactFlowPrecompiledRouteArtifact(input.edges, entry);
    emitPrecompiledRouteDiagnostic(input, {
      reason: merged ? 'hit' : 'reject:patch-merge',
      inputGeometryDigest,
      presetId: descriptor.presetId,
      variantId: descriptor.variantId,
    });
    return merged;
  } catch {
    emitPrecompiledRouteDiagnostic(input, {
      reason: 'reject:load-error',
      inputGeometryDigest,
      presetId: descriptor.presetId,
      variantId: descriptor.variantId,
    });
    return null;
  }
};

export const loadBaseReactFlowPrecompiledRouteCandidate = (
  input: BaseReactFlowPrecompiledRouteLookupInput,
): Promise<Edge[] | null> => loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
  input,
  GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS,
);
