// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  areBaseReactFlowHandlesMeasured,
  getBaseReactFlowNodeElement,
  refreshBaseReactFlowNodeInternals,
  scheduleBaseReactFlowNodeInternalsRetry,
} from '../baseReactFlowNodeInternals';

describe('baseReactFlowNodeInternals', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    vi.useRealTimers();
  });

  it('finds mounted react-flow nodes using escaped data-id selectors', () => {
    document.body.innerHTML = '<div class="react-flow__node" data-id="node&quot;1"></div>';
    const container = document.body;

    const nodeEl = getBaseReactFlowNodeElement(container, 'node"1');
    expect(nodeEl).toBeTruthy();
  });

  it('updates mounted node internals through store API when DOM nodes exist', () => {
    document.body.innerHTML = '<div class="react-flow__node" data-id="node-1"></div>';
    const updateNodeInternalsFromStore = vi.fn();
    const updateNodeInternalsFallback = vi.fn();

    refreshBaseReactFlowNodeInternals({
      container: document.body,
      nodeIds: ['node-1'],
      rfStore: {
        getState: () => ({
          updateNodeInternals: updateNodeInternalsFromStore,
        }),
      },
      updateNodeInternals: updateNodeInternalsFallback,
    });

    expect(updateNodeInternalsFromStore).toHaveBeenCalled();
    expect(updateNodeInternalsFallback).not.toHaveBeenCalled();
  });

  it('falls back to updateNodeInternals when mounted node elements are missing', () => {
    const updateNodeInternalsFallback = vi.fn();

    refreshBaseReactFlowNodeInternals({
      container: document.body,
      nodeIds: ['node-1'],
      rfStore: {
        getState: () => ({}),
      },
      updateNodeInternals: updateNodeInternalsFallback,
    });

    expect(updateNodeInternalsFallback).toHaveBeenCalledWith(['node-1']);
  });

  it('rejects malformed third-party store snapshots at the adapter boundary', () => {
    const updateNodeInternalsFallback = vi.fn();
    refreshBaseReactFlowNodeInternals({
      container: document.body,
      nodeIds: ['node-1'],
      rfStore: { getState: () => null },
      updateNodeInternals: updateNodeInternalsFallback,
    });

    expect(updateNodeInternalsFallback).toHaveBeenCalledWith(['node-1']);
    expect(areBaseReactFlowHandlesMeasured({
      container: document.body,
      nodeIds: ['node-1'],
      rfStore: { getState: () => ({ nodeLookup: 'invalid' }) },
    })).toBe(false);
  });

  it('reports whether mounted handles have measured bounds', () => {
    document.body.innerHTML = '<div class="react-flow__node" data-id="node-1"><div class="react-flow__handle"></div></div>';

    expect(areBaseReactFlowHandlesMeasured({
      container: document.body,
      nodeIds: ['node-1'],
      rfStore: {
        getState: () => ({
          nodeLookup: new Map([
            ['node-1', { internals: { handleBounds: { source: [{}], target: [] } } }],
          ]),
        }),
      },
    })).toBe(true);

    expect(areBaseReactFlowHandlesMeasured({
      container: document.body,
      nodeIds: ['node-1'],
      rfStore: {
        getState: () => ({
          nodeLookup: new Map([
            ['node-1', { internals: { handleBounds: { source: [], target: [] } } }],
          ]),
        }),
      },
    })).toBe(false);
  });

  it('waits for visible node DOM to mount before reporting handles measured', () => {
    const rfStore = {
      getState: () => ({
        nodeLookup: new Map([
          ['node-1', { internals: { handleBounds: { source: [], target: [] } } }],
        ]),
      }),
    };

    expect(areBaseReactFlowHandlesMeasured({
      container: document.body,
      nodeIds: ['node-1'],
      rfStore,
    })).toBe(false);

    document.body.innerHTML = '<div class="react-flow__node" data-id="node-1"></div>';

    expect(areBaseReactFlowHandlesMeasured({
      container: document.body,
      nodeIds: ['node-1'],
      rfStore,
    })).toBe(true);
  });

  it('does not retry permanently hidden handles in semantic zoom mode', () => {
    document.body.classList.add('diagram-zoomed-out');
    document.body.innerHTML = [
      '<div class="react-flow__node" data-id="node-1">',
      '  <div class="react-flow__handle"></div>',
      '</div>',
    ].join('');

    expect(areBaseReactFlowHandlesMeasured({
      container: document.body,
      nodeIds: ['node-1'],
      rfStore: {
        getState: () => ({
          nodeLookup: new Map([
            ['node-1', { internals: { handleBounds: { source: [], target: [] } } }],
          ]),
        }),
      },
    })).toBe(true);
  });

  it('schedules retry refreshes until handles are measured', () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const areHandlesMeasured = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const cleanup = scheduleBaseReactFlowNodeInternalsRetry({
      refresh,
      areHandlesMeasured,
      requestAnimationFrameImpl: (callback) => {
        callback(0);
        return 1;
      },
      cancelAnimationFrameImpl: vi.fn(),
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120);
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(120);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(areHandlesMeasured).toHaveBeenCalledTimes(3);

    cleanup();
  });

  it('skips forced refresh when handles are already measured', () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const areHandlesMeasured = vi.fn(() => true);

    const cleanup = scheduleBaseReactFlowNodeInternalsRetry({
      refresh,
      areHandlesMeasured,
      requestAnimationFrameImpl: (callback) => {
        callback(0);
        return 1;
      },
      cancelAnimationFrameImpl: vi.fn(),
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(areHandlesMeasured).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
