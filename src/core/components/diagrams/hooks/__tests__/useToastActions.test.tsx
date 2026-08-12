// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';
import { useToastActions } from '../useToastActions';
import type { ClipboardCutResult, ClipboardPasteResult } from '../useClipboard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createProps = (
  handlePaste: () => Promise<ClipboardPasteResult>,
  handleCut: () => Promise<ClipboardCutResult> = vi.fn().mockResolvedValue('cut'),
) => {
  const info = vi.fn();
  const open = vi.fn();
  const destroy = vi.fn();
  const warning = vi.fn();
  const success = vi.fn();
  const nodesRef = { current: [] as Node[] };
  const edgesRef = { current: [] as Edge[] };

  return {
    info,
    open,
    destroy,
    warning,
    success,
    props: {
      messageApi: { destroy, info, open, warning, success } as unknown as MessageInstance,
      notificationApi: {} as NotificationInstance,
      handleDelete: vi.fn(),
      handleDuplicate: vi.fn(),
      handleCopy: vi.fn(),
      handlePaste,
      handleCut,
      handleGroup: vi.fn(),
      handleUngroup: vi.fn(),
      onContextMenuAction: vi.fn(),
      undo: vi.fn(),
      selectedNodes: [] as Node[],
      selectedEdges: [] as Edge[],
      nodesRef,
      edgesRef,
    },
  };
};

describe('useToastActions clipboard feedback', () => {
  it('explains why locked destructive actions are blocked', () => {
    const { props, warning } = createProps(vi.fn().mockResolvedValue('empty'));
    const lockedNode: Node = {
      id: 'locked',
      position: { x: 0, y: 0 },
      data: { locked: true },
      draggable: false,
    };
    props.selectedNodes = [lockedNode];
    props.nodesRef.current = [lockedNode];

    const { result } = renderHook(() => useToastActions(props));

    act(() => {
      result.current.handleCutWithToast();
      result.current.handleDeleteWithToast();
      result.current.handleDuplicateWithToast();
    });

    expect(warning).toHaveBeenCalledTimes(3);
    expect(props.handleCut).not.toHaveBeenCalled();
    expect(props.handleDelete).not.toHaveBeenCalled();
    expect(props.handleDuplicate).not.toHaveBeenCalled();
  });

  it('reports successful deletion with a keyboard-accessible undo action', () => {
    const { destroy, open, props } = createProps(vi.fn().mockResolvedValue('empty'));
    const nodes = [
      { id: 'node-1', position: { x: 0, y: 0 }, data: {} },
      { id: 'node-2', position: { x: 100, y: 0 }, data: {} },
    ] satisfies Node[];
    props.selectedNodes = nodes;
    props.nodesRef.current = nodes;
    const { result } = renderHook(() => useToastActions(props));

    act(() => result.current.handleDeleteWithToast());

    expect(props.handleDelete).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
    const messageConfig = open.mock.calls[0]?.[0];
    expect(messageConfig).toMatchObject({ type: 'success', duration: 3 });
    render(messageConfig.content);
    const undoButton = screen.getByRole('button', { name: 'designer.flowchart.undo.action' });

    fireEvent.click(undoButton);

    expect(props.undo).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledWith(messageConfig.key);
  });

  it('reports successful duplication with a keyboard-accessible undo action', () => {
    const { destroy, open, props } = createProps(vi.fn().mockResolvedValue('empty'));
    const selectedNode = { id: 'node-1', position: { x: 0, y: 0 }, data: {} } satisfies Node;
    props.selectedNodes = [selectedNode];
    props.nodesRef.current = [selectedNode];
    const { result } = renderHook(() => useToastActions(props));

    act(() => result.current.handleDuplicateWithToast());

    expect(props.handleDuplicate).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
    const messageConfig = open.mock.calls[0]?.[0];
    expect(messageConfig).toMatchObject({ type: 'success', duration: 3 });
    render(messageConfig.content);
    const undoButton = screen.getByRole('button', { name: 'designer.flowchart.undo.action' });

    fireEvent.click(undoButton);

    expect(props.undo).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledWith(messageConfig.key);
  });

  it('does not claim duplication succeeded for an invalid explicit target', () => {
    const { info, open, props } = createProps(vi.fn().mockResolvedValue('empty'));
    props.nodesRef.current = [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }];
    const { result } = renderHook(() => useToastActions(props));

    act(() => result.current.handleDuplicateWithToast('missing-node'));

    expect(props.handleDuplicate).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('designer.flowchart.toast.nothingToDuplicate');
  });

  it('explains why locked grouping and ungrouping transactions are blocked', () => {
    const { props, warning } = createProps(vi.fn().mockResolvedValue('empty'));
    const lockedNode: Node = {
      id: 'locked',
      position: { x: 0, y: 0 },
      data: { locked: true },
    };
    const peerNode: Node = {
      id: 'peer',
      position: { x: 100, y: 0 },
      data: {},
    };
    props.selectedNodes = [lockedNode, peerNode];
    props.nodesRef.current = [lockedNode, peerNode];
    const { result, rerender } = renderHook(() => useToastActions(props));

    act(() => result.current.handleGroupWithToast());

    const groupNode: Node = {
      id: 'group',
      type: 'titleGroup',
      position: { x: 0, y: 0 },
      data: {},
    };
    const lockedChild = { ...lockedNode, parentId: groupNode.id };
    props.selectedNodes = [groupNode];
    props.nodesRef.current = [groupNode, lockedChild];
    rerender();

    act(() => result.current.handleUngroupWithToast());

    expect(warning).toHaveBeenCalledTimes(2);
    expect(props.handleGroup).not.toHaveBeenCalled();
    expect(props.handleUngroup).not.toHaveBeenCalled();
  });

  it('delegates paste to the clipboard boundary even when local storage is empty', async () => {
    const handlePaste = vi.fn().mockResolvedValue('pasted');
    const { info, props } = createProps(handlePaste);
    localStorage.clear();

    const { result } = renderHook(() => useToastActions(props));

    await act(async () => {
      await result.current.handlePasteWithToast();
    });

    expect(handlePaste).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });

  it('passes an explicit context-menu group target to ungrouping', () => {
    const { props } = createProps(vi.fn().mockResolvedValue('empty'));
    const groupNode: Node = {
      id: 'group',
      type: 'titleGroup',
      position: { x: 0, y: 0 },
      data: {},
    };
    props.nodesRef.current = [groupNode];
    const { result } = renderHook(() => useToastActions(props));

    act(() => result.current.handleUngroupWithToast(groupNode.id));

    expect(props.handleUngroup).toHaveBeenCalledWith([groupNode.id]);
  });

  it('copies an unselected context-menu target instead of the stale selection', () => {
    const { props } = createProps(vi.fn().mockResolvedValue('empty'));
    props.selectedNodes = [{ id: 'stale', position: { x: 0, y: 0 }, data: {} }];
    props.nodesRef.current = [
      ...props.selectedNodes,
      { id: 'target', position: { x: 100, y: 0 }, data: {} },
    ];
    const { result } = renderHook(() => useToastActions(props));

    act(() => result.current.onContextMenuActionWithToast('copy', 'target'));

    expect(props.handleCopy).toHaveBeenCalledWith(['target']);
  });

  it('only reports edge-operation success when state actually changed', () => {
    const { props, success } = createProps(vi.fn().mockResolvedValue('empty'));
    props.onContextMenuAction = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { result } = renderHook(() => useToastActions(props));

    act(() => {
      result.current.onContextMenuActionWithToast('resetWaypoints', 'edge-1');
      result.current.onContextMenuActionWithToast('reverseEdge', 'edge-1');
    });

    expect(success).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith('designer.flowchart.toast.edgeReversed');
  });

  it('reports an empty clipboard only after both clipboard channels fail', async () => {
    const handlePaste = vi.fn().mockResolvedValue('empty');
    const { info, props } = createProps(handlePaste);

    const { result } = renderHook(() => useToastActions(props));

    await act(async () => {
      await result.current.handlePasteWithToast();
    });

    expect(info).toHaveBeenCalledWith('designer.flowchart.toast.nothingToPaste');
  });

  it('explains supported formats when system clipboard content cannot be pasted', async () => {
    const handlePaste = vi.fn().mockResolvedValue('unsupported');
    const { info, warning, props } = createProps(handlePaste);

    const { result } = renderHook(() => useToastActions(props));

    await act(async () => {
      await result.current.handlePasteWithToast();
    });

    expect(warning).toHaveBeenCalledWith('designer.flowchart.toast.unsupportedClipboard');
    expect(info).not.toHaveBeenCalled();
  });

  it('explains that a failed cut kept the selected nodes intact', async () => {
    const handleCut = vi.fn().mockResolvedValue('failed');
    const { props, warning } = createProps(vi.fn().mockResolvedValue('empty'), handleCut);
    props.selectedNodes = [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }];
    const { result } = renderHook(() => useToastActions(props));

    await act(async () => {
      await result.current.handleCutWithToast();
    });

    expect(warning).toHaveBeenCalledWith('designer.flowchart.toast.clipboardWriteFailed');
  });

  it('explains when a pending cut is cancelled by a page or diagram change', async () => {
    const handleCut = vi.fn().mockResolvedValue('scope-changed');
    const { props, warning } = createProps(vi.fn().mockResolvedValue('empty'), handleCut);
    props.selectedNodes = [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }];
    const { result } = renderHook(() => useToastActions(props));

    await act(async () => {
      await result.current.handleCutWithToast();
    });

    expect(warning).toHaveBeenCalledWith('designer.flowchart.toast.cutScopeChanged');
  });

  it('explains when a pending paste is cancelled by a page or diagram change', async () => {
    const handlePaste = vi.fn().mockResolvedValue('scope-changed');
    const { info, warning, props } = createProps(handlePaste);

    const { result } = renderHook(() => useToastActions(props));

    await act(async () => {
      await result.current.handlePasteWithToast();
    });

    expect(warning).toHaveBeenCalledWith('designer.flowchart.toast.pasteScopeChanged');
    expect(info).not.toHaveBeenCalled();
  });
});
