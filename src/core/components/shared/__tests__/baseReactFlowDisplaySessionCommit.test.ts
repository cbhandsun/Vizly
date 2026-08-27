import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { clearBaseReactFlowDisplayCommittedSnapshots } from '../baseReactFlowDisplayCommittedSnapshot';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import { commitBaseReactFlowDisplaySessionResult } from '../baseReactFlowDisplaySessionCommit';
import { createDisplayRoutingWorkerCommitReceipt } from '../baseReactFlowDisplayWorkerCommitReceipt';
import { createBaseReactFlowRoutingSessionRuntime } from '../baseReactFlowRoutingSessionRuntime';
import { createTestDisplayHardReport } from './baseReactFlowDisplayWorkerTestFixtures';

const sourceNodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, data: {} },
  { id: 'target', position: { x: 100, y: 0 }, data: {} },
];
const sourceEdges: Edge[] = [{ id: 'edge', source: 'source', target: 'target' }];
const finalEdges: Edge[] = [{
  ...sourceEdges[0],
  type: 'stablePath',
  data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
}];
const displayPatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, finalEdges);
const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(finalEdges);
if (!displayPatches || !outputRouteSignature) throw new Error('invalid session commit fixture');
const inputGeometryDigest = `geometry-v1:${'a'.repeat(32)}`;
const identity = createDisplayRoutingIdentity('1234', inputGeometryDigest);
const hardReport = createTestDisplayHardReport();
const commitReceipt = createDisplayRoutingWorkerCommitReceipt({
  identity,
  outputRouteSignature,
  hardReport,
  sessionRef: {
    sessionId: 'display-session-v1:1',
    identity,
    outputRouteSignature,
  },
});
if (!commitReceipt) throw new Error('invalid session receipt fixture');

afterEach(() => clearBaseReactFlowDisplayCommittedSnapshots());

const commit = (override: Partial<Parameters<typeof commitBaseReactFlowDisplaySessionResult>[0]> = {}) => {
  const runtime = createBaseReactFlowRoutingSessionRuntime();
  const job = runtime.beginJob('display');
  const rememberCommittedBaseline = vi.fn();
  const applyFinalGeometry = vi.fn();
  const result = commitBaseReactFlowDisplaySessionResult({
    runtime,
    job,
    inputSignature: '1234',
    inputGeometryDigest,
    sourceEdges,
    sourceNodes,
    finalEdges,
    displayPatches,
    cachePatches: null,
    cacheReplaySignature: null,
    outputRouteSignature,
    commitReceipt,
    rememberCommittedBaseline,
    applyFinalGeometry,
    ...override,
  });
  return { result, runtime, job, rememberCommittedBaseline, applyFinalGeometry };
};

describe('baseReactFlowDisplaySessionCommit', () => {
  it('publishes snapshot and display geometry in the same current epoch', () => {
    const result = commit();

    expect(result.result).toEqual({ committed: true });
    expect(result.rememberCommittedBaseline).toHaveBeenCalledOnce();
    expect(result.applyFinalGeometry).toHaveBeenCalledOnce();
    expect(result.runtime.isCurrentJob(result.job)).toBe(false);
  });

  it('fails closed before display mutation when snapshot evidence is invalid', () => {
    const result = commit({ outputRouteSignature: 'route-v2:invalid' });

    expect(result.result).toEqual({ committed: false });
    expect(result.rememberCommittedBaseline).not.toHaveBeenCalled();
    expect(result.applyFinalGeometry).not.toHaveBeenCalled();
  });

  it('rejects a receipt that belongs to another input identity', () => {
    const otherIdentity = createDisplayRoutingIdentity('9999', inputGeometryDigest);
    const otherReceipt = createDisplayRoutingWorkerCommitReceipt({
      identity: otherIdentity,
      outputRouteSignature,
      hardReport,
      sessionRef: {
        sessionId: 'display-session-v1:2',
        identity: otherIdentity,
        outputRouteSignature,
      },
    });
    if (!otherReceipt) throw new Error('invalid alternate receipt fixture');
    const result = commit({ commitReceipt: otherReceipt });

    expect(result.result).toEqual({ committed: false });
    expect(result.applyFinalGeometry).not.toHaveBeenCalled();
  });

  it('does not publish a response after another routing job supersedes it', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const staleJob = runtime.beginJob('display');
    runtime.beginJob('layout');
    const applyFinalGeometry = vi.fn();

    const result = commit({ runtime, job: staleJob, applyFinalGeometry });

    expect(result.result).toEqual({ committed: false });
    expect(applyFinalGeometry).not.toHaveBeenCalled();
  });

  it('rejects direct snapshot mutation outside the current commit epoch', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();

    expect(runtime.commitDisplaySnapshot({
      inputSignature: '1234',
      inputGeometryDigest,
      sourceEdges,
      sourceNodes,
      displayPatches,
      outputRouteSignature,
      hardReport,
      workerSessionRef: commitReceipt.sessionRef,
    })).toBeNull();
  });
});
