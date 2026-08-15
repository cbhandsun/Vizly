import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resolveBaseReactFlowDisplayCandidate,
  resolveBaseReactFlowPrecompiledCandidateTimeoutMs,
} from '../baseReactFlowDisplayCandidateResolver';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, data: {} },
  { id: 'target', position: { x: 300, y: 0 }, data: {} },
];
const edges: Edge[] = [{ id: 'edge', source: 'source', target: 'target' }];
const candidateEdges: Edge[] = [{
  ...edges[0],
  type: 'stablePath',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: { computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }] },
}];
const input = {
  inputSignature: 'input-signature',
  nodes,
  edges,
  enableSmartEdges: true,
  smartEdgePadding: 20,
  isLargeGraph: false,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('baseReactFlowDisplayCandidateResolver', () => {
  it('bypasses both precompiled and persistent candidates during regeneration', async () => {
    const load = vi.fn(async () => candidateEdges);
    await expect(resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: candidateEdges,
      signal: new AbortController().signal,
      isCurrent: () => true,
      allowExternalCandidates: false,
      loadPrecompiledCandidate: load,
    })).resolves.toEqual({ candidateEdges: null, source: 'miss' });
    expect(load).not.toHaveBeenCalled();
  });

  it('prefers a precompiled artifact over a persistent candidate', async () => {
    const load = vi.fn(async () => candidateEdges);
    await expect(resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: [{ ...candidateEdges[0], sourceHandle: 'left' }],
      signal: new AbortController().signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: load,
    })).resolves.toEqual({ candidateEdges, source: 'precompiled' });
    expect(load).toHaveBeenCalledOnce();
  });

  it('falls back to a persistent candidate on an artifact miss or bounded timeout', async () => {
    await expect(resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: candidateEdges,
      signal: new AbortController().signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: vi.fn(async () => null),
    })).resolves.toEqual({ candidateEdges, source: 'persistent' });

    vi.useFakeTimers();
    const pending = resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: candidateEdges,
      signal: new AbortController().signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: () => new Promise(() => {}),
      loadTimeoutMs: 1_000,
    });
    const resolved = expect(pending).resolves.toEqual({ candidateEdges, source: 'persistent' });
    await vi.advanceTimersByTimeAsync(1_000);
    await resolved;
  });

  it('returns a lazy artifact hit and converts misses or failures to full-route resolutions', async () => {
    await expect(resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: null,
      signal: new AbortController().signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: vi.fn(async () => candidateEdges),
    })).resolves.toEqual({ candidateEdges, source: 'precompiled' });
    await expect(resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: null,
      signal: new AbortController().signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: vi.fn(async () => null),
    })).resolves.toEqual({ candidateEdges: null, source: 'miss' });
    await expect(resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: null,
      signal: new AbortController().signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: vi.fn(async () => { throw new Error('chunk failed'); }),
    })).resolves.toEqual({ candidateEdges: null, source: 'miss' });
  });

  it('drops an artifact result when the schedule is aborted or becomes stale while loading', async () => {
    let resolveFirst: (value: Edge[] | null) => void = () => undefined;
    const firstLoad = new Promise<Edge[] | null>((resolve) => { resolveFirst = resolve; });
    const aborted = new AbortController();
    const abortedResult = resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: null,
      signal: aborted.signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: () => firstLoad,
    });
    aborted.abort();
    resolveFirst(candidateEdges);
    await expect(abortedResult).resolves.toBeNull();

    let current = true;
    let resolveSecond: (value: Edge[] | null) => void = () => undefined;
    const secondLoad = new Promise<Edge[] | null>((resolve) => { resolveSecond = resolve; });
    const staleResult = resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: null,
      signal: new AbortController().signal,
      isCurrent: () => current,
      loadPrecompiledCandidate: () => secondLoad,
    });
    current = false;
    resolveSecond(candidateEdges);
    await expect(staleResult).resolves.toBeNull();
  });

  it('keeps a newer lookup independent when an older lazy lookup resolves last', async () => {
    let oldCurrent = true;
    let resolveOld: (value: Edge[] | null) => void = () => undefined;
    const oldResult = resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: null,
      signal: new AbortController().signal,
      isCurrent: () => oldCurrent,
      loadPrecompiledCandidate: () => new Promise((resolve) => { resolveOld = resolve; }),
    });
    oldCurrent = false;
    const newResult = await resolveBaseReactFlowDisplayCandidate({
      input: { ...input, inputSignature: 'new-signature' },
      persistentCandidateEdges: null,
      signal: new AbortController().signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: vi.fn(async () => candidateEdges),
    });
    resolveOld(candidateEdges);

    expect(newResult).toEqual({ candidateEdges, source: 'precompiled' });
    await expect(oldResult).resolves.toBeNull();
  });

  it('bounds invalid artifact timeouts and falls back when a loader never resolves', async () => {
    expect(resolveBaseReactFlowPrecompiledCandidateTimeoutMs(Number.NaN)).toBe(2_000);
    expect(resolveBaseReactFlowPrecompiledCandidateTimeoutMs(Number.POSITIVE_INFINITY)).toBe(2_000);
    expect(resolveBaseReactFlowPrecompiledCandidateTimeoutMs(-1)).toBe(1_000);
    expect(resolveBaseReactFlowPrecompiledCandidateTimeoutMs(30_000)).toBe(3_000);

    vi.useFakeTimers();
    const pending = resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: null,
      signal: new AbortController().signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: () => new Promise(() => {}),
      loadTimeoutMs: 2_000,
    });
    const resolved = expect(pending).resolves.toEqual({ candidateEdges: null, source: 'miss' });
    await vi.advanceTimersByTimeAsync(2_000);
    await resolved;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles a late loader rejection after timeout without leaking a timer', async () => {
    vi.useFakeTimers();
    let rejectLoad: (reason?: unknown) => void = () => undefined;
    const pending = resolveBaseReactFlowDisplayCandidate({
      input,
      persistentCandidateEdges: null,
      signal: new AbortController().signal,
      isCurrent: () => true,
      loadPrecompiledCandidate: () => new Promise((_resolve, reject) => { rejectLoad = reject; }),
      loadTimeoutMs: 1_000,
    });
    const resolved = expect(pending).resolves.toEqual({ candidateEdges: null, source: 'miss' });
    await vi.advanceTimersByTimeAsync(1_000);
    await resolved;
    rejectLoad(new Error('late chunk failure'));
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
});
