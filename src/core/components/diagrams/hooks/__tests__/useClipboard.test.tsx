// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { SetStateAction } from 'react';
import { useClipboard } from '../useClipboard';
import { SYSTEM_CLIPBOARD_READ_TIMEOUT_MS } from '../clipboardReadBoundary';

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
    document.body.innerHTML = '';
    vi.useRealTimers();
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

  it('copies an explicit context-menu target instead of a stale selection', async () => {
    const staleSelection = selectedNodes;
    const contextTarget: Node = {
      id: 'context-target',
      position: { x: 200, y: 300 },
      data: { label: 'Context target' },
    };
    Object.assign(navigator, { clipboard: undefined });

    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: [...staleSelection, contextTarget] },
      edgesRef: { current: [] },
      selectedNodes: staleSelection,
      selectedEdges: [],
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      takeSnapshot: vi.fn(),
      getOperationScope,
    }));

    act(() => result.current.handleCopy([contextTarget.id]));

    expect(JSON.parse(localStorage.getItem('flowchart-clipboard') ?? '{}')).toMatchObject({
      nodes: [{ id: contextTarget.id }],
      edges: [],
    });
  });

  it('logs system clipboard read failure and falls back to local storage paste', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const getPasteHistoryLabel = vi.fn(({ nodes, edges }: { nodes: number; edges: number }) => (
      `Before paste — Nodes ${nodes}, connectors ${edges}`
    ));
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
        getPasteHistoryLabel,
      })
    );

    let pasteResult = 'empty';
    await act(async () => {
      pasteResult = await result.current.handlePaste();
    });

    expect(pasteResult).toBe('pasted');
    expect(loggingState.logClipboardReadFailure).toHaveBeenCalled();
    expect(getPasteHistoryLabel).toHaveBeenCalledWith({ nodes: 1, edges: 0 });
    expect(takeSnapshot).toHaveBeenCalledWith(
      [],
      [],
      'Before paste — Nodes 1, connectors 0',
    );
    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(setEdges).toHaveBeenCalledTimes(1);
  });

  it('focuses the newly pasted node after its selected tree item renders', async () => {
    let currentNodes: Node[] = [];
    const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
      currentNodes = typeof update === 'function' ? update(currentNodes) : update;
    });
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
        readText: vi.fn().mockResolvedValue(JSON.stringify({ nodes: selectedNodes, edges: [] })),
      },
    });

    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: [] },
      edgesRef: { current: [] },
      selectedNodes: [],
      selectedEdges: [],
      setNodes,
      setEdges: vi.fn(),
      takeSnapshot: vi.fn(),
      getOperationScope,
    }));

    await act(async () => {
      expect(await result.current.handlePaste()).toBe('pasted');
    });

    const pastedNode = currentNodes[0];
    expect(pastedNode?.selected).toBe(true);
    document.body.innerHTML = `
      <div class="react-flow__node" data-id="${pastedNode?.id}">
        <div id="pasted-focus" role="treeitem" aria-selected="true" tabindex="0"></div>
      </div>
    `;
    frames.shift()?.(0);

    expect(document.activeElement?.id).toBe('pasted-focus');
  });

  it('cascades repeated pastes of the same clipboard payload', async () => {
    let currentNodes: Node[] = [];
    const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
      currentNodes = typeof update === 'function' ? update(currentNodes) : update;
    });
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const frames: FrameRequestCallback[] = [];
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame');
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    const clipboardText = JSON.stringify({ nodes: selectedNodes, edges: [] });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(), readText: vi.fn().mockResolvedValue(clipboardText) },
    });

    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: [] },
      edgesRef: { current: [] },
      selectedNodes: [],
      selectedEdges: [],
      setNodes,
      setEdges,
      takeSnapshot,
      getOperationScope,
    }));

    await act(async () => {
      expect(await result.current.handlePaste()).toBe('pasted');
      expect(await result.current.handlePaste()).toBe('pasted');
    });

    expect(currentNodes).toHaveLength(2);
    expect(currentNodes.map(item => item.position)).toEqual([
      { x: 42, y: 52 },
      { x: 74, y: 84 },
    ]);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);

    const [firstPaste, latestPaste] = currentNodes;
    document.body.innerHTML = `
      <div class="react-flow__node" data-id="${firstPaste?.id}">
        <div id="first-paste" role="treeitem" aria-selected="false" tabindex="-1"></div>
      </div>
      <div class="react-flow__node" data-id="${latestPaste?.id}">
        <div id="latest-paste" role="treeitem" aria-selected="true" tabindex="0"></div>
      </div>
    `;
    frames[0]?.(0);
    frames[1]?.(16);

    expect(document.activeElement?.id).toBe('latest-paste');
  });

  it('does not replace unsupported system clipboard text with stale local content', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const readText = vi.fn().mockResolvedValue('not a diagram');
    Object.assign(navigator, { clipboard: { writeText: vi.fn(), readText } });

    localStorage.setItem('flowchart-clipboard', JSON.stringify({
      nodes: selectedNodes,
      edges: selectedEdges,
    }));
    const storageRead = vi.spyOn(Storage.prototype, 'getItem');

    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: [] },
      edgesRef: { current: [] },
      selectedNodes: [],
      selectedEdges: [],
      setNodes,
      setEdges,
      takeSnapshot,
      getOperationScope,
    }));

    let pasteResult: 'pasted' | 'empty' | 'unsupported' | 'scope-changed' = 'empty';
    await act(async () => {
      pasteResult = await result.current.handlePaste();
    });

    expect(pasteResult).toBe('unsupported');
    expect(storageRead).not.toHaveBeenCalled();
    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
  });

  it('does not paste stale local content when the system clipboard is empty', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(), readText: vi.fn().mockResolvedValue('') },
    });
    localStorage.setItem('flowchart-clipboard', JSON.stringify({
      nodes: selectedNodes,
      edges: selectedEdges,
    }));

    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: [] },
      edgesRef: { current: [] },
      selectedNodes: [],
      selectedEdges: [],
      setNodes,
      setEdges,
      takeSnapshot,
      getOperationScope,
    }));

    await expect(result.current.handlePaste()).resolves.toBe('empty');
    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
  });

  it('falls back to the internal clipboard when the system read never settles', async () => {
    vi.useFakeTimers();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const readText = vi.fn(() => new Promise<string>(() => undefined));
    Object.assign(navigator, { clipboard: { writeText: vi.fn(), readText } });
    localStorage.setItem('flowchart-clipboard', JSON.stringify({
      nodes: selectedNodes,
      edges: selectedEdges,
    }));

    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: [] },
      edgesRef: { current: [] },
      selectedNodes: [],
      selectedEdges: [],
      setNodes,
      setEdges,
      takeSnapshot,
      getOperationScope,
    }));

    const pastePromise = result.current.handlePaste();
    await vi.advanceTimersByTimeAsync(SYSTEM_CLIPBOARD_READ_TIMEOUT_MS);

    await expect(pastePromise).resolves.toBe('pasted');
    expect(takeSnapshot).toHaveBeenCalledOnce();
    expect(setNodes).toHaveBeenCalledOnce();
    expect(setEdges).toHaveBeenCalledOnce();
  });

  it('reports an empty paste when a timed-out system read has no internal fallback', async () => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
        readText: vi.fn(() => new Promise<string>(() => undefined)),
      },
    });

    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: [] },
      edgesRef: { current: [] },
      selectedNodes: [],
      selectedEdges: [],
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      takeSnapshot: vi.fn(),
      getOperationScope,
    }));

    const pastePromise = result.current.handlePaste();
    await vi.advanceTimersByTimeAsync(SYSTEM_CLIPBOARD_READ_TIMEOUT_MS);

    await expect(pastePromise).resolves.toBe('empty');
  });

  it('does not delete an edge-only selection because it has no pasteable payload', async () => {
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

    await expect(result.current.handleCut()).resolves.toBe('empty');

    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(localStorage.getItem('flowchart-clipboard')).toBeNull();
  });

  it('does not cut a locked node or write it to either clipboard channel', async () => {
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

    await expect(result.current.handleCut()).resolves.toBe('locked');

    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(localStorage.getItem('flowchart-clipboard')).toBeNull();
  });

  it('preserves selected nodes when both clipboard channels reject a cut', async () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'));
    Object.assign(navigator, { clipboard: { writeText, readText: vi.fn() } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });

    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: selectedNodes },
      edgesRef: { current: [] },
      selectedNodes,
      selectedEdges: [],
      setNodes,
      setEdges,
      takeSnapshot,
      getOperationScope,
    }));

    await expect(result.current.handleCut()).resolves.toBe('failed');

    expect(writeText).toHaveBeenCalledOnce();
    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
  });

  it('cuts after the system clipboard succeeds when local persistence is unavailable', async () => {
    const nodesRef = { current: selectedNodes };
    const edgesRef = { current: [] as Edge[] };
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn() },
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });

    const { result } = renderHook(() => useClipboard({
      nodesRef,
      edgesRef,
      selectedNodes,
      selectedEdges: [],
      setNodes,
      setEdges,
      takeSnapshot,
      getOperationScope,
    }));

    await expect(result.current.handleCut()).resolves.toBe('cut');

    expect(takeSnapshot).toHaveBeenCalledWith(selectedNodes, []);
    expect(nodesRef.current).toEqual([]);
    expect(setNodes).toHaveBeenCalledWith([]);
    expect(setEdges).toHaveBeenCalledWith([]);
  });

  it('selects and focuses the nearest survivor after cutting a selected node', async () => {
    const survivor: Node = {
      id: 'survivor',
      position: { x: 25, y: 20 },
      data: { label: 'Survivor' },
      selected: false,
    };
    const nodesRef = { current: [...selectedNodes, survivor] };
    const edgesRef = { current: [] as Edge[] };
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn() },
    });

    const { result } = renderHook(() => useClipboard({
      nodesRef,
      edgesRef,
      selectedNodes,
      selectedEdges: [],
      setNodes,
      setEdges,
      takeSnapshot: vi.fn(),
      getOperationScope,
    }));

    await expect(result.current.handleCut()).resolves.toBe('cut');
    expect(nodesRef.current).toEqual([{ ...survivor, selected: true }]);

    document.body.innerHTML = `
      <div class="react-flow__node selected" data-id="survivor">
        <div id="survivor-focus" role="treeitem" aria-selected="true" tabindex="0"></div>
      </div>
    `;
    frames.shift()?.(0);
    expect(document.activeElement?.id).toBe('survivor-focus');
  });

  it('focuses the empty-state primary action after cutting the final node', async () => {
    const nodesRef = { current: selectedNodes };
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn() },
    });

    const { result } = renderHook(() => useClipboard({
      nodesRef,
      edgesRef: { current: [] },
      selectedNodes,
      selectedEdges: [],
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      takeSnapshot: vi.fn(),
      getOperationScope,
    }));

    await expect(result.current.handleCut()).resolves.toBe('cut');
    document.body.innerHTML = '<button class="flowchart-empty-action">Choose first shape</button>';
    frames.shift()?.(0);
    expect(document.activeElement).toBe(document.querySelector('.flowchart-empty-action'));
  });

  it('cancels a pending cut when the active page or diagram scope changes', async () => {
    let currentScope = 'diagram-1:page-1';
    let resolveWrite: (() => void) | undefined;
    const writeText = vi.fn(() => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));
    Object.assign(navigator, { clipboard: { writeText, readText: vi.fn() } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const takeSnapshot = vi.fn();
    const { result } = renderHook(() => useClipboard({
      nodesRef: { current: selectedNodes },
      edgesRef: { current: [] },
      selectedNodes,
      selectedEdges: [],
      setNodes,
      setEdges,
      takeSnapshot,
      getOperationScope: () => currentScope,
    }));

    const cutPromise = result.current.handleCut();
    currentScope = 'diagram-1:page-2';
    resolveWrite?.();

    await expect(cutPromise).resolves.toBe('scope-changed');
    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
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
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame');
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

    let pastePromise: Promise<'pasted' | 'empty' | 'unsupported' | 'scope-changed'> | undefined;
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
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
