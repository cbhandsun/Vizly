import { Position } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  PathFindingJob,
  PathFindingResult,
  SharedGraphContext,
} from '../../types/routing';
import {
  buildRoutingDebugPayload,
  commitRoutingBatchResults,
  createMissingRoutingResult,
  createRoutingBatchSnapshot,
  syncPreparedJobsToLatestRequests,
  type LatestRoutingRequestEntry,
  type RoutingBatchRequest,
} from '../edgeRoutingBatchLifecycle';

const graph = (version: number): SharedGraphContext => ({
  nodes: [],
  edges: [],
  obstacles: [],
  config: {},
  graphVersion: version,
});

const request = (
  edgeId: string,
  context = graph(1),
): RoutingBatchRequest => ({
  edgeId,
  job: {
    jobId: `job-${edgeId}`,
    source: 'source',
    target: 'target',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
  },
  graph: context,
});

const entry = (
  edgeId: string,
  updatedAt: number,
  seq: number,
  context = graph(1),
): LatestRoutingRequestEntry => ({
  request: request(edgeId, context),
  graphKey: `graph-${context.graphVersion}`,
  seq,
  updatedAt,
});

const job = (edgeId: string): PathFindingJob => ({
  jobId: `job-${edgeId}`,
  edgeId,
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
});

const result = (edgeId: string): PathFindingResult => ({
  jobId: `job-${edgeId}`,
  edgeId,
  path: 'M 0 0 L 100 100',
  points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
  labelX: 50,
  labelY: 50,
});

describe('edgeRoutingBatchLifecycle', () => {
  it('uses the freshest graph snapshot while retaining all dirty requests', () => {
    const old = entry('old', 10, 1, graph(1));
    const fresh = entry('fresh', 20, 3, graph(2));
    const snapshot = createRoutingBatchSnapshot(
      ['old', 'missing', 'fresh'],
      new Map([
        ['old', old],
        ['fresh', fresh],
      ]),
    );

    expect(snapshot?.graph.graphVersion).toBe(2);
    expect(snapshot?.graphKey).toBe('graph-2');
    expect(snapshot?.requests.map(item => item.edgeId)).toEqual(['old', 'fresh']);
    expect(snapshot?.seqByEdge).toEqual(new Map([
      ['old', 1],
      ['fresh', 3],
    ]));
    expect(createRoutingBatchSnapshot(['missing'], new Map())).toBeUndefined();
  });

  it('syncs prepared bus metadata back to cache-key request jobs', () => {
    const prepared = job('edge-a');
    prepared.outgoingIndex = 2;
    prepared.outgoingCount = 3;
    prepared.incomingIndex = 1;
    prepared.incomingCount = 2;
    prepared.isOneToMany = true;
    prepared.busTrunkSource = { x: 10, y: 20 };
    prepared.busRoutingPlan = {
      busIndex: 0,
      peerGroupKey: 'group',
      peerGroupSize: 1,
      peerGroupMembers: ['edge-a'],
      trunkPort: Position.Bottom,
      trunkPortTangent: 10,
      portFrozen: true,
    };
    const latest = entry('edge-a', 1, 1);

    syncPreparedJobsToLatestRequests(
      [prepared],
      new Map([['edge-a', latest]]),
    );

    expect(latest.request.job).toMatchObject({
      outgoingIndex: 2,
      outgoingCount: 3,
      incomingIndex: 1,
      incomingCount: 2,
      isOneToMany: true,
      busTrunkSource: { x: 10, y: 20 },
      busRoutingPlan: { peerGroupKey: 'group' },
    });
  });

  it('creates a finite fallback result for missing worker output', () => {
    const missingRequest = request('missing');
    missingRequest.job.sourceX = Number.NaN;
    missingRequest.job.targetY = Number.POSITIVE_INFINITY;
    expect(createMissingRoutingResult(missingRequest)).toMatchObject({
      edgeId: 'missing',
      path: 'M 0 0 L 100 0',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      labelX: 50,
      labelY: 0,
      error: 'Missing result from parallel routing',
    });
  });

  it('resolves missing results and removes pending resolvers', () => {
    const resolve = vi.fn();
    const onMissingResult = vi.fn();
    const pendingResolvers = new Map([['edge-a', { resolve }]]);
    const dirtyEdgeIds = new Set(['edge-a']);
    const committed = commitRoutingBatchResults({
      requests: [request('edge-a')],
      results: [null],
      jobs: [job('edge-a')],
      seqByEdge: new Map([['edge-a', 1]]),
      getLatestSeq: () => 1,
      pendingResolvers,
      clearDirtyEdge: edgeId => dirtyEdgeIds.delete(edgeId),
      onMissingResult,
      onResult: vi.fn(),
    });

    expect(committed.size).toBe(0);
    expect(onMissingResult).toHaveBeenCalledWith('edge-a', 0);
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      edgeId: 'edge-a',
      error: 'Missing result from parallel routing',
    }));
    expect(pendingResolvers.has('edge-a')).toBe(false);
    expect(dirtyEdgeIds.has('edge-a')).toBe(true);
  });

  it('keeps superseded edges dirty but always resolves their pending promise', () => {
    const resolve = vi.fn();
    const dirtyEdgeIds = new Set(['edge-a', 'edge-b']);
    const onResult = vi.fn();
    const committed = commitRoutingBatchResults({
      requests: [request('edge-a'), request('edge-b')],
      results: [result('edge-a'), result('edge-b')],
      jobs: [job('edge-a'), job('edge-b')],
      seqByEdge: new Map([
        ['edge-a', 1],
        ['edge-b', 2],
      ]),
      getLatestSeq: edgeId => edgeId === 'edge-a' ? 9 : 2,
      pendingResolvers: new Map([['edge-a', { resolve }]]),
      clearDirtyEdge: edgeId => dirtyEdgeIds.delete(edgeId),
      onResult,
    });

    expect(committed.size).toBe(2);
    expect(dirtyEdgeIds.has('edge-a')).toBe(true);
    expect(dirtyEdgeIds.has('edge-b')).toBe(false);
    expect(resolve).toHaveBeenCalledWith(result('edge-a'));
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it('isolates per-edge commit callback failures without hanging resolvers', () => {
    const failure = new Error('cache failure');
    const resolve = vi.fn();
    const onCommitFailure = vi.fn();
    const committed = commitRoutingBatchResults({
      requests: [request('edge-a')],
      results: [result('edge-a')],
      jobs: [job('edge-a')],
      seqByEdge: new Map([['edge-a', 1]]),
      getLatestSeq: () => 1,
      pendingResolvers: new Map([['edge-a', { resolve }]]),
      clearDirtyEdge: vi.fn(),
      onResult: () => {
        throw failure;
      },
      onCommitFailure,
    });

    expect(committed.has('edge-a')).toBe(true);
    expect(onCommitFailure).toHaveBeenCalledWith(failure, 'edge-a');
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('builds debug payloads without logging the raw result', () => {
    const routed = result('edge-a');
    routed.debugInfo = {
      algorithmDebug: {
        portSelection: { existing: true },
      },
    };
    const prepared = job('edge-a') as PathFindingJob & {
      peerGroupMembers?: string[];
      peerGroupKey?: string;
    };
    prepared.peerGroupMembers = ['edge-a', 'edge-b'];
    prepared.peerGroupKey = 'group';
    const payload = buildRoutingDebugPayload(
      'edge-a',
      routed,
      {
        delta: 42,
        side: 1,
        typeInfluenced: false,
        trunk: {
          direction: 'vertical',
          axis: 50,
          range: { min: 0, max: 100 },
        },
      },
      prepared,
    );

    expect(payload).toMatchObject({
      edgeId: 'edge-a',
      trunkClassification: {
        side: 'FORWARD',
        delta: 42,
      },
      algorithmDebug: {
        portSelection: {
          existing: true,
          trunkAxis: 50,
          trunkVertical: true,
          peerGroupMembers: ['edge-a', 'edge-b'],
          peerGroupSize: 2,
          peerGroupKey: 'group',
        },
      },
    });
  });
});
