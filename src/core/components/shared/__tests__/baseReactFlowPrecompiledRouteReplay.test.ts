// @vitest-environment jsdom

import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { loadBaseReactFlowPrecompiledRouteCandidateFromRegistry } from '../baseReactFlowPrecompiledRouteRegistry';
import { getGeneratedPrecompiledRouteArtifactForTest } from './fixtures/generatedPrecompiledRouteArtifacts';

type GeneratedPrecompiledRouteArtifactForReplay = {
  routingSourceHash: string;
  sourceHash: string;
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  patches: Edge[];
};

describe('baseReactFlowPrecompiledRouteReplay', () => {
  it('replays generated initial artifacts through the runtime artifact merge path', async () => {
    for (const presetId of [
      'wms-demand-allocation-strategy-v2',
      'wms-process-flow-v1',
      'logistics-architecture-v1',
    ]) {
      const expectedArtifact = getGeneratedPrecompiledRouteArtifactForTest(
        presetId,
      ) as GeneratedPrecompiledRouteArtifactForReplay;
      const sourceEdges = expectedArtifact.patches.map((patch: Edge) => ({
        id: patch.id,
        source: patch.source,
        target: patch.target,
        type: patch.type,
        sourceHandle: patch.sourceHandle,
        targetHandle: patch.targetHandle,
        data: {},
      })) as Edge[];
      const diagnostics: unknown[] = [];
      const result = await loadBaseReactFlowPrecompiledRouteCandidateFromRegistry(
        {
          nodes: [],
          edges: sourceEdges,
          enableSmartEdges: true,
          smartEdgePadding: 20,
          isLargeGraph: true,
          inputSignature: expectedArtifact.inputSignature,
          inputGeometryDigest: expectedArtifact.inputGeometryDigest,
          onDiagnostic: diagnostic => diagnostics.push(diagnostic),
        },
        {
          [expectedArtifact.inputSignature]: {
            presetId,
            variantId: 'initial',
            routingSourceHash: expectedArtifact.routingSourceHash,
            sourceHash: expectedArtifact.sourceHash,
            geometryDigest: expectedArtifact.inputGeometryDigest,
            load: async () => expectedArtifact,
          },
        },
      );
      if (!result) {
        throw new Error(`Expected ${presetId} to replay: ${JSON.stringify(diagnostics)}`);
      }
      expect(computeBaseReactFlowDisplayOutputRouteSignature(result), presetId)
        .toBe(expectedArtifact.outputRouteSignature);
      expect(diagnostics.at(-1), presetId).toMatchObject({ reason: 'hit' });
    }
  });
});
