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
  const nodesRef = { current: [] as Node[] };
  const edgesRef = { current: [] as Edge[] };

  return {
    info,
    props: {
      messageApi: { info } as unknown as MessageInstance,
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
