import { describe, expect, it } from 'vitest';

import productionRequestJson from './fixtures/demandAllocationProductionWorkerRequest.json';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import {
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
} from '../baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { countRenderUnsafeEndpointStubs } from '../baseReactFlowDisplayEndpointStubRepair';
import { parseDisplayEdgesWorkerRequest } from '../baseReactFlowDisplayWorkerProtocol';
import { countCommercialObstacleHits } from '../../../strategies/shared/edgeCommercialRouteGuard';

const pathLength = (path: Array<{ x: number; y: number }>): number => path
  .slice(0, -1)
  .reduce((total, point, index) => (
    total
    + Math.abs(path[index + 1].x - point.x)
    + Math.abs(path[index + 1].y - point.y)
  ), 0);

describe('demand-allocation production display routing', () => {
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
    const rawStrictCrossings = findDisplayStrictCrossingHits(result);
    const rawE10SoftBridge = e10Edge?.data?.h;
    const e10SoftBridge = typeof rawE10SoftBridge === 'string' ? rawE10SoftBridge : '';
    const e13 = metrics.find(metric => metric.id === 'e13');
    const e3 = metrics.find(metric => metric.id === 'e3');
    const e22 = metrics.find(metric => metric.id === 'e22');
    const hardReport = getDisplayHardQualityGateReport(result, request.nodes, 'polished');
    const diagnostics = JSON.stringify({
      durationMs,
      routeResolution: response.routeResolution,
      hardReport,
      metrics,
      phaseTrace: response.phaseTrace,
      e10Path: e10Edge ? getDisplayComputedPath(e10Edge) : [],
      e10SoftBridge,
      rawStrictCrossingCount: rawStrictCrossings.length,
    }, null, 2);

    expect(response.error, diagnostics).toBeUndefined();
    expect(response.hardClean, diagnostics).toBe(true);
    expect(hardReport.hardClean, diagnostics).toBe(true);
    expect(countRenderUnsafeEndpointStubs(result), diagnostics).toBe(0);
    expect(rawStrictCrossings, diagnostics).toHaveLength(1);
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
    const rawCrossing = rawStrictCrossings[0];
    const horizontal = rawCrossing.a.axis === 'h' ? rawCrossing.a : rawCrossing.b;
    const vertical = rawCrossing.a.axis === 'v' ? rawCrossing.a : rawCrossing.b;
    expect(e10SoftBridge, diagnostics).toContain(`;${vertical.a.x},${horizontal.a.y};`);
    expect(e13, diagnostics).toBeDefined();
    expect(e13?.detourRatio, diagnostics).toBeLessThanOrEqual(1.5);
    expect(e13?.bends, diagnostics).toBeLessThanOrEqual(4);
    expect(e3, diagnostics).toBeDefined();
    expect(e3?.detourRatio, diagnostics).toBeLessThanOrEqual(1.1);
    expect(e3?.bends, diagnostics).toBeLessThanOrEqual(3);
    expect(e22, diagnostics).toBeDefined();
    expect(e22?.detourRatio, diagnostics).toBeLessThanOrEqual(1.7);
    expect(Math.max(...metrics.map(metric => metric.detourRatio)), diagnostics)
      .toBeLessThanOrEqual(2.6);
    expect(durationMs, diagnostics).toBeLessThan(15_000);
  }, 30_000);
});
