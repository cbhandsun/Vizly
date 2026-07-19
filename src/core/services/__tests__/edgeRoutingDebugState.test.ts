import { describe, expect, it, vi } from 'vitest';

import type { PathFindingJob, PathFindingResult, SharedGraphContext } from '../../types/routing';
import type { RoutingBatchRequest } from '../edgeRoutingBatchLifecycle';
import { EdgeRoutingDebugState, refreshDebugRoutingRequestEndpoints } from '../edgeRoutingDebugState';

const job = (edgeId = 'edge'): PathFindingJob => ({
  jobId: 'job',
  edgeId,
  source: 'A',
  target: 'B',
  sourceX: 0,
  sourceY: 0,
  targetX: 10,
  targetY: 10,
  isOneToMany: false,
  isManyToOne: false,
});

const result: PathFindingResult = {
  jobId: 'job',
  edgeId: 'edge',
  path: '',
  points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  labelX: 5,
  labelY: 5,
};

describe('EdgeRoutingDebugState', () => {
  it('normalizes selection and marks only the selected edge job for debugging', () => {
    const state = new EdgeRoutingDebugState();
    const onSelection = vi.fn();
    state.registerSelectionListener(onSelection);
    state.selectEdge('edge');
    const selected = job();
    const other = job('other');
    state.prepareJob(selected);
    state.prepareJob(other);

    expect(selected.debug).toBe(true);
    expect(other.debug).toBeUndefined();
    state.selectEdge('');
    expect(state.getSelectedEdgeId()).toBeNull();
    expect(onSelection).toHaveBeenLastCalledWith(null);
  });

  it('isolates listener failures from selection and result emission', () => {
    const onListenerError = vi.fn();
    const state = new EdgeRoutingDebugState(onListenerError);
    state.registerSelectionListener(() => { throw new Error('selection'); });
    state.registerDataListener(() => { throw new Error('data'); });
    state.selectEdge('edge');
    state.emitResult('edge', result, job(), false);

    expect(onListenerError).toHaveBeenCalledTimes(2);
  });

  it('collects finite trunk debug data and emits a sanitized payload', () => {
    const listener = vi.fn();
    const state = new EdgeRoutingDebugState();
    state.registerDataListener(listener);
    state.selectEdge('edge');
    state.recordClassification({ id: 'edge', type: 'data' }, Number.NaN);
    state.recordTrunk(['edge'], {
      direction: 'vertical',
      axis: Number.NaN,
      range: { min: 0, max: 100 },
    });
    state.recordTrunk(['edge'], {
      direction: 'horizontal',
      axis: 20,
      range: { min: 0, max: 100 },
    });
    state.emitResult('edge', result, job(), false);

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      edgeId: 'edge',
      trunkClassification: expect.objectContaining({
        delta: 0,
        edgeType: 'data',
      }),
    }));
  });
});

describe('refreshDebugRoutingRequestEndpoints', () => {
  it('refreshes endpoints from finite absolute positions and measured sizes', () => {
    const request = {
      edgeId: 'edge',
      job: job(),
      graph: {
        nodes: [
          { id: 'A', positionAbsolute: { x: 100, y: 200 }, measured: { width: 40, height: 20 } },
          { id: 'B', position: { x: 300, y: 400 }, width: 60, height: 30 },
        ],
      } as SharedGraphContext,
    } satisfies RoutingBatchRequest;

    refreshDebugRoutingRequestEndpoints(request);
    expect(request.job).toMatchObject({ sourceX: 120, sourceY: 210, targetX: 330, targetY: 415 });
  });

  it('falls back from malformed nodes and non-finite coordinates without throwing', () => {
    const request = {
      edgeId: 'edge',
      job: { ...job(), sourceX: 7, sourceY: 8 },
      graph: {
        nodes: [
          null,
          { id: '', position: { x: 1, y: 2 } },
          {
            id: 'A',
            positionAbsolute: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
            width: -10,
            height: Number.MAX_VALUE,
          },
        ],
      } as unknown as SharedGraphContext,
    } satisfies RoutingBatchRequest;

    expect(() => refreshDebugRoutingRequestEndpoints(request)).not.toThrow();
    expect(request.job.sourceX).toBe(82);
    expect(request.job.sourceY).toBe(48);
  });
});
