import { createLayoutCandidateAcceptance } from '../../../algorithms/layoutCandidateAcceptance';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { createBaseReactFlowRoutingSessionRuntime } from '../baseReactFlowRoutingSessionRuntime';
import { beginRoutingRequestObservation, bindRoutingObservation, observeRoutingRenderFrame, readRoutingObservation,
  recordRoutingObservation, startRoutingObservation, summarizeRoutingObservationCheckpoint } from '../baseReactFlowRoutingObservation';
import { addFlowchartAccessibilityLabels } from '../../diagrams/flowchartCanvasAccessibility';
import { clearBaseReactFlowDisplayCommittedSnapshots } from '../baseReactFlowDisplayCommittedSnapshot';
import { createBaseReactFlowDocumentSnapshotSource } from '../baseReactFlowDocumentSnapshotSource';
import { createBaseReactFlowDisplayEdgePatches, mergeBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerProjection';
import { loadBaseReactFlowDocumentRouteCandidate } from '../baseReactFlowDocumentRouteCandidate';
import { clearRoutingOnlyDocumentCandidates, registerRoutingOnlyDocumentCandidate } from '../../../routing/routingDocumentCandidateRegistry';
import { coerceAutoSavePayload, createAutoSavePayload } from '../../../utils/autoSaveStorage';
import { createTestDisplayHardReport } from './baseReactFlowDisplayWorkerTestFixtures';

afterEach(() => {
  clearBaseReactFlowDisplayCommittedSnapshots();
  clearRoutingOnlyDocumentCandidates();
});

describe('content-free routing observations', () => {
  it('ignores cancelled frame callbacks and avoids scheduling repeated observations', () => {
    const signal = new AbortController().signal; startRoutingObservation(signal, 'display', () => 0);
    let callback: (() => void) | undefined;
    const request = vi.fn((next: () => void) => { callback = next; return 7; });
    const cancel = vi.fn(); const cleanup = observeRoutingRenderFrame(signal, request, cancel);
    cleanup(); callback?.();
    expect(cancel).toHaveBeenCalledWith(7);
    expect(readRoutingObservation(signal)?.entries).toHaveLength(1);
    observeRoutingRenderFrame(signal, request, cancel); callback?.();
    expect(readRoutingObservation(signal)?.entries.at(-1)?.stage).toBe('render-frame-observed');
    observeRoutingRenderFrame(signal, request, cancel);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('isolates identical job numbers from different canvases and preserves request ordinals', () => {
    const left = createBaseReactFlowRoutingSessionRuntime();
    const right = createBaseReactFlowRoutingSessionRuntime();
    const a = left.beginJob('display'); const b = right.beginJob('layout');
    expect(a.id).toBe(b.id);
    const first = beginRoutingRequestObservation(a.signal);
    const second = beginRoutingRequestObservation(a.signal);
    second('worker-response-validated'); first('worker-response-validated');
    expect(readRoutingObservation(a.signal)?.entries.filter(entry => entry.stage === 'worker-response-validated')
      .map(entry => entry.requestOrdinal)).toEqual([2, 1]);
    expect(readRoutingObservation(b.signal)).toMatchObject({ owner: 'layout', entries: [{ stage: 'job-started' }] });
    left.dispose(); right.dispose();
  });
  it('freezes cancelled jobs and ignores late responses without contaminating their successor', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime(); const old = runtime.beginJob('display');
    const request = beginRoutingRequestObservation(old.signal);
    const next = runtime.beginJob('display');
    request('worker-response-validated');
    expect(readRoutingObservation(old.signal)?.entries.at(-1)?.stage).toBe('job-cancelled');
    expect(readRoutingObservation(next.signal)?.entries).toHaveLength(1);
    runtime.dispose();
    expect(readRoutingObservation(next.signal)?.entries.at(-1)?.stage).toBe('job-cancelled');
  });
  it('binds accepted objects by identity, exports detached values and never reads their payload', () => {
    const signal = new AbortController().signal; startRoutingObservation(signal, 'display', () => 10);
    const baseline = { privateContent: 'secret' }; const authority = {};
    bindRoutingObservation(signal, baseline); bindRoutingObservation(baseline, authority);
    recordRoutingObservation(signal, 'commit-accepted'); recordRoutingObservation(authority, 'render-committed');
    recordRoutingObservation(authority, 'render-committed'); recordRoutingObservation(authority, 'render-frame-observed');
    const report = readRoutingObservation(authority);
    expect(report?.entries.map(entry => entry.stage)).toEqual([
      'job-started', 'commit-accepted', 'render-committed', 'render-frame-observed']);
    expect(JSON.stringify(report)).not.toContain('secret');
    report?.entries.pop(); expect(readRoutingObservation(authority)?.entries).toHaveLength(4);
    expect(readRoutingObservation({ ...baseline })).toBeNull();
  });
  it('summarizes the latest routing checkpoint without exporting the full event list', () => {
    const signal = new AbortController().signal; startRoutingObservation(signal, 'display', () => 0);
    const request = beginRoutingRequestObservation(signal);
    request('worker-available');
    request('worker-post-requested');
    recordRoutingObservation(signal, 'failed');

    expect(summarizeRoutingObservationCheckpoint(signal)).toEqual({
      schema: 'vizly-routing-observation-checkpoint-v1',
      owner: 'display',
      lastStage: 'failed',
      previousStage: 'worker-post-requested',
      lastRequestOrdinal: null,
      elapsedMs: 0,
      eventCount: 5,
      truncated: false,
    });
    expect(summarizeRoutingObservationCheckpoint({})).toBeNull();
  });
  it('bounds request and event retention and explicitly reports truncation', () => {
    const signal = new AbortController().signal; startRoutingObservation(signal, 'display', () => 0);
    for (let index = 0; index < 1000; index += 1) {
      const request = beginRoutingRequestObservation(signal);
      request('worker-available'); request('worker-post-requested');
      request('worker-response-validated'); request('worker-request-settled');
    }
    recordRoutingObservation(signal, 'failed');
    const report = readRoutingObservation(signal);
    expect(report?.truncated).toBe(true); expect(report?.entries).toHaveLength(32);
    expect(report?.entries.at(-1)?.stage).toBe('failed');
    expect(Math.max(...(report?.entries.map(entry => entry.requestOrdinal ?? 0) ?? []))).toBe(8);
  });
  it.each([NaN, Infinity, -1, 600_001])('marks invalid timestamps unavailable: %s', time => {
    let value = 0; const signal = new AbortController().signal;
    startRoutingObservation(signal, 'display', () => value); value = time;
    recordRoutingObservation(signal, 'failed');
    expect(readRoutingObservation(signal)?.entries.at(-1)?.elapsedMs).toBeNull();
  });
  it('does not throw or capture payloads when the clock fails', () => {
    const signal = new AbortController().signal;
    startRoutingObservation(signal, 'display', () => { throw new Error('private-clock'); });
    recordRoutingObservation(signal, 'failed');
    expect(JSON.stringify(readRoutingObservation(signal))).not.toContain('private');
    expect(readRoutingObservation(signal)?.entries.every(entry => entry.elapsedMs === null)).toBe(true);
    expect(() => beginRoutingRequestObservation()('worker-available')).not.toThrow();
  });
});

const routingOptions = { enableSmartEdges: true, smartEdgePadding: 20, isLargeGraph: false };
const makeDocumentFixture = (manual = false) => {
  const nodes: Node[] = ['source', 'target'].map((id, index) => ({
    id, type: 'custom', position: { x: index * 300, y: 0 }, width: 100, height: 60,
    measured: { width: 100, height: 60 }, data: {},
  }));
  const edges: Edge[] = [{ id: 'edge', source: 'source', target: 'target', type: 'advanced-smart-step',
    label: 'business label', data: manual ? { manualHandleSides: ['source'] } : {},
    ...(manual ? { sourceHandle: 'right' } : {}),
  }];
  const renderEdges = addFlowchartAccessibilityLabels(nodes, edges).edges;
  const routed: Edge[] = renderEdges.map(edge => ({
    ...edge, type: 'stablePath', sourceHandle: 'right', targetHandle: 'left', data: { ...edge.data,
      computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
    },
  }));
  const patches = createBaseReactFlowDisplayEdgePatches(renderEdges, routed);
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(routed);
  if (!patches || !outputRouteSignature) throw new Error('Invalid document fixture');
  const runtime = createBaseReactFlowRoutingSessionRuntime();
  const result = runtime.commitJob(runtime.beginJob('display'), () => runtime.commitDisplaySnapshot({
    inputSignature: '654', inputGeometryDigest: `geometry-v1:${'c'.repeat(32)}`,
    sourceEdges: renderEdges, sourceNodes: nodes, displayPatches: patches, outputRouteSignature,
    hardReport: createTestDisplayHardReport(),
  }));
  if (!result.committed || !result.value) throw new Error('Fixture did not commit');
  const baseline = result.value;
  runtime.rememberDocumentSnapshot(baseline, routingOptions);
  return { runtime, nodes, edges, baseline, routed, outputRouteSignature };
};

describe('Canvas-owned portable document snapshots', () => {
  it('exports across presentation array copies and reloads against sanitized document identity', () => {
    const { runtime, nodes, edges, outputRouteSignature } = makeDocumentFixture();
    const snapshot = runtime.createDocumentSnapshot(nodes, edges);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.candidate.inputSignature).not.toBe('654');
    const saved = createAutoSavePayload({ diagramId: 'fixture', nodes, edges, routingSnapshot: snapshot });
    const loaded = coerceAutoSavePayload(JSON.parse(JSON.stringify(saved)));
    if (!loaded?.routingSnapshot) throw new Error('Snapshot was lost at persistence boundary');
    expect(registerRoutingOnlyDocumentCandidate(loaded.routingSnapshot)).toBe(true);
    const projected = projectBaseReactFlowDisplayWorkerInput(loaded);
    const identity = computeBaseReactFlowDisplayInputIdentityBundle({ ...projected, ...routingOptions });
    const restored = loadBaseReactFlowDocumentRouteCandidate({
      inputSignature: identity.cacheSignature, inputGeometryDigest: identity.geometryDigest,
      sourceEdges: loaded.edges,
    });
    expect(restored).not.toBeNull();
    expect(computeBaseReactFlowDisplayOutputRouteSignature(restored ?? [])).toBe(outputRouteSignature);
    expect(restored?.[0].label).toBe('business label');
    expect(snapshot?.candidate.patches[0]).not.toHaveProperty('label');
    expect(snapshot?.candidate.patches[0]).not.toHaveProperty('ariaLabel');
    expect(runtime.createDocumentSnapshot(structuredClone(nodes), structuredClone(edges))).toEqual(snapshot);
  });

  it('keeps authored ports, refuses changes and does not leak snapshots across Canvas instances', () => {
    const { runtime, nodes, edges } = makeDocumentFixture(true);
    const snapshot = runtime.createDocumentSnapshot(nodes, edges);
    expect(snapshot).not.toBeNull();
    expect(mergeBaseReactFlowDisplayEdgePatches(edges, snapshot?.candidate.patches ?? [])?.[0].sourceHandle).toBe('right');
    expect(createBaseReactFlowRoutingSessionRuntime().createDocumentSnapshot(nodes, edges)).toBeNull();
    expect(runtime.createDocumentSnapshot(nodes, edges.map(edge => ({ ...edge, sourceHandle: 'left' })))).toBeNull();
    expect(runtime.createDocumentSnapshot(nodes, edges.map(edge => ({ ...edge, target: 'source' })))).toBeNull();
    expect(runtime.createDocumentSnapshot(nodes, edges.map(edge => ({ ...edge, label: 'changed' })))).toBeNull();
    expect(runtime.createDocumentSnapshot(nodes.map(node => ({ ...node, position: { x: node.position.x + 0.0001, y: 0 } })), edges)).toBeNull();
    expect(runtime.createDocumentSnapshot(nodes.map(node => ({ ...node, measured: { width: 101, height: 60 } })), edges)).toBeNull();
  });

  it('invalidates during a new job and disposal, supports an accepted reusable baseline', () => {
    const { runtime, nodes, edges, baseline } = makeDocumentFixture();
    expect(runtime.createDocumentSnapshot(nodes, edges)).not.toBeNull();
    const pending = runtime.beginJob('layout');
    expect(runtime.createDocumentSnapshot(nodes, edges)).toBeNull();
    runtime.cancelJob(pending);
    expect(runtime.createDocumentSnapshot(nodes, edges)).toBeNull();
    runtime.rememberDocumentSnapshot(baseline, routingOptions);
    expect(runtime.createDocumentSnapshot(nodes, edges)).not.toBeNull();
    runtime.dispose();
    runtime.rememberDocumentSnapshot(baseline, routingOptions);
    expect(runtime.createDocumentSnapshot(nodes, edges)).toBeNull();
  });

  it('returns isolated candidate values and rejects an untrusted copy of a baseline', () => {
    const { runtime, nodes, edges, baseline } = makeDocumentFixture();
    const first = runtime.createDocumentSnapshot(nodes, edges);
    if (!first) throw new Error('Snapshot missing');
    Reflect.set(first.candidate.patches[0], 'source', 'tampered');
    expect(runtime.createDocumentSnapshot(nodes, edges)?.candidate.patches[0].source).toBe('source');
    expect(createBaseReactFlowDocumentSnapshotSource({ ...baseline }, routingOptions)).toBeNull();
    expect(createBaseReactFlowDocumentSnapshotSource(baseline, { ...routingOptions, smartEdgePadding: Infinity })).toBeNull();
  });

  it('rejects empty, duplicate, hidden, invalid and excessive geometry instead of exporting a partial graph', () => {
    const { runtime, nodes, edges } = makeDocumentFixture();
    for (const invalid of [[], [nodes[0], nodes[0]], nodes.map(node => ({ ...node, hidden: true })),
      nodes.map(node => ({ ...node, position: { x: NaN, y: 0 } })),
      nodes.map(node => ({ ...node, measured: { width: 0, height: 60 } })), Array(5001).fill(nodes[0])]) {
      expect(runtime.createDocumentSnapshot(invalid, edges)).toBeNull();
    }
    for (const invalid of [[], [edges[0], edges[0]], edges.map(edge => ({ ...edge, hidden: true })), Array(301).fill(edges[0])]) {
      expect(runtime.createDocumentSnapshot(nodes, invalid)).toBeNull();
    }
  });
});

describe('baseReactFlowRoutingSessionRuntime', () => {
  it('shares one Worker ref and invalidates a prior display job when layout begins', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const displayJob = runtime.beginJob('display');
    const worker = { terminate: vi.fn() } as unknown as Worker;
    runtime.workerRef.current = worker;

    const layoutJob = runtime.beginJob('layout');

    expect(displayJob.signal.aborted).toBe(true);
    expect(runtime.isCurrentJob(displayJob)).toBe(false);
    expect(runtime.isCurrentJob(layoutJob)).toBe(true);
    expect(runtime.workerRef.current).toBe(worker);
  });

  it('allows only the current job to commit and consumes its epoch once', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const staleJob = runtime.beginJob('display');
    const currentJob = runtime.beginJob('layout');
    const commit = vi.fn(() => 'committed');

    expect(runtime.commitJob(staleJob, commit)).toEqual({ committed: false });
    expect(runtime.commitJob(currentJob, commit)).toEqual({
      committed: true,
      value: 'committed',
    });
    expect(runtime.commitJob(currentJob, commit)).toEqual({ committed: false });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('keeps a thrown commit attempt current unless newer work supersedes it', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const retryableJob = runtime.beginJob('layout');
    const failure = new Error('layout-routing-hard-quality-rejected');

    expect(() => runtime.commitJob(retryableJob, () => { throw failure; })).toThrow(failure);
    expect(runtime.isCurrentJob(retryableJob)).toBe(true);

    const displayJob = runtime.beginJob('display');
    expect(retryableJob.signal.aborted).toBe(true);
    expect(runtime.commitJob(retryableJob, () => 'stale-retry')).toEqual({ committed: false });
    expect(runtime.isCurrentJob(displayJob)).toBe(true);
  });

  it('still consumes a non-throwing rejected result', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const job = runtime.beginJob('display');

    expect(runtime.commitJob(job, () => ({ accepted: false }))).toEqual({
      committed: true,
      value: { accepted: false },
    });
    expect(runtime.isCurrentJob(job)).toBe(false);
  });

  it('rejects synchronous job reentry while preserving the complete current commit', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const job = runtime.beginJob('layout');
    const writes: string[] = [];
    const nestedWrite = vi.fn();
    expect(runtime.commitJob(job, () => {
      writes.push('nodes');
      for (const owner of ['display', 'layout'] as const) {
        const reentrant = runtime.beginJob(owner);
        expect(reentrant.signal.aborted).toBe(true);
        expect(runtime.isCurrentJob(reentrant)).toBe(false);
        expect(runtime.commitJob(reentrant, nestedWrite)).toEqual({ committed: false });
      }
      expect(job.signal.aborted).toBe(false);
      expect(runtime.isCurrentJob(job)).toBe(true);
      expect(runtime.cancelJob(job)).toBe(false);
      expect(runtime.finishJob(job)).toBe(false);
      expect(runtime.commitJob(job, nestedWrite)).toEqual({ committed: false });
      writes.push('edges', 'selection');
    })).toEqual({ committed: true, value: undefined });
    expect(writes).toEqual(['nodes', 'edges', 'selection']);
    expect(nestedWrite).not.toHaveBeenCalled();
    expect(runtime.isCurrentJob(job)).toBe(false);
    expect(runtime.isCurrentJob(runtime.beginJob('display'))).toBe(true);
  });

  it('does not publish an acceptance staged before synchronous disposal', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const nodes: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} }];
    const accepted = createLayoutCandidateAcceptance(nodes, undefined, null);
    if (!accepted) throw Error('expected valid layout');
    const job = runtime.beginJob('layout');
    expect(runtime.commitJob(job, () => {
      expect(runtime.commitLayoutAcceptance(accepted, nodes, null)).toBe(true);
      expect(runtime.readLayoutAcceptance()).toBeNull();
      runtime.dispose();
    })).toEqual({ committed: false });
    expect(runtime.readLayoutAcceptance()).toBeNull();
    expect(job.signal.aborted).toBe(true);
  });

  it('aborts active work and disposes the shared Worker exactly once', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const job = runtime.beginJob('display');
    const disposer = vi.fn((workerRef: { current: Worker | null }) => {
      workerRef.current = null;
    });
    runtime.workerRef.current = { terminate: vi.fn() } as unknown as Worker;
    runtime.registerWorkerDisposer(disposer);

    runtime.dispose();
    runtime.dispose();

    expect(job.signal.aborted).toBe(true);
    expect(disposer).toHaveBeenCalledOnce();
    expect(runtime.workerRef.current).toBeNull();
    expect(() => runtime.beginJob('display')).toThrow('routing-session-runtime-disposed');
  });
});


it('publishes a layout envelope only after a successful current-job commit', () => {
  const runtime = createBaseReactFlowRoutingSessionRuntime();
  const nodes: Node[] = [{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} }];
  const accepted = createLayoutCandidateAcceptance(nodes, undefined, null);
  if (!accepted) throw Error('expected valid layout');
  const first = runtime.beginJob('layout');
  expect(runtime.commitLayoutAcceptance(accepted, nodes, null)).toBe(false);
  runtime.commitJob(first, () => expect(runtime.commitLayoutAcceptance(accepted, nodes, null)).toBe(true));
  expect(runtime.readLayoutAcceptance()).toBe(accepted);
  const shifted = [{ ...nodes[0], position: { x: 200, y: 0 } }];
  const next = createLayoutCandidateAcceptance(shifted, undefined, null);
  if (!next) throw Error('expected next layout');
  const failed = runtime.beginJob('layout');
  expect(() => runtime.commitJob(failed, () => {
    expect(runtime.commitLayoutAcceptance(next, shifted, null)).toBe(true);
    throw Error('state writer failed');
  })).toThrow('state writer failed');
  expect(runtime.readLayoutAcceptance()).toBe(accepted);
  const stale = runtime.beginJob('layout');
  runtime.beginJob('display');
  expect(runtime.commitJob(stale, () => runtime.commitLayoutAcceptance(next, shifted, null))).toEqual({ committed: false });
  expect(runtime.readLayoutAcceptance()).toBe(accepted);
  runtime.dispose();
  expect(runtime.readLayoutAcceptance()).toBeNull();
});
