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
const edgeAElkPath = [{ x: 0, y: 0 }, { x: 50, y: 10 }, { x: 100, y: 0 }];
const edgeATreeRoutingPoints = [{ x: 0, y: 0 }, { x: 50, y: -10 }, { x: 100, y: 0 }];
const edgeGeometry = (
  edgeId: string,
  computedPath: readonly { x: number; y: number }[],
  optionalPaths: Readonly<{
    elkPath?: unknown;
    treeRoutingPoints?: unknown;
  }> = {},
) => ({
  edgeId,
  source: 'source',
  target: 'target',
  sourceHandle: null,
  targetHandle: null,
  rendererType: 'stablePath',
  computedPath,
  elkPath: optionalPaths.elkPath ?? null,
  treeRoutingPoints: optionalPaths.treeRoutingPoints ?? null,
});

const edgeAClaim = () => edgeGeometry('edge-a', edgeAPath, {
  elkPath: edgeAElkPath,
  treeRoutingPoints: edgeATreeRoutingPoints,
});

const authority = () => createDisplayRoutingRenderAuthority({
  inputSignature: '1234',
  inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
  outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
  hardReport: TEST_ROUTING_HARD_REPORT,
  authorizedEdges: [
    edgeAClaim(),
    edgeGeometry('edge-b', edgeBPath),
  ],
  workerSessionRef,
});

describe('displayRoutingRenderAuthority', () => {
  it('authorizes only listed edges on a realm-issued committed capability', () => {
    const issued = authority();
    expect(issued).not.toBeNull();
    const claim = edgeAClaim();
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, claim)).toBe(true);
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, {
      ...claim,
      computedPath: edgeAPath.map(point => ({ ...point })),
      elkPath: edgeAElkPath.map(point => ({ ...point })),
      treeRoutingPoints: edgeATreeRoutingPoints.map(point => ({ ...point })),
    })).toBe(true);
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, edgeGeometry('edge-c', edgeAPath))).toBe(false);
    expect(displayRoutingRenderAuthorityAllowsEdge({ ...issued }, claim)).toBe(false);
    if (!issued) throw new Error('expected a render authority');
    (issued.authorizedEdgeIds as Set<string>).add('edge-c');
    expect(displayRoutingRenderAuthorityAllowsEdge(issued, edgeGeometry('edge-c', edgeAPath))).toBe(false);
  });

  it.each([
    ['source', { ...edgeAClaim(), source: 'forged-source' }],
    ['target', { ...edgeAClaim(), target: 'forged-target' }],
    ['source handle', { ...edgeAClaim(), sourceHandle: 'forged-source-handle' }],
    ['target handle', { ...edgeAClaim(), targetHandle: 'forged-target-handle' }],
    ['renderer type', { ...edgeAClaim(), rendererType: 'advanced-smart-step' }],
    ['computedPath', {
      ...edgeAClaim(),
      computedPath: [{ x: 0, y: 0 }, { x: 101, y: 0 }],
    }],
    ['elkPath', {
      ...edgeAClaim(),
      elkPath: [{ x: 0, y: 0 }, { x: 51, y: 10 }, { x: 100, y: 0 }],
    }],
    ['treeRouting.points', {
      ...edgeAClaim(),
      treeRoutingPoints: [{ x: 0, y: 0 }, { x: 51, y: -10 }, { x: 100, y: 0 }],
    }],
    ['removed elkPath', { ...edgeAClaim(), elkPath: null }],
    ['removed treeRouting.points', { ...edgeAClaim(), treeRoutingPoints: undefined }],
  ])('rejects a same-id claim with forged %s geometry', (_field, forgedClaim) => {
    expect(displayRoutingRenderAuthorityAllowsEdge(authority(), forgedClaim)).toBe(false);
  });

  it('allows style, marker, label, and selection changes outside routing geometry', () => {
    const styleOnlyClaim = {
      ...edgeAClaim(),
      style: { stroke: '#123456', strokeWidth: 3 },
      markerStart: 'url(#start)',
      markerEnd: 'url(#end)',
      label: 'latest business label',
      selected: true,
    };

    expect(displayRoutingRenderAuthorityAllowsEdge(authority(), styleOnlyClaim)).toBe(true);
  });

  it('snapshots all authorized route coordinates so later source mutation cannot widen the proof', () => {
    const mutablePath = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const mutableElkPath = [{ x: 0, y: 0 }, { x: 50, y: 10 }, { x: 100, y: 0 }];
    const mutableTreeRoutingPoints = [
      { x: 0, y: 0 },
      { x: 50, y: -10 },
      { x: 100, y: 0 },
    ];
    const issued = createDisplayRoutingRenderAuthority({
      inputSignature: identity.inputSignature,
      inputGeometryDigest: identity.inputGeometryDigest,
      outputRouteSignature: workerSessionRef.outputRouteSignature,
      hardReport: TEST_ROUTING_HARD_REPORT,
      authorizedEdges: [edgeGeometry('edge-a', mutablePath, {
        elkPath: mutableElkPath,
        treeRoutingPoints: mutableTreeRoutingPoints,
      })],
      workerSessionRef,
    });
    mutablePath[1]!.x = 999;
    mutableElkPath[1]!.x = 999;
    mutableTreeRoutingPoints[1]!.x = 999;

    expect(displayRoutingRenderAuthorityAllowsEdge(
      issued,
      edgeGeometry('edge-a', mutablePath, {
        elkPath: mutableElkPath,
        treeRoutingPoints: mutableTreeRoutingPoints,
      }),
    )).toBe(false);
    expect(displayRoutingRenderAuthorityAllowsEdge(
      issued,
      edgeGeometry('edge-a', [{ x: 0, y: 0 }, { x: 100, y: 0 }], {
        elkPath: [{ x: 0, y: 0 }, { x: 50, y: 10 }, { x: 100, y: 0 }],
        treeRoutingPoints: [{ x: 0, y: 0 }, { x: 50, y: -10 }, { x: 100, y: 0 }],
      }),
    )).toBe(true);
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
    { authorizedEdges: [{ ...edgeGeometry('edge-a', edgeAPath), elkPath: {} }] },
    { authorizedEdges: [{ ...edgeGeometry('edge-a', edgeAPath), treeRoutingPoints: {} }] },
    { authorizedEdges: [{ ...edgeGeometry('edge-a', [
      { x: 0, y: 0 },
      { x: Number.POSITIVE_INFINITY, y: 0 },
    ]) }] },
    { authorizedEdges: [{ ...edgeGeometry('edge-a', Array.from(
      { length: 513 },
      (_, index) => ({ x: index, y: 0 }),
    )) }] },
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
