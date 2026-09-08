// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import fixtures from './fixtures/topology-route-stability.json';
import { preserveDisplayTopologyFallbackRoutes } from '../baseReactFlowDisplayTopologyFallbackStability';
import { createDisplayWorkerResponseCompleter } from '../baseReactFlowDisplayWorkerSessionResponse';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { mergeBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import { withDisplayAbsolutePositions } from '../baseReactFlowAbsolutePositions';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { baseReactFlowIncrementalDisplayCommitIsSafe } from '../baseReactFlowDisplayIncrementalCommitGate';
import type { DisplayEdgesWorkerResolvedIncrementalRouteRequest, DisplayEdgesWorkerResponse } from '../baseReactFlowDisplayWorkerProtocol';

const refreshIdentities = (request: DisplayEdgesWorkerResolvedIncrementalRouteRequest) => {
  const before = computeBaseReactFlowDisplayInputIdentityBundle({ ...request,
    nodes: request.baselineNodes, edges: request.baselineSourceEdges });
  const after = computeBaseReactFlowDisplayInputIdentityBundle(request);
  request.baselineInputSignature = before.cacheSignature;
  request.baselineInputGeometryDigest = before.geometryDigest;
  request.nextInputSignature = after.cacheSignature;
  request.nextInputGeometryDigest = after.geometryDigest;
};

const setup = (operation: keyof typeof fixtures = 'collapse') => {
  const fixture = structuredClone(fixtures[operation]);
  const baseline = mergeBaseReactFlowDisplayEdgePatches(fixture.baselineSourceEdges, fixture.baselinePatches);
  const signature = baseline && computeBaseReactFlowDisplayOutputRouteSignature(baseline);
  if (!signature || !baseline) throw new Error('Invalid test baseline');
  const request: DisplayEdgesWorkerResolvedIncrementalRouteRequest = {
    operation: 'incremental-route', requestId: 'stability', edges: fixture.sourceEdges, nodes: fixture.nodes,
    enableSmartEdges: true, smartEdgePadding: 20, isLargeGraph: false, displayEdgeEpoch: 1, qualityMode: 'full',
    baselineNodes: fixture.baselineNodes, baselineSourceEdges: fixture.baselineSourceEdges,
    baselinePatches: fixture.baselinePatches, baselineOutputRouteSignature: signature,
    baselineInputSignature: 'baseline', baselineInputGeometryDigest: 'baseline-geometry',
    nextInputSignature: 'next', nextInputGeometryDigest: 'next-geometry',
    mutableEdgeIds: fixture.mutableEdgeIds, contextEdgeIds: [],
    changeSet: { ...fixture.changeSet, classification: 'topology', reason: 'container-change' },
  };
  const nodes = withDisplayAbsolutePositions(request.nodes, new Map(request.nodes.map(node => [node.id, node] as const)));
  refreshIdentities(request);
  const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
  const hardReport = evaluation.hardReport(fixture.finalEdges);
  const response: DisplayEdgesWorkerResponse = { requestId: request.requestId, edges: fixture.finalEdges,
    hardClean: hardReport.hardClean, hardReport, routeResolution: 'full-route', fallbackLevel: 'full' };
  expect(hardReport.hardClean).toBe(true);
  return { request, response, baseline, nodes, evaluation };
};

describe('topology fallback route stability', () => {
  it('rejects a trusted historical path that is no longer anchored to its endpoints', () => {
    const { request, response } = setup();
    const patch = request.baselinePatches.find(edge => !request.mutableEdgeIds.includes(edge.id)
      && request.edges.some(next => next.id === edge.id));
    if (!patch) throw new Error('Missing retained test edge');
    request.baselinePatches = request.baselinePatches.map(item => item === patch ? { ...item,
      data: { ...item.data, computedPath: [{ x: -900, y: -900 }, { x: -800, y: -900 }] },
    } : item);
    const baseline = mergeBaseReactFlowDisplayEdgePatches(request.baselineSourceEdges, request.baselinePatches);
    const signature = baseline && computeBaseReactFlowDisplayOutputRouteSignature(baseline);
    if (!signature) throw new Error('Missing altered baseline signature');
    request.baselineOutputRouteSignature = signature;
    refreshIdentities(request);
    const trace = vi.fn();
    expect(preserveDisplayTopologyFallbackRoutes(request, response, trace)).toBe(response);
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({ resolution: 'rejected' }));
  });

  it('bounds collective restoration before expensive evaluation', () => {
    const { request, response } = setup();
    const source = request.baselineSourceEdges.find(edge => !request.mutableEdgeIds.includes(edge.id)
      && request.edges.some(next => next.id === edge.id));
    const patch = request.baselinePatches.find(edge => edge.id === source?.id);
    const currentSource = request.edges.find(edge => edge.id === source?.id);
    const current = response.edges?.find(edge => edge.id === source?.id);
    if (!source || !patch || !currentSource || !current || !response.edges) throw new Error('Missing test edge');
    for (let index = 0; index < 64; index += 1) {
      const id = `extra-${index}`;
      request.baselineSourceEdges.push({ ...source, id });
      request.baselinePatches.push({ ...patch, id });
      request.edges.push({ ...currentSource, id });
      response.edges.push({ ...current, id });
    }
    const baseline = mergeBaseReactFlowDisplayEdgePatches(request.baselineSourceEdges, request.baselinePatches);
    const signature = baseline && computeBaseReactFlowDisplayOutputRouteSignature(baseline);
    if (!signature) throw new Error('Missing expanded baseline signature');
    request.baselineOutputRouteSignature = signature;
    refreshIdentities(request);
    const trace = vi.fn();
    expect(preserveDisplayTopologyFallbackRoutes(request, response, trace)).toBe(response);
    expect(trace).not.toHaveBeenCalled();
  });

  it('applies stability before the Worker signs and commits the fallback', () => {
    const { request, response } = setup();
    const result = createDisplayWorkerResponseCompleter(request, [])(response);
    expect(result.hardReport?.quality.totalLength).toBe((response.hardReport?.quality.totalLength ?? 0) - 34);
    expect(result.commitReceipt).toBeDefined();
    expect(result.commitReceipt?.outputRouteSignature).toBe(computeBaseReactFlowDisplayOutputRouteSignature(result.edges ?? []));
  });
  it('retains a valid unaffected route after collapse without sacrificing final quality', () => {
    const { request, response, baseline, nodes } = setup();
    const result = preserveDisplayTopologyFallbackRoutes(request, response);
    expect(result).not.toBe(response);
    expect(result.hardReport?.quality.totalLength).toBe((response.hardReport?.quality.totalLength ?? 0) - 34);
    const unchanged = baseline.find(edge => !request.mutableEdgeIds.includes(edge.id)
      && request.edges.some(next => next.id === edge.id));
    expect(unchanged).toBeDefined();
    expect(result.edges?.find(edge => edge.id === unchanged?.id)?.data?.computedPath).toEqual(unchanged?.data?.computedPath);
    expect(baseReactFlowIncrementalDisplayCommitIsSafe({ sourceEdges: request.edges,
      initialEdges: response.edges ?? [], response: result, nodes,
      eligibleEdgeIds: new Set(result.edges?.map(edge => edge.id)) })).toBe(true);
  });

  it('does not preserve an expanded route at the expense of length or shared trunk membership', () => {
    const { request, response, baseline, nodes, evaluation } = setup('expand');
    expect(preserveDisplayTopologyFallbackRoutes(request, response)).toBe(response);
    const previous = new Map(baseline.map(edge => [edge.id, edge] as const));
    const candidate = (response.edges ?? []).map(edge => request.mutableEdgeIds.includes(edge.id)
      ? edge : previous.get(edge.id) ?? edge);
    const hardReport = evaluation.hardReport(candidate);
    expect(hardReport.hardClean).toBe(true);
    expect(baseReactFlowIncrementalDisplayCommitIsSafe({ sourceEdges: request.edges,
      initialEdges: response.edges ?? [], response: { ...response, edges: candidate, hardReport }, nodes,
      eligibleEdgeIds: new Set(candidate.map(edge => edge.id)) })).toBe(false);
  });

  it.each(['dirty', 'incremental', 'missing-edges', 'empty-edges', 'untrusted-baseline', 'all-mutable', 'non-topology', 'invalid-projection', 'stale-input', 'stale-next'])(
    'keeps the validated fallback when preservation is inapplicable: %s', scenario => {
      const { request, response } = setup();
      if (scenario === 'dirty') response.hardClean = false;
      if (scenario === 'incremental') response.fallbackLevel = 'none';
      if (scenario === 'missing-edges') delete response.edges;
      if (scenario === 'empty-edges') response.edges = [];
      if (scenario === 'untrusted-baseline') request.baselineOutputRouteSignature = 'invalid';
      if (scenario === 'stale-input') request.baselineInputGeometryDigest = 'invalid';
      if (scenario === 'stale-next') request.nextInputSignature = 'invalid';
      if (scenario === 'all-mutable') request.mutableEdgeIds = request.edges.map(edge => edge.id);
      if (scenario === 'non-topology') request.changeSet = { ...request.changeSet, classification: 'geometry' };
      if (scenario === 'invalid-projection') request.changeSet = { ...request.changeSet, changedNodeIds: [] };
      expect(preserveDisplayTopologyFallbackRoutes(request, response)).toBe(response);
    },
  );
});
