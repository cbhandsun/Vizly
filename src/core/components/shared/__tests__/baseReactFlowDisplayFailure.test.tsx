// @vitest-environment jsdom

import { act, render, renderHook, screen } from '@testing-library/react';
import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { useBaseReactFlowDisplayRoutingResult } from '../useBaseReactFlowDisplayRoutingResult';
import { classifyDisplayFinalRejection, classifyDisplayWorkerFailure, createCurrentDisplayFailure,
  type BaseReactFlowDisplayFailure } from '../baseReactFlowDisplayFailure';
import { createBaseReactFlowRoutingSessionRuntime } from '../baseReactFlowRoutingSessionRuntime';
import { useBaseReactFlowDisplayFailure } from '../useBaseReactFlowDisplayFailure';
import { BaseReactFlowDisplayStatusOverlay } from '../BaseReactFlowDisplayStatusOverlay';
import { createDisplayRoutingRejectionHandler } from '../baseReactFlowDisplayRejectionHandler';

const sourceEdges: Edge[] = [{
  id: 'sb', source: 's', target: 'b', type: 'advanced-smart-step', selected: true,
}];
const failure: BaseReactFlowDisplayFailure = {
  reason: 'quality-rejected',
  inputSignature: '123', inputGeometryDigest: 'geometry', jobId: 1,
};

describe('display routing failure terminal', () => {
  it('blocks unsafe drag and ordinary fallback after final quality rejection', () => {
    const options = {
      sourceEdges, inputSignature: '123', inputGeometryDigest: 'geometry',
      policyMode: 'full' as const, deferred: null, cachedEdges: null,
      holdUnverifiedImmediateEdges: false, isNodeDragging: false,
      dragFallbackPending: true, nodeDragFallbackIds: ['b'],
      committedRenderAuthority: null, failure,
    };
    const hook = renderHook(() => useBaseReactFlowDisplayRoutingResult(options));
    expect(hook.result.current.edges).toEqual([]);
    expect(hook.result.current.renderAuthority).toBeNull();
    expect(sourceEdges[0].selected).toBe(true);
    hook.unmount();
    const settled = renderHook(() => useBaseReactFlowDisplayRoutingResult({
      ...options, dragFallbackPending: false, nodeDragFallbackIds: [],
    }));
    expect(settled.result.current.edges).toEqual([]);
  });

  it('does not hide a new geometry using an old failure', () => {
    const hook = renderHook(() => useBaseReactFlowDisplayRoutingResult({
      sourceEdges, inputSignature: '124', inputGeometryDigest: 'new-geometry',
      policyMode: 'full', deferred: null, cachedEdges: null,
      holdUnverifiedImmediateEdges: false, isNodeDragging: false,
      dragFallbackPending: false, nodeDragFallbackIds: [], committedRenderAuthority: null, failure,
    }));
    expect(hook.result.current.failure).toBeNull();
    expect(hook.result.current.edges).toHaveLength(1);
  });

  it('retains a terminal across rerenders, clears on a new intent and does not resurrect it', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const hook = renderHook(({ signature, paused }) => useBaseReactFlowDisplayFailure(signature, 'geometry', paused, runtime), {
      initialProps: { signature: '123', paused: false },
    });
    act(() => hook.result.current.setFailure(failure));
    hook.rerender({ signature: '123', paused: false });
    expect(hook.result.current.failure).toEqual(failure);
    const staleSetter = hook.result.current.setFailure;
    hook.rerender({ signature: '123', paused: true });
    expect(hook.result.current.failure).toBeNull();
    act(() => staleSetter(failure));
    expect(hook.result.current.failure).toBeNull();
    hook.rerender({ signature: '123', paused: false });
    expect(hook.result.current.failure).toBeNull();
    act(() => hook.result.current.setFailure(failure));
    act(() => hook.result.current.setFailure(null));
    expect(hook.result.current.failure).toBeNull();
    act(() => hook.result.current.setFailure(failure));
    hook.rerender({ signature: '124', paused: false });
    expect(hook.result.current.failure).toBeNull();
  });

  it('isolates same-identity failures and captured setters by runtime object ownership', () => {
    const firstRuntime = createBaseReactFlowRoutingSessionRuntime();
    const nextRuntime = createBaseReactFlowRoutingSessionRuntime();
    // Job numbers are local to each runtime and intentionally collide here.
    expect(firstRuntime.beginJob('display').id).toBe(nextRuntime.beginJob('display').id);
    const hook = renderHook(({ runtime }) => useBaseReactFlowDisplayFailure('123', 'geometry', false, runtime), {
      initialProps: { runtime: firstRuntime },
    });
    act(() => hook.result.current.setFailure(failure));
    const staleSetter = hook.result.current.setFailure;
    hook.rerender({ runtime: nextRuntime });
    expect(hook.result.current.failure).toBeNull();
    act(() => staleSetter(failure));
    expect(hook.result.current.failure).toBeNull();
    const nextFailure: BaseReactFlowDisplayFailure = { ...failure, reason: 'worker-timeout' };
    act(() => hook.result.current.setFailure(nextFailure));
    act(() => staleSetter(null));
    expect(hook.result.current.failure).toEqual(nextFailure);
    hook.unmount();
    firstRuntime.dispose();
    nextRuntime.dispose();
  });

  it('admits only the active job and exact current input', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const job = runtime.beginJob('display');
    const options = { runtime, job, requested: failure, current: failure, reason: failure.reason };
    expect(createCurrentDisplayFailure(options)).toEqual({ ...failure, jobId: job.id });
    expect(createCurrentDisplayFailure({ ...options, current: null })).toBeNull();
    expect(createCurrentDisplayFailure({ ...options, current: { ...failure, inputSignature: '124' } })).toBeNull();
    expect(createCurrentDisplayFailure({ ...options, current: { ...failure, inputGeometryDigest: 'other' } })).toBeNull();
    runtime.beginJob('layout');
    expect(createCurrentDisplayFailure(options)).toBeNull();
    runtime.dispose();
    expect(createCurrentDisplayFailure(options)).toBeNull();
  });

  it('settles failure and feedback together only while the request remains current', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const job = runtime.beginJob('display');
    const setFailure = vi.fn();
    const onFallbackResolved = vi.fn();
    const reject = createDisplayRoutingRejectionHandler({
      runtime, inputSignature: '123', inputGeometryDigest: 'geometry',
      readRequest: () => ({ job, input: { cacheSignature: '123', inputGeometryDigest: 'geometry' } }),
      setFailure, onFallbackResolved,
    });
    reject('quality-rejected');
    expect(setFailure).toHaveBeenCalledWith({ ...failure, jobId: job.id });
    expect(onFallbackResolved).toHaveBeenCalledOnce();
    runtime.beginJob('layout');
    reject('worker-failed');
    expect(setFailure).toHaveBeenCalledOnce();
    expect(onFallbackResolved).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it.each([null, { job: null, input: null }])('ignores absent or cancelled request %s', request => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const setFailure = vi.fn();
    const onFallbackResolved = vi.fn();
    createDisplayRoutingRejectionHandler({
      runtime, inputSignature: '123', inputGeometryDigest: 'geometry',
      readRequest: () => request, setFailure, onFallbackResolved,
    })('worker-failed');
    expect(setFailure).not.toHaveBeenCalled();
    expect(onFallbackResolved).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it.each([
    [false, true, false, 'quality-rejected'], [true, false, true, 'route-mismatch'],
    [true, true, false, 'receipt-missing'], [true, true, true, null],
  ] as const)('classifies hard=%s match=%s receipt=%s', (hardClean, routesMatch, hasReceipt, expected) => {
    expect(classifyDisplayFinalRejection({ hardClean, routesMatch, hasReceipt })).toBe(expected);
  });

  it.each([null, undefined, '', 42, { message: '<script>secret</script>' }, new Error('token=private')])(
    'does not expose unknown worker failure %s', error => {
      expect(classifyDisplayWorkerFailure(error)).toBe('worker-failed');
    },
  );

  it('separates cancellation, timeout and failed quality', () => {
    expect(classifyDisplayWorkerFailure(new DOMException('cancel', 'AbortError'))).toBeNull();
    expect(classifyDisplayWorkerFailure(new Error('display-edge-worker-cancelled'))).toBeNull();
    expect(classifyDisplayWorkerFailure(new Error('display-edge-worker-timeout'))).toBe('worker-timeout');
    expect(classifyDisplayWorkerFailure(new Error('display-edge-worker-final-quality-failed:obstacle=1'))).toBe('quality-rejected');
  });

  it('shows one fixed accessible message and removes it on recovery', () => {
    const view = render(<BaseReactFlowDisplayStatusOverlay isContainerReady failure={failure} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain('已暂停显示连线');
    expect(screen.getByRole('status').textContent).not.toContain('geometry');
    view.rerender(<BaseReactFlowDisplayStatusOverlay isContainerReady failure={null} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
