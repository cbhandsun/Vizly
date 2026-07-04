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

  it('logs copy persistence and system clipboard write failures', async () => {
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
        nodes: selectedNodes,
        edges: selectedEdges,
        selectedNodes,
        selectedEdges,
        setNodes,
        setEdges,
        takeSnapshot,
      })
    );

    await act(async () => {
      result.current.handleCopy();
      await Promise.resolve();
    });

    expect(loggingState.logClipboardWriteFailure).toHaveBeenCalled();
    expect(loggingState.logClipboardSystemWriteFailure).not.toHaveBeenCalled();
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
        nodes: [],
        edges: [],
        selectedNodes: [],
        selectedEdges: [],
        setNodes,
        setEdges,
        takeSnapshot,
      })
    );

    await act(async () => {
      await result.current.handlePaste();
    });

    expect(loggingState.logClipboardReadFailure).toHaveBeenCalled();
    expect(takeSnapshot).toHaveBeenCalledWith([], []);
    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(setEdges).toHaveBeenCalledTimes(1);
  });
});
