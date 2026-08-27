import { describe, expect, it } from 'vitest';

import { EDGE_ROUTING_WORKER_PROTOCOL_VERSION } from '../../../routing/routingVersion';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import {
  createDisplayRoutingWorkerCommitReceipt,
  parseDisplayRoutingWorkerCommitReceipt,
} from '../baseReactFlowDisplayWorkerCommitReceipt';
import { parseDisplayEdgesWorkerCommitResponse } from '../baseReactFlowDisplayWorkerProtocol';
import { completeDisplayWorkerResponse } from '../baseReactFlowDisplayWorkerSessionResponse';
import { displayWorkerCommitReceiptMatchesRequest } from '../baseReactFlowDisplayWorkerCommitBoundary';
import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { createTestDisplayHardReport } from './baseReactFlowDisplayWorkerTestFixtures';

const identity = createDisplayRoutingIdentity(
  '1234',
  `geometry-v1:${'a'.repeat(32)}`,
);
const committedEdges = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
}];
const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(committedEdges);
if (!outputRouteSignature) throw new Error('expected a valid route signature');
const hardReport = createTestDisplayHardReport();
const sessionRef = {
  sessionId: 'display-session-v1:1',
  identity,
  outputRouteSignature,
} as const;
const receipt = createDisplayRoutingWorkerCommitReceipt({
  identity,
  outputRouteSignature,
  hardReport,
  sessionRef,
});
if (!receipt) throw new Error('expected a valid commit receipt');

describe('baseReactFlowDisplayWorkerCommitReceipt', () => {
  it('copies and freezes current-version Worker commit evidence', () => {
    const parsed = parseDisplayRoutingWorkerCommitReceipt(receipt);

    expect(parsed).toEqual(receipt);
    expect(parsed).not.toBe(receipt);
    expect(parsed?.identity).not.toBe(identity);
    expect(parsed?.hardReport).not.toBe(hardReport);
    expect(parsed?.sessionRef).not.toBe(sessionRef);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.identity)).toBe(true);
    expect(Object.isFrozen(parsed?.hardReport)).toBe(true);
    expect(Object.isFrozen(parsed?.hardReport.quality)).toBe(true);
    expect(Object.isFrozen(parsed?.hardReport.minimumClearanceViolationEdgeIds)).toBe(true);
    expect(Object.isFrozen(parsed?.sessionRef)).toBe(true);
  });

  it.each([
    { protocolVersion: 'display-routing-worker-v0' },
    { schema: 'vizly-routing-session-commit-v0' },
    { outputRouteSignature: 'route-v2:invalid' },
    { hardReportDigest: 'hard-report-v1:0000000000000000' },
    { hardReport: { ...hardReport, hardClean: false } },
    { sessionRef: { ...sessionRef, sessionId: 'display-session-v1:0' } },
    { identity: createDisplayRoutingIdentity('9999', identity.inputGeometryDigest) },
  ])('rejects malformed, stale, or internally inconsistent evidence: %j', override => {
    expect(parseDisplayRoutingWorkerCommitReceipt({
      ...receipt,
      ...override,
    })).toBeNull();
  });

  it('requires a receipt only for a hard-clean final response at the commit boundary', () => {
    const baseResponse = {
      requestId: 'route-1',
      edges: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      }],
      hardClean: true,
      hardReport,
      routeResolution: 'full-route' as const,
      nextIdentity: identity,
      outputRouteSignature,
      sessionRef,
    };
    expect(parseDisplayEdgesWorkerCommitResponse(baseResponse, 'route-1')).toBeNull();
    expect(parseDisplayEdgesWorkerCommitResponse({
      ...baseResponse,
      commitReceipt: receipt,
    }, 'route-1')).toMatchObject({
      commitReceipt: {
        protocolVersion: EDGE_ROUTING_WORKER_PROTOCOL_VERSION,
        hardReportDigest: receipt.hardReportDigest,
      },
    });
    expect(parseDisplayEdgesWorkerCommitResponse({
      requestId: 'route-2',
      edges: baseResponse.edges,
      hardClean: false,
      hardReport: createTestDisplayHardReport(false),
      routeResolution: 'full-route',
    }, 'route-2')).not.toBeNull();
  });

  it('issues the same complete receipt for a hard-clean bounded repair', () => {
    const edges = committedEdges;
    const response = completeDisplayWorkerResponse({
      request: {
        operation: 'repair',
        requestId: 'repair-1',
        edges,
        nodes: [],
        inputIdentity: identity,
        repairMode: 'bounded',
      },
      response: {
        requestId: 'repair-1',
        edges,
        hardClean: true,
        hardReport,
        routeResolution: 'repair',
      },
      phaseTrace: [],
    });

    expect(response).toMatchObject({
      nextIdentity: identity,
      outputRouteSignature: response.commitReceipt?.outputRouteSignature,
      sessionRef: response.commitReceipt?.sessionRef,
      commitReceipt: {
        protocolVersion: EDGE_ROUTING_WORKER_PROTOCOL_VERSION,
        identity,
        hardReportDigest: receipt.hardReportDigest,
      },
    });
  });

  it('binds an internally valid receipt to the submitted identity and exact replayed route', () => {
    const edges = committedEdges;
    const request = {
      operation: 'route' as const,
      requestId: 'route-1',
      edges,
      nodes: [],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full' as const,
      inputIdentity: identity,
    };
    const response = {
      requestId: 'route-1',
      edges,
      hardClean: true,
      hardReport,
      routeResolution: 'full-route' as const,
      commitReceipt: receipt,
    };
    expect(displayWorkerCommitReceiptMatchesRequest({
      request,
      response,
      responseEdges: edges,
    })).toBe(true);
    expect(displayWorkerCommitReceiptMatchesRequest({
      request: {
        ...request,
        inputIdentity: createDisplayRoutingIdentity(
          '9999',
          identity.inputGeometryDigest,
        ),
      },
      response,
      responseEdges: edges,
    })).toBe(false);
    expect(displayWorkerCommitReceiptMatchesRequest({
      request,
      response,
      responseEdges: [{
        ...edges[0],
        data: { computedPath: [{ x: 0, y: 0 }, { x: 120, y: 0 }] },
      }],
    })).toBe(false);
  });
});
