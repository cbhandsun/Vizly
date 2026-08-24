import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import logisticsStandardData from '../../../../data/standardized/LogisticsStandardData.json';
import type { StandardDiagramData } from '../../../models/DiagramModels';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import {
  computeBaseReactFlowDisplayEdgeEpoch,
  withDisplayAbsolutePositions,
} from '../baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { doesDisplayCandidateMatchSourceGraph } from '../baseReactFlowDisplayCandidateValidation';
import { auditBaseReactFlowDisplayCommercialQuality } from '../baseReactFlowDisplayCommercialQuality';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import {
  parseBaseReactFlowPrecompiledRouteArtifact,
  sanitizeBaseReactFlowPrecompiledRoutePatches,
} from '../baseReactFlowPrecompiledRouteArtifact';
import {
  mergeBaseReactFlowPrecompiledRoutePatches,
  mergeTrustedBaseReactFlowPrecompiledRouteArtifact,
} from '../baseReactFlowPrecompiledRouteRegistry';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerClient';
import { parseDisplayEdgesWorkerRequest } from '../baseReactFlowDisplayWorkerProtocol';
import demandAllocationProductionRequest from './fixtures/demandAllocationProductionWorkerRequest.json';
import { getGeneratedPrecompiledRouteArtifactForTest } from './fixtures/generatedPrecompiledRouteArtifacts';
import './baseReactFlowDisplayEdges.testUtils';

const demandAllocationArtifact = getGeneratedPrecompiledRouteArtifactForTest(
  'wms-demand-allocation-strategy-v2',
) as {
  inputSignature: string;
  inputGeometryDigest: string;
  sourceHash: string;
};

type RoutePoint = { x: number; y: number };

const readComputedPath = (edge: Edge): RoutePoint[] => {
  const value = (edge.data as { computedPath?: unknown } | undefined)?.computedPath;
  if (!Array.isArray(value)) return [];
  return value.flatMap(point => {
    if (!point || typeof point !== 'object') return [];
    const candidate = point as { x?: unknown; y?: unknown };
    return typeof candidate.x === 'number' && Number.isFinite(candidate.x)
      && typeof candidate.y === 'number' && Number.isFinite(candidate.y)
      ? [{ x: candidate.x, y: candidate.y }]
      : [];
  });
};

const routeSnapshot = (edges: Edge[]) => edges.map(edge => ({
  id: edge.id,
  sourceHandle: edge.sourceHandle,
  targetHandle: edge.targetHandle,
  path: readComputedPath(edge),
}));

describe('BaseReactFlow precompiled route stability', () => {
  it('replays the generated WMS demand-allocation artifact over the production source graph', () => {
    const request = parseDisplayEdgesWorkerRequest(demandAllocationProductionRequest);
    expect(request).not.toBeNull();
    if (!request) return;
    const entry = parseBaseReactFlowPrecompiledRouteArtifact(demandAllocationArtifact, {
      inputSignature: demandAllocationArtifact.inputSignature,
      inputGeometryDigest: demandAllocationArtifact.inputGeometryDigest,
      sourceHash: demandAllocationArtifact.sourceHash,
    });
    expect(entry).not.toBeNull();
    if (!entry) return;

    const safePatches = sanitizeBaseReactFlowPrecompiledRoutePatches(request.edges, entry.edges);
    expect(safePatches).not.toBeNull();
    if (!safePatches) return;
    const merged = mergeBaseReactFlowPrecompiledRoutePatches(request.edges, safePatches);
    expect(merged).not.toBeNull();
    if (!merged) return;
    const mergedSignature = computeBaseReactFlowDisplayOutputRouteSignature(merged);
    const diagnostics = JSON.stringify({
      mergedSignature,
      artifactSignature: entry.outputRouteSignature,
    }, null, 2);
    expect(mergedSignature, diagnostics).toBe(entry.outputRouteSignature);
    expect(mergeTrustedBaseReactFlowPrecompiledRouteArtifact(request.edges, entry)).toEqual(merged);
    const repairNodes = withDisplayAbsolutePositions(
      request.nodes,
      new Map(request.nodes.map(node => [node.id, node] as const)),
    );
    const candidateHardReport = getDisplayHardQualityGateReport(merged, repairNodes, 'polished');
    const commercialIssues = auditBaseReactFlowDisplayCommercialQuality(merged);
    const replayRequest = parseDisplayEdgesWorkerRequest({
      ...request,
      operation: 'validate-or-route',
      requestId: 'generated-demand-allocation-replay',
      candidateEdges: merged,
      candidateSource: 'precompiled',
    });
    expect(replayRequest).not.toBeNull();
    if (!replayRequest) return;
    const replay = computeBaseReactFlowDisplayEdgesWorkerResponse(replayRequest);
    const replayDiagnostics = JSON.stringify({
      sourceMatches: doesDisplayCandidateMatchSourceGraph(request.edges, merged),
      candidateHardReport,
      commercialIssues,
      routeResolution: replay.routeResolution,
    }, null, 2);
    expect(doesDisplayCandidateMatchSourceGraph(request.edges, merged), replayDiagnostics).toBe(true);
    expect(candidateHardReport.hardClean, replayDiagnostics).toBe(true);
    expect(commercialIssues, replayDiagnostics).toEqual([]);
    expect(replay.routeResolution, replayDiagnostics).toBe('validated-candidate');
  });

  it('accepts a freshly generated Logistics full route without rewriting it', async () => {
    const canvas = await standardDataToCanvas(
      logisticsStandardData as unknown as StandardDiagramData,
    );
    const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
    const displayEdgeEpoch = computeBaseReactFlowDisplayEdgeEpoch(projected);
    const request = {
      edges: projected.edges,
      nodes: projected.nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch,
      qualityMode: 'full' as const,
    };
    const generated = computeBaseReactFlowDisplayEdgesWorkerResponse({
      ...request,
      operation: 'route',
      requestId: 'logistics-precompiled-generation',
    });
    const candidateEdges = generated.edges ?? [];
    const validated = computeBaseReactFlowDisplayEdgesWorkerResponse({
      ...request,
      operation: 'validate-or-route',
      requestId: 'logistics-precompiled-validation',
      candidateEdges,
      candidateSource: 'precompiled',
    });
    const diagnostics = JSON.stringify({ generated, validated }, null, 2);

    expect(generated.hardClean, diagnostics).toBe(true);
    expect(validated.hardClean, diagnostics).toBe(true);
    expect(validated.routeResolution, diagnostics).toBe('validated-candidate');
    expect(routeSnapshot(validated.edges ?? []), diagnostics).toEqual(routeSnapshot(candidateEdges));
  }, 120_000);

  it('uses the bounded precompiled fast path when hard, structural, and clearance gates pass', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'target', position: { x: 300, y: 0 }, data: {}, measured: { width: 80, height: 60 } },
    ];
    const sourceEdges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'stablePath',
      data: {},
    }];
    const candidateEdges: Edge[] = [{
      ...sourceEdges[0],
      data: { computedPath: [{ x: 80, y: 30 }, { x: 300, y: 30 }] },
    }];

    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'validate-or-route',
      requestId: 'precompiled-fast-path',
      edges: sourceEdges,
      nodes,
      candidateEdges,
      candidateSource: 'precompiled',
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
    });
    const diagnostics = JSON.stringify(response, null, 2);

    expect(response.hardClean, diagnostics).toBe(true);
    expect(response.routeResolution, diagnostics).toBe('validated-candidate');
    expect(routeSnapshot(response.edges ?? []), diagnostics).toEqual(routeSnapshot(candidateEdges));
    expect(response.phaseTrace?.map(trace => trace.phase), diagnostics)
      .toEqual(['candidate-validation', 'session-commit']);
    expect(response.phaseTrace?.at(-1), diagnostics).toMatchObject({
      phase: 'session-commit',
      resolution: 'skip',
    });
  });

  it('does not restore an older WMS detour after accepting a fresh precompiled candidate', async () => {
    const request = parseDisplayEdgesWorkerRequest(demandAllocationProductionRequest);
    expect(request).not.toBeNull();
    if (!request) return;
    const generated = computeBaseReactFlowDisplayEdgesWorkerResponse(request);
    const candidateEdges = generated.edges ?? [];
    const validationRequest = parseDisplayEdgesWorkerRequest({
      ...demandAllocationProductionRequest,
      operation: 'validate-or-route',
      requestId: 'wms-demand-precompiled-validation',
      candidateEdges,
      candidateSource: 'precompiled',
    });
    expect(validationRequest).not.toBeNull();
    if (!validationRequest) return;
    const validated = computeBaseReactFlowDisplayEdgesWorkerResponse(validationRequest);
    const generatedSnapshot = routeSnapshot(candidateEdges);
    const validatedSnapshot = routeSnapshot(validated.edges ?? []);
    const generatedE13 = generatedSnapshot.find(edge => edge.id === 'e13');
    const validatedE13 = validatedSnapshot.find(edge => edge.id === 'e13');
    const diagnostics = JSON.stringify({
      generatedE13,
      validatedE13,
      routeResolution: validated.routeResolution,
    }, null, 2);

    expect(generated.hardClean, diagnostics).toBe(true);
    expect(validated.hardClean, diagnostics).toBe(true);
    expect(generatedE13, diagnostics).toBeDefined();
    expect(validatedE13, diagnostics).toEqual(generatedE13);
    expect(Math.min(...(validatedE13?.path.map(point => point.x) ?? [-Infinity])), diagnostics)
      .toBeGreaterThan(0);
    expect(['validated-candidate', 'repaired-candidate'], diagnostics)
      .toContain(validated.routeResolution);
  }, 120_000);
});
