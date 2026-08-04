// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { createMultiPageHistoryScopeKey, useMultiPage } from '../useMultiPage';

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

    let newPageId: string | null = null;
    act(() => {
      newPageId = result.current.addPage();
    });
    if (!newPageId) throw new Error('Expected a page to be created');

    expect(switchScope).toHaveBeenCalledWith(newPageId);
    expect(setNodes).toHaveBeenLastCalledWith([]);
    expect(result.current.activePageId).toBe(newPageId);
    expect(result.current.getPageOperationScope()).toBe(`${newPageId}:1`);

    switchScope.mockClear();
    setNodes.mockClear();
    act(() => result.current.switchPage('missing-page'));

    expect(switchScope).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
    expect(result.current.activePageId).toBe(newPageId);
    expect(result.current.getPageOperationScope()).toBe(`${newPageId}:1`);
  });

  it('isolates same-named page histories by diagram and activates the scope before replacing the canvas', () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const switchScope = vi.fn();
    const removeScope = vi.fn();
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      setNodes,
      setEdges,
      { switchScope, removeScope, scopeId: 'diagram::alpha' },
    ));

    expect(switchScope).toHaveBeenCalledWith(
      createMultiPageHistoryScopeKey('diagram::alpha', 'page-1'),
    );

    switchScope.mockClear();
    let newPageId: string | null = null;
    act(() => {
      newPageId = result.current.addPage();
    });
    if (!newPageId) throw new Error('Expected a page to be created');
    const createdPageId = newPageId;

    expect(switchScope).toHaveBeenCalledWith(
      createMultiPageHistoryScopeKey('diagram::alpha', createdPageId),
    );
    expect(switchScope.mock.invocationCallOrder.at(0)).toBeLessThan(
      setNodes.mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY,
    );
    expect(createMultiPageHistoryScopeKey('diagram::alpha', 'page-1')).not.toBe(
      createMultiPageHistoryScopeKey('diagram::beta', 'page-1'),
    );

    act(() => {
      result.current.deletePage(createdPageId);
    });
    expect(removeScope).toHaveBeenCalledWith(
      createMultiPageHistoryScopeKey('diagram::alpha', createdPageId),
    );
  });

  it('updates the active page scope synchronously for pending async operations', () => {
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      vi.fn(),
      vi.fn(),
    ));

    expect(result.current.getPageOperationScope()).toBe('page-1:0');

    let secondPageId: string | null = null;
    let pageIdDuringAdd = '';
    act(() => {
      secondPageId = result.current.addPage();
      pageIdDuringAdd = result.current.getPageOperationScope();
    });
    if (!secondPageId) throw new Error('Expected a page to be created');
    const createdSecondPageId = secondPageId;
    expect(pageIdDuringAdd).toBe(`${createdSecondPageId}:1`);

    let pageIdDuringSwitch = '';
    act(() => {
      result.current.switchPage('page-1');
      pageIdDuringSwitch = result.current.getPageOperationScope();
    });
    expect(pageIdDuringSwitch).toBe('page-1:2');

    let pageIdAfterRoundTrip = '';
    act(() => {
      result.current.switchPage(createdSecondPageId);
      pageIdAfterRoundTrip = result.current.getPageOperationScope();
    });
    expect(pageIdAfterRoundTrip).toBe(`${createdSecondPageId}:3`);
    expect(pageIdAfterRoundTrip).not.toBe(pageIdDuringAdd);

    let pageIdDuringRestore = '';
    act(() => {
      result.current.restorePersistedMetadata({
        multiPage: {
          version: 1,
          activePageId: 'restored-page',
          pages: [{ id: 'restored-page', name: '恢复页', nodes: [], edges: [] }],
        },
      });
      pageIdDuringRestore = result.current.getPageOperationScope();
    });
    expect(pageIdDuringRestore).toBe('restored-page:4');
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

    let newPageId: string | null = null;
    act(() => {
      newPageId = result.current.addPage();
    });
    if (!newPageId) throw new Error('Expected a page to be created');
    const createdPageId = newPageId;
    switchScope.mockClear();
    setNodes.mockClear();

    act(() => result.current.deletePage(createdPageId));

    expect(removeScope).toHaveBeenCalledWith(createdPageId);
    expect(switchScope).toHaveBeenCalledWith('page-1');
    expect(result.current.activePageId).toBe('page-1');
    expect(setNodes).toHaveBeenCalledWith([]);
  });

  it('keeps deletion context by selecting the adjacent page and ignores missing ids', () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const removeScope = vi.fn();
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      setNodes,
      setEdges,
      { switchScope: vi.fn(), removeScope },
    ));

    act(() => {
      result.current.restorePersistedMetadata({
        multiPage: {
          version: 1,
          activePageId: 'page-3',
          pages: [
            { id: 'page-1', name: '页面 1', nodes: [node('page-1-node')], edges: [] },
            { id: 'page-2', name: '页面 2', nodes: [node('page-2-node')], edges: [] },
            { id: 'page-3', name: '页面 3', nodes: [node('page-3-node')], edges: [] },
          ],
        },
      });
    });

    let deleted = false;
    act(() => {
      deleted = result.current.deletePage('page-3');
    });

    expect(deleted).toBe(true);
    expect(result.current.activePageId).toBe('page-2');
    expect(setNodes).toHaveBeenLastCalledWith([node('page-2-node')]);
    expect(removeScope).toHaveBeenCalledWith('page-3');

    removeScope.mockClear();
    act(() => {
      deleted = result.current.deletePage('missing-page');
    });
    expect(deleted).toBe(false);
    expect(result.current.pages.map(page => page.id)).toEqual(['page-1', 'page-2']);
    expect(removeScope).not.toHaveBeenCalled();
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

  it('rejects duplicate page names after trimming and Unicode normalization', () => {
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      vi.fn(),
      vi.fn(),
    ));

    let secondPageId: string | null = null;
    act(() => {
      secondPageId = result.current.addPage();
    });
    if (!secondPageId) throw new Error('Expected a page to be created');
    const createdPageId = secondPageId;

    let renamed = true;
    act(() => {
      renamed = result.current.renamePage(createdPageId, '  页面 1  ');
    });

    expect(renamed).toBe(false);
    expect(result.current.pages.map(page => page.name)).toEqual(['页面 1', '页面 2']);
  });

  it('keeps generated page names unique after deletion', () => {
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      vi.fn(),
      vi.fn(),
    ));

    act(() => {
      result.current.addPage();
      result.current.deletePage('page-1');
      result.current.addPage();
    });

    expect(result.current.pages.map(page => page.name)).toEqual(['页面 2', '页面 1']);
    expect(new Set(result.current.pages.map(page => page.id)).size).toBe(2);
  });

  it('refuses to create pages beyond the persisted 50-page boundary', () => {
    const getCurrentNodes = vi.fn(() => []);
    const { result } = renderHook(() => useMultiPage(
      getCurrentNodes,
      () => [],
      vi.fn(),
      vi.fn(),
    ));
    const pages = Array.from({ length: 50 }, (_, index) => ({
      id: `page-${index + 1}`,
      name: `页面 ${index + 1}`,
      nodes: [],
      edges: [],
    }));

    act(() => {
      result.current.restorePersistedMetadata({
        multiPage: { version: 1, activePageId: 'page-50', pages },
      });
    });
    getCurrentNodes.mockClear();

    let createdPageId: string | null = 'unexpected';
    act(() => {
      createdPageId = result.current.addPage();
    });

    expect(createdPageId).toBeNull();
    expect(result.current.pages).toHaveLength(50);
    expect(getCurrentNodes).not.toHaveBeenCalled();
  });

  it('clears stale node and edge selections only when the active page content changes', () => {
    let currentNodes: Node[] = [{ ...node('selected-node'), selected: true }];
    let currentEdges: Edge[] = [{
      id: 'selected-edge',
      source: 'selected-node',
      target: 'peer-node',
      selected: true,
    }];
    const setNodes = vi.fn((nodes: Node[]) => {
      currentNodes = nodes;
    });
    const setEdges = vi.fn((edges: Edge[]) => {
      currentEdges = edges;
    });
    const clearSelection = vi.fn();
    const { result } = renderHook(() => useMultiPage(
      () => currentNodes,
      () => currentEdges,
      setNodes,
      setEdges,
      {
        switchScope: vi.fn(),
        removeScope: vi.fn(),
        clearSelection,
      },
    ));

    let secondPageId: string | null = null;
    act(() => {
      secondPageId = result.current.addPage();
    });
    if (!secondPageId) throw new Error('Expected a page to be created');
    const createdPageId = secondPageId;

    expect(clearSelection).toHaveBeenCalledTimes(1);

    act(() => result.current.switchPage('page-1'));
    expect(clearSelection).toHaveBeenCalledTimes(2);
    expect(setNodes).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'selected-node', selected: false }),
    ]);
    expect(setEdges).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'selected-edge', selected: false }),
    ]);

    act(() => result.current.deletePage(createdPageId));
    expect(clearSelection).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.restorePersistedMetadata({
        multiPage: {
          version: 1,
          activePageId: 'page-3',
          pages: [{
            id: 'page-3',
            name: '页面 3',
            nodes: [{ ...node('restored-node'), selected: true }],
            edges: [{
              id: 'restored-edge',
              source: 'restored-node',
              target: 'restored-peer',
              selected: true,
            }],
          }],
        },
      });
    });
    expect(result.current.pages[0]?.nodes[0]?.selected).toBe(false);
    expect(result.current.pages[0]?.edges[0]?.selected).not.toBe(true);
    expect(clearSelection).toHaveBeenCalledTimes(3);

    act(() => {
      result.current.switchPage('page-3');
      result.current.switchPage('missing-page');
      result.current.deletePage('missing-page');
    });
    expect(clearSelection).toHaveBeenCalledTimes(3);
  });
});
