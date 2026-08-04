// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';
import { useToastActions } from '../useToastActions';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createProps = (handlePaste: () => Promise<boolean>) => {
  const info = vi.fn();
  const warning = vi.fn();
  const nodesRef = { current: [] as Node[] };
  const edgesRef = { current: [] as Edge[] };

  return {
    info,
    warning,
    props: {
      messageApi: { info, warning } as unknown as MessageInstance,
      notificationApi: {} as NotificationInstance,
      handleDelete: vi.fn(),
      handleDuplicate: vi.fn(),
      handleCopy: vi.fn(),
      handlePaste,
      handleCut: vi.fn(),
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
    const { props, warning } = createProps(vi.fn().mockResolvedValue(false));
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

  it('explains why locked grouping and ungrouping transactions are blocked', () => {
    const { props, warning } = createProps(vi.fn().mockResolvedValue(false));
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
    const handlePaste = vi.fn().mockResolvedValue(true);
    const { info, props } = createProps(handlePaste);
    localStorage.clear();

    const { result } = renderHook(() => useToastActions(props));

    await act(async () => {
      await result.current.handlePasteWithToast();
    });

    expect(handlePaste).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });

  it('reports an empty clipboard only after both clipboard channels fail', async () => {
    const handlePaste = vi.fn().mockResolvedValue(false);
    const { info, props } = createProps(handlePaste);

    const { result } = renderHook(() => useToastActions(props));

    await act(async () => {
      await result.current.handlePasteWithToast();
    });

    expect(info).toHaveBeenCalledWith('designer.flowchart.toast.nothingToPaste');
  });
});
