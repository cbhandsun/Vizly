// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { useClipboard } from '../useClipboard';

const loggingState = vi.hoisted(() => ({
  logClipboardWriteFailure: vi.fn(),
  logClipboardSystemWriteFailure: vi.fn(),
  logClipboardReadFailure: vi.fn(),
  logClipboardStorageReadFailure: vi.fn(),
}));

vi.mock('../clipboardLogging', () => loggingState);

const selectedNodes: Node[] = [
  {
    id: 'node-1',
    type: 'default',
    position: { x: 10, y: 20 },
    data: { label: 'Node 1' },
  } as Node,
];

const selectedEdges: Edge[] = [];
const getOperationScope = () => 'diagram-1:page-1';

describe('useClipboard', () => {
  beforeEach(() => {
    Object.values(loggingState).forEach(mock => mock.mockReset());
    localStorage.clear();
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still writes to the system clipboard when local persistence fails', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const writeText = vi.fn().mockRejectedValue(new Error('Authorization: Bearer clipboard-write-secret'));
    Object.assign(navigator, { clipboard: { writeText, readText: vi.fn() } });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cookie=local-copy-secret');
    });

    const { result } = renderHook(() =>
      useClipboard({
        nodesRef: { current: selectedNodes },
        edgesRef: { current: selectedEdges },
        selectedNodes,
        selectedEdges,
        setNodes,
        setEdges,
        takeSnapshot,
        getOperationScope,
      })
    );

    await act(async () => {
      result.current.handleCopy();
      await Promise.resolve();
    });

    expect(loggingState.logClipboardWriteFailure).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(loggingState.logClipboardSystemWriteFailure).toHaveBeenCalled();
  });

  it('logs system clipboard read failure and falls back to local storage paste', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const readText = vi.fn().mockRejectedValue(new Error('api_key=clipboard-read-secret'));
    Object.assign(navigator, { clipboard: { writeText: vi.fn(), readText } });

    localStorage.setItem('flowchart-clipboard', JSON.stringify({
      nodes: selectedNodes,
      edges: selectedEdges,
    }));

    const { result } = renderHook(() =>
      useClipboard({
        nodesRef: { current: [] },
        edgesRef: { current: [] },
        selectedNodes: [],
        selectedEdges: [],
        setNodes,
        setEdges,
        takeSnapshot,
        getOperationScope,
      })
    );

    let pasteResult = 'empty';
    await act(async () => {
      pasteResult = await result.current.handlePaste();
    });

    expect(pasteResult).toBe('pasted');
    expect(loggingState.logClipboardReadFailure).toHaveBeenCalled();
    expect(takeSnapshot).toHaveBeenCalledWith([], []);
    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(setEdges).toHaveBeenCalledTimes(1);
  });

  it('does not delete an edge-only selection because it has no pasteable payload', () => {
    const edgeOnlySelection: Edge[] = [{
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      selected: true,
    }];
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText, readText: vi.fn() } });

    const { result } = renderHook(() =>
      useClipboard({
        nodesRef: { current: selectedNodes },
        edgesRef: { current: edgeOnlySelection },
        selectedNodes: [],
        selectedEdges: edgeOnlySelection,
        setNodes,
        setEdges,
        takeSnapshot,
        getOperationScope,
      })
    );

    act(() => result.current.handleCut());

    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(localStorage.getItem('flowchart-clipboard')).toBeNull();
  });

  it('does not cut a locked node or write it to either clipboard channel', () => {
    const lockedNodes: Node[] = [{
      ...selectedNodes[0],
      draggable: false,
      data: { ...selectedNodes[0].data, locked: true },
    }];
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText, readText: vi.fn() } });

    const { result } = renderHook(() =>
      useClipboard({
        nodesRef: { current: lockedNodes },
        edgesRef: { current: [] },
        selectedNodes: lockedNodes,
        selectedEdges: [],
        setNodes,
        setEdges,
        takeSnapshot,
        getOperationScope,
      })
    );

    act(() => result.current.handleCut());

    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(localStorage.getItem('flowchart-clipboard')).toBeNull();
  });

  it('cancels a pending paste when the active page or diagram scope changes', async () => {
    let currentScope = 'diagram-1:page-1';
    let resolveClipboard: ((text: string) => void) | undefined;
    const readText = vi.fn(() => new Promise<string>((resolve) => {
      resolveClipboard = resolve;
    }));
    Object.assign(navigator, { clipboard: { writeText: vi.fn(), readText } });

    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: [] },
      edgesRef: { current: [] },
      selectedNodes: [],
      selectedEdges: [],
      setNodes,
      setEdges,
      takeSnapshot,
      getOperationScope: () => currentScope,
    }));

    let pastePromise: Promise<'pasted' | 'empty' | 'scope-changed'> | undefined;
    act(() => {
      pastePromise = result.current.handlePaste();
    });
    expect(readText).toHaveBeenCalledTimes(1);

    currentScope = 'diagram-1:page-2';
    await act(async () => {
      resolveClipboard?.(JSON.stringify({ nodes: selectedNodes, edges: [] }));
      expect(await pastePromise).toBe('scope-changed');
    });

    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
  });
});
