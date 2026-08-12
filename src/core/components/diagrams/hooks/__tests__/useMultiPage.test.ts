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
  it('captures plugin-owned canvas data before replacing the active page', () => {
    let capturedNodes = [node('live-page-one')];
    const captureCurrentState = vi.fn(() => ({ nodes: capturedNodes, edges: [] as Edge[] }));
    const { result } = renderHook(() => useMultiPage(
      () => [node('stale-react-flow-state')],
      () => [],
      vi.fn(),
      vi.fn(),
      {
        switchScope: vi.fn(),
        removeScope: vi.fn(),
        captureCurrentState,
      },
    ));

    act(() => {
      result.current.addPage();
    });

    expect(captureCurrentState).toHaveBeenCalledTimes(1);
    expect(result.current.pages.find(page => page.id === 'page-1')?.nodes).toEqual([
      node('live-page-one'),
    ]);

    capturedNodes = [node('live-page-two')];
    const persisted = result.current.getPersistedMetadata();
    expect(persisted?.multiPage.pages.find(page => page.id === result.current.activePageId)?.nodes).toEqual([
      node('live-page-two'),
    ]);
  });

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

  it('preserves each page canvas across consecutive switches before React rerenders', () => {
    let liveNodes = [node('page-one-live')];
    const setNodes = vi.fn((nodes: Node[]) => {
      liveNodes = nodes;
    });
    const { result } = renderHook(() => useMultiPage(
      () => liveNodes,
      () => [],
      setNodes,
      vi.fn(),
    ));

    act(() => {
      result.current.restorePersistedMetadata({
        multiPage: {
          version: 1,
          activePageId: 'page-1',
          pages: [
            { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
            { id: 'page-2', name: '页面 2', nodes: [node('page-two')], edges: [] },
            { id: 'page-3', name: '页面 3', nodes: [node('page-three')], edges: [] },
          ],
        },
      });
      liveNodes = [node('page-one-live')];
    });

    act(() => {
      result.current.switchPage('page-2');
      result.current.switchPage('page-3');
    });

    expect(result.current.activePageId).toBe('page-3');
    expect(result.current.pages.find(page => page.id === 'page-1')?.nodes).toEqual([
      node('page-one-live'),
    ]);
    expect(result.current.pages.find(page => page.id === 'page-2')?.nodes).toEqual([
      node('page-two'),
    ]);
    expect(liveNodes).toEqual([node('page-three')]);
  });

  it('does not overwrite the previous page when pages are added consecutively', () => {
    let liveNodes = [node('original-page-content')];
    const setNodes = vi.fn((nodes: Node[]) => {
      liveNodes = nodes;
    });
    const { result } = renderHook(() => useMultiPage(
      () => liveNodes,
      () => [],
      setNodes,
      vi.fn(),
    ));

    act(() => {
      result.current.addPage();
      result.current.addPage();
    });

    expect(result.current.pages).toHaveLength(3);
    expect(result.current.pages.find(page => page.id === 'page-1')?.nodes).toEqual([
      node('original-page-content'),
    ]);
    expect(result.current.pages[1]?.nodes).toEqual([]);
    expect(result.current.activePageId).toBe(result.current.pages[2]?.id);
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

  it('clears old and restored page history scopes before activating restored content', () => {
    const switchScope = vi.fn();
    const removeScope = vi.fn();
    const removeScopes = vi.fn();
    const { result } = renderHook(() => useMultiPage(
      () => [node('old-live-node')],
      () => [],
      vi.fn(),
      vi.fn(),
      {
        switchScope,
        removeScope,
        removeScopes,
        scopeId: 'diagram::restore',
      },
    ));
    switchScope.mockClear();

    act(() => {
      result.current.restorePersistedMetadata({
        multiPage: {
          version: 1,
          activePageId: 'page-2',
          pages: [
            { id: 'page-1', name: '页面 1', nodes: [node('restored-one')], edges: [] },
            { id: 'page-2', name: '页面 2', nodes: [node('restored-two')], edges: [] },
          ],
        },
      });
    });

    expect(removeScopes).toHaveBeenCalledWith([
      createMultiPageHistoryScopeKey('diagram::restore', 'page-1'),
      createMultiPageHistoryScopeKey('diagram::restore', 'page-2'),
    ]);
    expect(removeScope).not.toHaveBeenCalled();
    expect(removeScopes.mock.invocationCallOrder[0]).toBeLessThan(
      switchScope.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(switchScope).toHaveBeenCalledWith(
      createMultiPageHistoryScopeKey('diagram::restore', 'page-2'),
    );
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

  it('creates localized default page names', () => {
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      vi.fn(),
      vi.fn(),
      undefined,
      index => `Page ${index}`,
    ));

    act(() => {
      result.current.addPage();
    });

    expect(result.current.pages.map(page => page.name)).toEqual(['Page 1', 'Page 2']);
  });

  it('does not reuse a default page index written in another supported locale', () => {
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      vi.fn(),
      vi.fn(),
      undefined,
      index => `Page ${index}`,
    ));

    act(() => {
      result.current.restorePersistedMetadata({
        multiPage: {
          version: 1,
          activePageId: 'legacy-page',
          pages: [{ id: 'legacy-page', name: '页面 1', nodes: [], edges: [] }],
        },
      });
      result.current.addPage();
    });

    expect(result.current.pages.map(page => page.name)).toEqual(['页面 1', 'Page 2']);
  });

  it('restores the latest deleted page at its original index from the live canvas snapshot', () => {
    let currentNodes: Node[] = [node('page-one-live')];
    let currentEdges: Edge[] = [];
    const setNodes = vi.fn((nodes: Node[]) => {
      currentNodes = nodes;
    });
    const setEdges = vi.fn((edges: Edge[]) => {
      currentEdges = edges;
    });
    const switchScope = vi.fn();
    const removeScope = vi.fn();
    const clearSelection = vi.fn();
    const { result } = renderHook(() => useMultiPage(
      () => currentNodes,
      () => currentEdges,
      setNodes,
      setEdges,
      { switchScope, removeScope, clearSelection },
      index => `Page ${index}`,
    ));

    let pageTwoId: string | null = null;
    act(() => {
      pageTwoId = result.current.addPage();
    });
    if (!pageTwoId) throw new Error('Expected a second page');
    const deletedPageId = pageTwoId;
    currentNodes = [{ ...node('deleted-live-node'), selected: true }];
    currentEdges = [{
      id: 'deleted-live-edge',
      source: 'deleted-live-node',
      target: 'peer-node',
      selected: true,
    }];

    act(() => {
      expect(result.current.deletePage(deletedPageId)).toBe(true);
    });
    expect(result.current.canRestoreDeletedPage).toBe(true);
    expect(result.current.restorableDeletedPageName).toBe('Page 2');
    expect(removeScope).toHaveBeenCalledWith(deletedPageId);

    currentNodes = [node('adjacent-page-latest')];
    currentEdges = [];
    let restoredPageId: string | null = null;
    act(() => {
      restoredPageId = result.current.restoreDeletedPage();
    });

    expect(restoredPageId).toBe(deletedPageId);
    expect(result.current.pages.map(page => page.id)).toEqual(['page-1', deletedPageId]);
    expect(result.current.pages[0]?.nodes).toEqual([node('adjacent-page-latest')]);
    expect(result.current.pages[1]?.nodes).toEqual([
      expect.objectContaining({ id: 'deleted-live-node', selected: false }),
    ]);
    expect(result.current.pages[1]?.edges).toEqual([
      expect.objectContaining({ id: 'deleted-live-edge', selected: false }),
    ]);
    expect(result.current.activePageId).toBe(deletedPageId);
    expect(result.current.canRestoreDeletedPage).toBe(false);
    expect(result.current.restorableDeletedPageName).toBeNull();
    expect(switchScope).toHaveBeenLastCalledWith(deletedPageId);
    expect(clearSelection).toHaveBeenCalled();
    expect(result.current.restoreDeletedPage()).toBeNull();
  });

  it('discards a newly created page without overwriting the latest deleted-page recovery', () => {
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      vi.fn(),
      vi.fn(),
    ));

    let deletedPageId = '';
    act(() => {
      deletedPageId = result.current.addPage() ?? '';
      expect(result.current.deletePage(deletedPageId)).toBe(true);
    });
    expect(result.current.canRestoreDeletedPage).toBe(true);

    let temporaryPageId = '';
    act(() => {
      temporaryPageId = result.current.addPage() ?? '';
    });
    act(() => {
      expect(result.current.discardPage(temporaryPageId)).toBe(true);
    });

    expect(result.current.canRestoreDeletedPage).toBe(true);
    expect(result.current.restorableDeletedPageName).toBe('页面 2');
    let restoredPageId: string | null = null;
    act(() => {
      restoredPageId = result.current.restoreDeletedPage();
    });
    expect(restoredPageId).toBe(deletedPageId);
    expect(result.current.pages.map((page) => page.id)).toContain(deletedPageId);
    expect(result.current.pages.map((page) => page.id)).not.toContain(temporaryPageId);
  });

  it('invalidates transient page recovery after persisted metadata is restored', () => {
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      vi.fn(),
      vi.fn(),
    ));

    act(() => {
      result.current.addPage();
      result.current.deletePage('page-1');
    });
    expect(result.current.canRestoreDeletedPage).toBe(true);
    expect(result.current.restorableDeletedPageName).toBe('页面 1');

    act(() => {
      result.current.restorePersistedMetadata({
        multiPage: {
          version: 1,
          activePageId: 'persisted-page',
          pages: [{ id: 'persisted-page', name: 'Persisted', nodes: [], edges: [] }],
        },
      });
    });

    expect(result.current.canRestoreDeletedPage).toBe(false);
    expect(result.current.restorableDeletedPageName).toBeNull();
    expect(result.current.restoreDeletedPage()).toBeNull();
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

  it('duplicates the live page after its source with isolated graph ids and data', () => {
    let currentNodes: Node[] = [
      {
        ...node('parent'),
        selected: true,
        data: { settings: { color: 'red' } },
      },
      {
        ...node('child'),
        parentId: 'parent',
        extent: 'parent',
        selected: true,
      },
    ];
    let currentEdges: Edge[] = [{
      id: 'edge-1',
      source: 'parent',
      target: 'child',
      selected: true,
      data: { route: { kind: 'direct' } },
    }];
    const setNodes = vi.fn((nodes: Node[]) => {
      currentNodes = nodes;
    });
    const setEdges = vi.fn((edges: Edge[]) => {
      currentEdges = edges;
    });
    const switchScope = vi.fn();
    const { result } = renderHook(() => useMultiPage(
      () => currentNodes,
      () => currentEdges,
      setNodes,
      setEdges,
      { switchScope, removeScope: vi.fn() },
    ));

    let duplicateId: string | null = null;
    act(() => {
      duplicateId = result.current.duplicatePage('page-1', '页面 1');
    });
    if (!duplicateId) throw new Error('Expected a page copy to be created');

    expect(result.current.pages.map(page => page.id)).toEqual(['page-1', duplicateId]);
    expect(result.current.pages[1]?.name).toBe('页面 1 (2)');
    expect(result.current.activePageId).toBe(duplicateId);
    expect(switchScope).toHaveBeenLastCalledWith(duplicateId);

    const originalPage = result.current.pages[0];
    const copiedPage = result.current.pages[1];
    if (!originalPage || !copiedPage) throw new Error('Expected source and copied pages');
    const copiedParent = copiedPage.nodes[0];
    const copiedChild = copiedPage.nodes[1];
    const copiedEdge = copiedPage.edges[0];
    if (!copiedParent || !copiedChild || !copiedEdge) throw new Error('Expected copied graph');

    expect(copiedParent.id).not.toBe('parent');
    expect(copiedChild.id).not.toBe('child');
    expect(copiedChild.parentId).toBe(copiedParent.id);
    expect(copiedEdge.source).toBe(copiedParent.id);
    expect(copiedEdge.target).toBe(copiedChild.id);
    expect(copiedParent.selected).toBe(false);
    expect(copiedEdge.selected).toBe(false);
    expect(copiedParent.data).not.toBe(originalPage.nodes[0]?.data);
    expect(copiedParent.data.settings).not.toBe(originalPage.nodes[0]?.data.settings);
  });

  it('reorders pages within bounds without replacing the active canvas', () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const { result } = renderHook(() => useMultiPage(
      () => [],
      () => [],
      setNodes,
      setEdges,
    ));

    act(() => {
      result.current.restorePersistedMetadata({
        multiPage: {
          version: 1,
          activePageId: 'page-2',
          pages: [
            { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
            { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
            { id: 'page-3', name: '页面 3', nodes: [], edges: [] },
          ],
        },
      });
    });
    setNodes.mockClear();
    setEdges.mockClear();

    let moved = false;
    act(() => {
      moved = result.current.movePage('page-2', 'left');
    });
    expect(moved).toBe(true);
    expect(result.current.pages.map(page => page.id)).toEqual(['page-2', 'page-1', 'page-3']);
    expect(result.current.activePageId).toBe('page-2');
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();

    act(() => {
      expect(result.current.movePage('page-2', 'left')).toBe(false);
      expect(result.current.movePage('missing-page', 'right')).toBe(false);
    });
    expect(result.current.pages.map(page => page.id)).toEqual(['page-2', 'page-1', 'page-3']);
  });
});
