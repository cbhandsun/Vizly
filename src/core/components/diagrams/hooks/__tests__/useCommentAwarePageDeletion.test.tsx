// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommentThread } from '../../../../store/useDiagramStore';
import { useDiagramStore } from '../../../../store/useDiagramStore';
import { useCommentAwarePageDeletion } from '../useCommentAwarePageDeletion';

const comment = (id: string, pageId: string): CommentThread => ({
  id,
  pageId,
  x: 0,
  y: 0,
  authorId: 'user-1',
  authorName: 'User',
  authorColor: '#1677ff',
  content: id,
  createdAt: 1,
  isResolved: false,
  color: '#1677ff',
  replies: [],
});

describe('useCommentAwarePageDeletion', () => {
  beforeEach(() => {
    useDiagramStore.setState({
      comments: [],
      activeCommentId: null,
    });
  });

  it('removes only deleted-page comments and clears their active comment', () => {
    useDiagramStore.setState({
      comments: [comment('page-1-comment', 'page-1'), comment('page-2-comment', 'page-2')],
      activeCommentId: 'page-2-comment',
    });
    const deletePage = vi.fn(() => true);
    const { result } = renderHook(() => useCommentAwarePageDeletion(deletePage));

    let deleted = false;
    act(() => {
      deleted = result.current('page-2');
    });

    expect(deleted).toBe(true);
    expect(deletePage).toHaveBeenCalledWith('page-2');
    expect(useDiagramStore.getState().comments.map(item => item.id)).toEqual(['page-1-comment']);
    expect(useDiagramStore.getState().activeCommentId).toBeNull();
  });

  it('preserves comment state when page deletion is rejected', () => {
    const existing = comment('page-1-comment', 'page-1');
    useDiagramStore.setState({ comments: [existing], activeCommentId: existing.id });
    const { result } = renderHook(() => useCommentAwarePageDeletion(() => false));

    let deleted = true;
    act(() => {
      deleted = result.current('page-1');
    });

    expect(deleted).toBe(false);
    expect(useDiagramStore.getState().comments).toEqual([existing]);
    expect(useDiagramStore.getState().activeCommentId).toBe(existing.id);
  });
});
