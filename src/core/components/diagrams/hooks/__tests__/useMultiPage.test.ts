// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { useMultiPage } from '../useMultiPage';

const node = (id: string): Node => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
});

describe('useMultiPage', () => {
  it('switches history scope with the active page and ignores invalid page ids', () => {
    const currentNodes = [node('page-one-node')];
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const switchScope = vi.fn();
    const removeScope = vi.fn();
    const { result } = renderHook(() => useMultiPage(
      () => currentNodes,
      () => [],
      setNodes,
      setEdges,
      { switchScope, removeScope },
    ));

    expect(switchScope).toHaveBeenCalledWith('page-1');

    let newPageId = '';
    act(() => {
      newPageId = result.current.addPage();
    });

    expect(switchScope).toHaveBeenCalledWith(newPageId);
    expect(setNodes).toHaveBeenLastCalledWith([]);
    expect(result.current.activePageId).toBe(newPageId);

    switchScope.mockClear();
    setNodes.mockClear();
    act(() => result.current.switchPage('missing-page'));

    expect(switchScope).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(result.current.activePageId).toBe(newPageId);
  });

  it('removes a deleted page history scope and restores the remaining active page', () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const switchScope = vi.fn();
    const removeScope = vi.fn();
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      setNodes,
      setEdges,
      { switchScope, removeScope },
    ));

    let newPageId = '';
    act(() => {
      newPageId = result.current.addPage();
    });
    switchScope.mockClear();
    setNodes.mockClear();

    act(() => result.current.deletePage(newPageId));

    expect(removeScope).toHaveBeenCalledWith(newPageId);
    expect(switchScope).toHaveBeenCalledWith('page-1');
    expect(result.current.activePageId).toBe('page-1');
    expect(setNodes).toHaveBeenCalledWith([]);
  });

  it('restores a validated active page and exposes all pages for autosave', () => {
    const latestNodes = [node('latest-active-node')];
    const { result } = renderHook(() => useMultiPage(
      () => latestNodes,
      () => [],
      vi.fn(),
      vi.fn(),
    ));

    let restored: ReturnType<typeof result.current.restorePersistedMetadata> = null;
    act(() => {
      restored = result.current.restorePersistedMetadata({
        multiPage: {
          version: 1,
          activePageId: 'page-2',
          pages: [
            { id: 'page-1', name: 'Page 1', nodes: [node('preserved-node')], edges: [] },
            { id: 'page-2', name: 'Page 2', nodes: [], edges: [] },
          ],
        },
      });
    });

    expect(restored).toMatchObject({ id: 'page-2', nodes: [] });
    expect(result.current.activePageId).toBe('page-2');
    expect(result.current.pages[0]?.nodes[0]?.id).toBe('preserved-node');
    expect(result.current.getPersistedMetadata()).toMatchObject({
      multiPage: {
        activePageId: 'page-2',
        pages: [
          { id: 'page-1', nodes: [{ id: 'preserved-node' }] },
          { id: 'page-2', nodes: [{ id: 'latest-active-node' }] },
        ],
      },
    });
  });

  it('ignores invalid persisted metadata and bounds renamed page labels', () => {
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      vi.fn(),
      vi.fn(),
    ));

    act(() => {
      expect(result.current.restorePersistedMetadata({ multiPage: { pages: [] } })).toBeNull();
      result.current.renamePage('page-1', `  ${'x'.repeat(100)}  `);
    });

    expect(result.current.activePageId).toBe('page-1');
    expect(result.current.pages[0]?.name).toHaveLength(80);
  });
});
