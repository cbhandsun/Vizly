import { describe, expect, it } from 'vitest';

import productionRequestJson from './fixtures/demandAllocationProductionWorkerRequest.json';
import regeneratedRequestJson from './fixtures/demandAllocationRegeneratedWorkerRequest.json';
import compactRequestJson from './fixtures/demandAllocationCompactWorkerRequest.json';
import { auditBaseReactFlowDisplayCommercialQuality } from '../baseReactFlowDisplayCommercialQuality';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import {
  findDisplayGeometricCrossingHits,
  getDisplayComputedPath,
} from '../baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { countRenderUnsafeEndpointStubs } from '../baseReactFlowDisplayEndpointStubRepair';
import { parseDisplayEdgesWorkerRequest } from '../baseReactFlowDisplayWorkerProtocol';
import { countCommercialObstacleHits } from '../../../strategies/shared/edgeCommercialRouteGuard';
import { assertPaintedCrossingCoverage } from './baseReactFlowDisplayQualityGateAssertions';
import { buildTerminalPreservingDirectShortcutCandidates } from '../baseReactFlowDisplayLoopShortcutRepair';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { edgePathReadabilityCost } from '../../../strategies/shared/edgePathQualityGeometry';
import { READABLE_CROSSING_CLEARANCE } from '../../../routing/orthogonalCrossingPolicy';

const pathLength = (path: Array<{ x: number; y: number }>): number => path
  .slice(0, -1)
  .reduce((total, point, index) => (
    total
    + Math.abs(path[index + 1].x - point.x)
    + Math.abs(path[index + 1].y - point.y)
  ), 0);

describe('demand-allocation production display routing', () => {
  it('closes the compact lane route without preserving a shared stem through a business node', () => {
    const request = parseDisplayEdgesWorkerRequest(compactRequestJson);
    if (!request) throw new Error('Invalid compact route fixture');
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse(request);
    expect(response.error).toBeUndefined();
    expect(response.hardClean, JSON.stringify(response.hardReport)).toBe(true);
    const edges = response.edges;
    if (!edges) throw new Error('Missing compact route result');
    expect(getDisplayHardQualityGateReport(edges, request.nodes, 'polished').hardClean).toBe(true);
    expect(response.hardReport?.commercialClearanceViolations).toBe(0);
    expect(edges.map(edge => [edge.id, edge.source, edge.target]))
      .toEqual(request.edges.map(edge => [edge.id, edge.source, edge.target]));
  }, 30_000);

  it('keeps the regenerated initial route within the production bend contract', () => {
    const request = parseDisplayEdgesWorkerRequest(regeneratedRequestJson);
    if (!request) throw new Error('Invalid production capture');
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse(request);
    const edges = response.edges ?? [];
    expect(response.hardClean).toBe(true);
    expect(countRenderUnsafeEndpointStubs(edges)).toBe(0);
    expect(auditBaseReactFlowDisplayCommercialQuality(edges)).toEqual([]);
  }, 30_000);

  it('avoids the merge-result fan without an outer-canvas detour', () => {
    const request = parseDisplayEdgesWorkerRequest(productionRequestJson);
    expect(request).not.toBeNull();
    if (!request) return;

    const startedAt = performance.now();
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse(request);
    const durationMs = performance.now() - startedAt;
    const result = response.edges ?? [];
    const metrics = result.map((edge) => {
      const path = getDisplayComputedPath(edge);
      const length = pathLength(path);
      const direct = path.length < 2
        ? 0
        : Math.abs(path.at(-1)!.x - path[0].x)
          + Math.abs(path.at(-1)!.y - path[0].y);
      return {
        id: edge.id,
        bends: Math.max(0, path.length - 2),
        detourRatio: direct > 0 ? length / direct : 1,
      };
    });
    const e10 = metrics.find(metric => metric.id === 'e10');
    const e10Edge = result.find(edge => edge.id === 'e10');
    const rawCrossings = findDisplayGeometricCrossingHits(result);
    const e13 = metrics.find(metric => metric.id === 'e13');
    const e13Edge = result.find(edge => edge.id === 'e13');
    const e3 = metrics.find(metric => metric.id === 'e3');
    const e3Edge = result.find(edge => edge.id === 'e3');
    const e22 = metrics.find(metric => metric.id === 'e22');
    const hardReport = getDisplayHardQualityGateReport(result, request.nodes, 'polished');
    const diagnostics = JSON.stringify({
      durationMs,
      routeResolution: response.routeResolution,
      hardReport,
      metrics,
      phaseTrace: response.phaseTrace,
      e10Path: e10Edge ? getDisplayComputedPath(e10Edge) : [],
      rawCrossingCount: rawCrossings.length,
    }, null, 2);

    expect(response.error, diagnostics).toBeUndefined();
    expect(response.hardClean, diagnostics).toBe(true);
    expect(hardReport.hardClean, diagnostics).toBe(true);
    expect(countRenderUnsafeEndpointStubs(result), diagnostics).toBe(0);
    expect(rawCrossings.length, diagnostics).toBe(hardReport.quality.bridgedCrossings);
    expect(countCommercialObstacleHits(result, request.nodes), diagnostics).toBe(0);
    expect(e10, diagnostics).toBeDefined();
    expect(e10Edge, diagnostics).toBeDefined();
    if (!e10Edge) return;
    const e10Path = getDisplayComputedPath(e10Edge);
    expect(e10Edge?.sourceHandle, diagnostics).toBe('bottom');
    expect(e10Edge?.targetHandle, diagnostics).toBe('top');
    expect(Math.min(...e10Path.map(point => point.y)), diagnostics)
      .toBeGreaterThanOrEqual(1_700);
    expect(e10?.detourRatio, diagnostics).toBeLessThanOrEqual(1.35);
    expect(e10?.bends, diagnostics).toBeLessThanOrEqual(3);
    assertPaintedCrossingCoverage(result);
    expect(e13, diagnostics).toBeDefined();
    if (!e13Edge) throw new Error('Missing production route e13');
    const e13Path = getDisplayComputedPath(e13Edge);
    const roundBlocker = request.nodes.find(item => item.id === 'sort-rem-round');
    if (!roundBlocker || e13Path.length < 2 || !e3Edge) throw new Error('Missing production route geometry');
    const start13 = e13Path[0];
    const end13 = e13Path[e13Path.length - 1];
    const leftCorridor = roundBlocker.position.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE;
    // The old 1.5 ratio is infeasible for these anchors and the 48px obstacle
    // gap. Require the shortest path along the selected left corridor instead.
    expect(pathLength(e13Path), diagnostics).toBe(
      Math.abs(start13.y - end13.y) + start13.x - leftCorridor + end13.x - leftCorridor,
    );
    expect(e13?.bends, diagnostics).toBeLessThanOrEqual(4);
    expect(e3, diagnostics).toBeDefined();
    expect(e3?.bends, diagnostics).toBe(4);
    // A per-edge 1.1 ratio forced a globally worse route: saving 178px adds
    // related-edge crossings. Check feasible Manhattan-minimal alternatives
    // against the declared graph-wide cost instead of relaxing that ratio.
    const e3Path = getDisplayComputedPath(e3Edge);
    const e3End = e3Path.at(-1);
    if (e3Path.length !== 6 || !e3End) throw new Error('Missing four-bend production corridor');
    const monotoneLanes = [...new Set(request.nodes.flatMap(node => [
      node.position.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      node.position.x + Number(node.width ?? node.style?.width ?? 0)
        + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ]))].filter(x => x > e3Path[0].x + READABLE_CROSSING_CLEARANCE
      && x < e3End.x - READABLE_CROSSING_CLEARANCE);
    let feasibleShorterRoutes = 0;
    for (const x of monotoneLanes) {
      const computedPath = e3Path.map((point, index) => (
        index === 2 || index === 3 ? { x, y: point.y } : point
      ));
      const candidate = result.map(edge => edge.id === e3Edge.id
        ? { ...edge, data: { ...edge.data, computedPath } } : edge);
      const candidateReport = getDisplayHardQualityGateReport(candidate, request.nodes, 'polished');
      if (!candidateReport.hardClean || countCommercialObstacleHits(candidate, request.nodes) > 0) continue;
      feasibleShorterRoutes += 1;
      expect(pathLength(computedPath)).toBeLessThan(pathLength(e3Path));
      expect(edgePathReadabilityCost(candidateReport.quality))
        .toBeGreaterThan(edgePathReadabilityCost(hardReport.quality));
    }
    expect(feasibleShorterRoutes).toBeGreaterThan(0);
    // Both two-bend paths through the current vertical ports hit a business node.
    const directCandidates = buildTerminalPreservingDirectShortcutCandidates(getDisplayComputedPath(e3Edge));
    expect(directCandidates).toHaveLength(2);
    for (const computedPath of directCandidates) {
      expect(countCommercialObstacleHits([
        { ...e3Edge, data: { ...e3Edge.data, computedPath } },
      ], request.nodes)).toBeGreaterThan(0);
    }
    expect(e22, diagnostics).toBeDefined();
    expect(e22?.detourRatio, diagnostics).toBeLessThanOrEqual(1.7);
    expect(Math.max(...metrics.map(metric => metric.detourRatio)), diagnostics)
      .toBeLessThanOrEqual(2.6);
    expect(durationMs, diagnostics).toBeLessThan(15_000);
  }, 30_000);
});
