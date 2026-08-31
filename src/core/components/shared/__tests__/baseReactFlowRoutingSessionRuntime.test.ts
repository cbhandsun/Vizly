import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { createBaseReactFlowRoutingSessionRuntime } from '../baseReactFlowRoutingSessionRuntime';
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
