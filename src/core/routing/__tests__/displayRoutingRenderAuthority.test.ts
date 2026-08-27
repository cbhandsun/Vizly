import { describe, expect, it } from 'vitest';

import {
  createDisplayRoutingRenderAuthority,
  displayRoutingRenderAuthorityAllowsEdge,
  readDisplayRoutingRenderSessionContract,
} from '../displayRoutingRenderAuthority';
import { createDisplayRoutingIdentity } from '../routingSessionIdentity';

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

const authority = () => createDisplayRoutingRenderAuthority({
  inputSignature: '1234',
  inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
  outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
  hardReportDigest: 'hard-report-v1:0123456789abcdef',
  authorizedEdges: [
    { edgeId: 'edge-a', computedPath: edgeAPath },
    { edgeId: 'edge-b', computedPath: edgeBPath },
  ],
  workerSessionRef,
});

describe('displayRoutingRenderAuthority', () => {
  it('authorizes only listed edges on a realm-issued committed capability', () => {
    const issued = authority();
    expect(issued).not.toBeNull();
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, 'edge-a', edgeAPath)).toBe(true);
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, 'edge-a', [...edgeAPath])).toBe(false);
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, 'edge-c', edgeAPath)).toBe(false);
    expect(displayRoutingRenderAuthorityAllowsEdge({ ...issued }, 'edge-a', edgeAPath)).toBe(false);
    if (!issued) throw new Error('expected a render authority');
    (issued.authorizedEdgeIds as Set<string>).add('edge-c');
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, 'edge-c', edgeAPath)).toBe(false);
  });

  it('exposes only the immutable session proof issued for the committed Worker result', () => {
    const issued = authority();
    const session = readDisplayRoutingRenderSessionContract(issued);

    expect(session).toEqual({
      schema: 'vizly-routing-session-render-v1',
      identity,
      outputRouteSignature: workerSessionRef.outputRouteSignature,
      hardReportDigest: 'hard-report-v1:0123456789abcdef',
      workerSessionRef,
    });
    expect(session).not.toBeNull();
    expect(session?.workerSessionRef).not.toBe(workerSessionRef);
    expect(Object.isFrozen(session)).toBe(true);
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
    { hardReportDigest: 'hard-report-v1:forged' },
    { authorizedEdges: [] },
    { authorizedEdges: [{ edgeId: '', computedPath: edgeAPath }] },
    { authorizedEdges: [{ edgeId: 'edge-a', computedPath: [] }] },
    { authorizedEdges: Array.from({ length: 301 }, (_, index) => ({
      edgeId: `edge-${index}`,
      computedPath: edgeAPath,
    })) },
  ])('fails closed for malformed or oversized authority input: %j', override => {
    expect(createDisplayRoutingRenderAuthority({
      inputSignature: '1234',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      hardReportDigest: 'hard-report-v1:0123456789abcdef',
      authorizedEdges: [{ edgeId: 'edge-a', computedPath: edgeAPath }],
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
      hardReportDigest: 'hard-report-v1:0123456789abcdef',
      authorizedEdges: [{ edgeId: 'edge-a', computedPath: edgeAPath }],
      workerSessionRef: invalidWorkerSessionRef,
    })).toBeNull();
  });
});
