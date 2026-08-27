import { describe, expect, it } from 'vitest';

import {
  createDisplayRoutingRenderAuthority,
  displayRoutingRenderAuthorityAllowsEdge,
  readDisplayRoutingRenderSessionContract,
} from '../displayRoutingRenderAuthority';
import { createDisplayRoutingIdentity } from '../routingSessionIdentity';
import { EDGE_ROUTING_WORKER_PROTOCOL_VERSION } from '../routingVersion';
import { computeDisplayRoutingHardReportDigest } from '../routingHardReport';
import { TEST_ROUTING_HARD_REPORT } from './displayRoutingRenderAuthorityTestFixture';

const identity = createDisplayRoutingIdentity(
  '1234',
  `geometry-v1:${'a'.repeat(32)}`,
);
const workerSessionRef = {
  sessionId: 'display-session-v1:1',
  identity,
  outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
} as const;
const edgeAPath = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const edgeBPath = [{ x: 0, y: 20 }, { x: 100, y: 20 }];
const edgeGeometry = (edgeId: string, computedPath: object) => ({
  edgeId,
  source: 'source',
  target: 'target',
  sourceHandle: null,
  targetHandle: null,
  rendererType: 'stablePath',
  computedPath,
});

const authority = () => createDisplayRoutingRenderAuthority({
  inputSignature: '1234',
  inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
  outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
  hardReport: TEST_ROUTING_HARD_REPORT,
  authorizedEdges: [
    edgeGeometry('edge-a', edgeAPath),
    edgeGeometry('edge-b', edgeBPath),
  ],
  workerSessionRef,
});

describe('displayRoutingRenderAuthority', () => {
  it('authorizes only listed edges on a realm-issued committed capability', () => {
    const issued = authority();
    expect(issued).not.toBeNull();
    const claim = edgeGeometry('edge-a', edgeAPath);
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, claim)).toBe(true);
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, {
      ...claim,
      computedPath: [...edgeAPath],
    })).toBe(false);
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, edgeGeometry('edge-c', edgeAPath))).toBe(false);
    expect(displayRoutingRenderAuthorityAllowsEdge({ ...issued }, claim)).toBe(false);
    if (!issued) throw new Error('expected a render authority');
    (issued.authorizedEdgeIds as Set<string>).add('edge-c');
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, edgeGeometry('edge-c', edgeAPath))).toBe(false);
  });

  it('exposes only the immutable session proof issued for the committed Worker result', () => {
    const issued = authority();
    const session = readDisplayRoutingRenderSessionContract(issued);

    expect(session).toEqual({
      schema: 'vizly-routing-session-render-v1',
      protocolVersion: EDGE_ROUTING_WORKER_PROTOCOL_VERSION,
      identity,
      outputRouteSignature: workerSessionRef.outputRouteSignature,
      hardReportDigest: computeDisplayRoutingHardReportDigest(TEST_ROUTING_HARD_REPORT),
      hardReport: TEST_ROUTING_HARD_REPORT,
      workerSessionRef,
    });
    expect(session).not.toBeNull();
    expect(session?.workerSessionRef).not.toBe(workerSessionRef);
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session?.hardReport)).toBe(true);
    expect(Object.isFrozen(session?.hardReport.quality)).toBe(true);
    expect(Object.isFrozen(session?.workerSessionRef)).toBe(true);
    expect(Object.isFrozen(session?.workerSessionRef?.identity)).toBe(true);
    expect(readDisplayRoutingRenderSessionContract(
      issued ? { ...issued } : null,
    )).toBeNull();
  });

  it.each([
    { inputSignature: 'not-a-signature' },
    { inputGeometryDigest: 'geometry-v1:short' },
    { outputRouteSignature: 'route-v2:forged' },
    { hardReport: { ...TEST_ROUTING_HARD_REPORT, hardClean: false } },
    { hardReport: {
      ...TEST_ROUTING_HARD_REPORT,
      quality: { ...TEST_ROUTING_HARD_REPORT.quality, totalLength: Number.POSITIVE_INFINITY },
    } },
    { authorizedEdges: [] },
    { authorizedEdges: [{ ...edgeGeometry('', edgeAPath) }] },
    { authorizedEdges: [{ ...edgeGeometry('edge-a', []) }] },
    { authorizedEdges: Array.from({ length: 301 }, (_, index) => ({
      ...edgeGeometry(`edge-${index}`, edgeAPath),
    })) },
  ])('fails closed for malformed or oversized authority input: %j', override => {
    expect(createDisplayRoutingRenderAuthority({
      inputSignature: '1234',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      hardReport: TEST_ROUTING_HARD_REPORT,
      authorizedEdges: [edgeGeometry('edge-a', edgeAPath)],
      workerSessionRef,
      ...override,
    })).toBeNull();
  });

  it.each([
    {
      ...workerSessionRef,
      identity: createDisplayRoutingIdentity('9999', identity.inputGeometryDigest),
    },
    {
      ...workerSessionRef,
      outputRouteSignature: 'route-v2:1:3:0123456789abcdef',
    },
    {
      ...workerSessionRef,
      sessionId: 'display-session-v1:0',
    },
  ])('rejects a malformed or mismatched Worker session ref: %j', invalidWorkerSessionRef => {
    expect(createDisplayRoutingRenderAuthority({
      inputSignature: identity.inputSignature,
      inputGeometryDigest: identity.inputGeometryDigest,
      outputRouteSignature: workerSessionRef.outputRouteSignature,
      hardReport: TEST_ROUTING_HARD_REPORT,
      authorizedEdges: [edgeGeometry('edge-a', edgeAPath)],
      workerSessionRef: invalidWorkerSessionRef,
    })).toBeNull();
  });
});
