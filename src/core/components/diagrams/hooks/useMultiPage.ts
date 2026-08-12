import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import {
    createMultiPageMetadata,
    MAX_DIAGRAM_PAGE_NAME_LENGTH,
    MAX_DIAGRAM_PAGES,
    parseMultiPageMetadata,
} from '../multiPagePersistence';
import { duplicatePageCanvas } from '../multiPageDuplication';
import {
    createNextPageName,
    createUniquePageName,
    isPageNameAvailable,
    normalizePageName,
    type PageNameFactory,
} from '../multiPageNaming';

export interface DiagramPage {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
}

const DEFAULT_PAGE_ID = 'page-1';
const createDefaultPageName: PageNameFactory = index => `页面 ${index}`;

const createPage = (id: string, name: string): DiagramPage => ({
    id,
    name,
    nodes: [],
    edges: [],
});

const clearSelectedItems = <T extends Node | Edge>(items: T[]): T[] => items.map(item =>
    item.selected ? { ...item, selected: false } : item
);

const clearPageSelection = (page: DiagramPage): DiagramPage => ({
    ...page,
    nodes: clearSelectedItems(page.nodes),
    edges: clearSelectedItems(page.edges),
});

export interface MultiPageHistoryScopes {
    switchScope: (pageId: string) => void;
    removeScope: (pageId: string) => void;
    removeScopes?: (pageIds: readonly string[]) => void;
    clearSelection?: () => void;
    scopeId?: string;
    captureCurrentState?: () => { nodes: Node[]; edges: Edge[] };
}

interface DeletedPageSnapshot {
    page: DiagramPage;
    index: number;
}

export const createMultiPageHistoryScopeKey = (scopeId: string, pageId: string): string => (
    `${encodeURIComponent(scopeId)}::${encodeURIComponent(pageId)}`
);

/**
 * 多页画布管理 Hook
 * - 页面切换时保存当前页、加载目标页
 * - 支持添加/删除/重命名页面
 * - 每次操作通过 onSwap 回调与 FlowchartDesigner 的 nodes/edges state 同步
 */
export const useMultiPage = (
    getCurrentNodes: () => Node[],
    getCurrentEdges: () => Edge[],
    setNodes: (nodes: Node[]) => void,
    setEdges: (edges: Edge[]) => void,
    historyScopes?: MultiPageHistoryScopes,
    createPageName: PageNameFactory = createDefaultPageName,
) => {
    const [pages, setPages] = useState<DiagramPage[]>([
        createPage(DEFAULT_PAGE_ID, createPageName(1)),
    ]);
    const [activePageId, setActivePageId] = useState(DEFAULT_PAGE_ID);
    const [canRestoreDeletedPage, setCanRestoreDeletedPage] = useState(false);
    const [restorableDeletedPageName, setRestorableDeletedPageName] = useState<string | null>(null);
    const pagesRef = useRef(pages);
    const activePageIdRef = useRef(activePageId);
    const pageOperationVersionRef = useRef(0);
    const deletedPageSnapshotRef = useRef<DeletedPageSnapshot | null>(null);
    const switchHistoryScope = historyScopes?.switchScope;
    const removeHistoryScope = historyScopes?.removeScope;
    const removeHistoryScopes = historyScopes?.removeScopes;
    const clearSelection = historyScopes?.clearSelection;
    const captureCurrentState = historyScopes?.captureCurrentState;
    const historyScopeId = historyScopes?.scopeId?.trim() ?? '';
    const getHistoryScopeKey = useMemo(
        () => historyScopeId
            ? (pageId: string) => createMultiPageHistoryScopeKey(historyScopeId, pageId)
            : (pageId: string) => pageId,
        [historyScopeId],
    );
    const activateHistoryScope = useCallback((pageId: string) => {
        switchHistoryScope?.(getHistoryScopeKey(pageId));
    }, [getHistoryScopeKey, switchHistoryScope]);
    const removePageHistoryScope = useCallback((pageId: string) => {
        removeHistoryScope?.(getHistoryScopeKey(pageId));
    }, [getHistoryScopeKey, removeHistoryScope]);
    const resetPageHistoryScopes = useCallback((pageIds: readonly string[]) => {
        const scopeKeys = [...new Set(pageIds.map(getHistoryScopeKey))];
        if (removeHistoryScopes) {
            removeHistoryScopes(scopeKeys);
            return;
        }
        for (const scopeKey of scopeKeys) removeHistoryScope?.(scopeKey);
    }, [getHistoryScopeKey, removeHistoryScope, removeHistoryScopes]);

    useEffect(() => {
        pagesRef.current = pages;
    }, [pages]);

    useEffect(() => {
        activePageIdRef.current = activePageId;
    }, [activePageId]);

    useLayoutEffect(() => {
        activateHistoryScope(activePageId);
    }, [activateHistoryScope, activePageId]);

    const readCurrentState = useCallback(() => {
        const captured = captureCurrentState?.();
        return {
            nodes: clearSelectedItems(captured?.nodes ?? getCurrentNodes()),
            edges: clearSelectedItems(captured?.edges ?? getCurrentEdges()),
        };
    }, [captureCurrentState, getCurrentEdges, getCurrentNodes]);

    // 切换页面
    const switchPage = useCallback((targetPageId: string) => {
        const currentActivePageId = activePageIdRef.current;
        if (targetPageId === currentActivePageId) return;

        const targetPage = pagesRef.current.find(p => p.id === targetPageId);
        if (!targetPage) return;

        pageOperationVersionRef.current += 1;
        activateHistoryScope(targetPageId);
        clearSelection?.();

        // 保存当前页面状态
        const { nodes: currentNodes, edges: currentEdges } = readCurrentState();
        const clearedTargetPage = clearPageSelection(targetPage);

        setPages(prev => {
            const nextPages = prev.map(p =>
            p.id === currentActivePageId
                ? { ...p, nodes: currentNodes, edges: currentEdges }
                : p
            );
            pagesRef.current = nextPages;
            return nextPages;
        });

        // 加载目标页面；历史作用域已在替换画布前同步切换。
        setNodes(clearedTargetPage.nodes);
        setEdges(clearedTargetPage.edges);

        activePageIdRef.current = targetPageId;
        setActivePageId(targetPageId);
    }, [activateHistoryScope, clearSelection, readCurrentState, setNodes, setEdges]);

    // 添加页面
    const addPage = useCallback(() => {
        if (pagesRef.current.length >= MAX_DIAGRAM_PAGES) return null;
        const currentActivePageId = activePageIdRef.current;

        // 先保存当前页面
        const { nodes: currentNodes, edges: currentEdges } = readCurrentState();

        const newId = `page-${crypto.randomUUID()}`;
        const newName = createNextPageName(pagesRef.current, createPageName);
        const newPage = createPage(newId, newName);

        pageOperationVersionRef.current += 1;
        activateHistoryScope(newId);
        clearSelection?.();

        setPages(prev => {
            const nextPages = [
                ...prev.map(p =>
                p.id === currentActivePageId
                    ? { ...p, nodes: currentNodes, edges: currentEdges }
                    : p
                ),
                newPage,
            ];
            pagesRef.current = nextPages;
            return nextPages;
        });

        // 切换到新页面（空画布）；历史作用域已在替换画布前同步隔离。
        setNodes([]);
        setEdges([]);
        activePageIdRef.current = newId;
        setActivePageId(newId);

        return newId;
    }, [activateHistoryScope, clearSelection, createPageName, readCurrentState, setNodes, setEdges]);

    // 删除页面
    const deletePage = useCallback((pageId: string) => {
        const currentPages = pagesRef.current;
        if (currentPages.length <= 1) return false; // 至少保留一页

        const deletedIndex = currentPages.findIndex(page => page.id === pageId);
        if (deletedIndex < 0) return false;
        const sourcePage = currentPages[deletedIndex];
        if (!sourcePage) return false;
        const deletedPage = pageId === activePageIdRef.current
            ? { ...sourcePage, ...readCurrentState() }
            : sourcePage;
        let remainingPages = currentPages.filter(page => page.id !== pageId);

        // 删除当前页后优先选择右侧相邻页；删除末页时回到左侧相邻页，避免跳回首页打断上下文。
        if (pageId === activePageIdRef.current) {
            const adjacentPage = currentPages[deletedIndex + 1] ?? currentPages[deletedIndex - 1];
            if (!adjacentPage) return false;
            const clearedAdjacentPage = clearPageSelection(adjacentPage);
            remainingPages = remainingPages.map(page =>
                page.id === clearedAdjacentPage.id ? clearedAdjacentPage : page
            );
            pageOperationVersionRef.current += 1;
            activateHistoryScope(adjacentPage.id);
            clearSelection?.();
            setNodes(clearedAdjacentPage.nodes);
            setEdges(clearedAdjacentPage.edges);
            activePageIdRef.current = adjacentPage.id;
            setActivePageId(adjacentPage.id);
        }
        pagesRef.current = remainingPages;
        setPages(remainingPages);
        removePageHistoryScope(pageId);
        deletedPageSnapshotRef.current = {
            page: clearPageSelection(deletedPage),
            index: deletedIndex,
        };
        setRestorableDeletedPageName(deletedPage.name);
        setCanRestoreDeletedPage(true);
        return true;
    }, [activateHistoryScope, clearSelection, readCurrentState, removePageHistoryScope, setNodes, setEdges]);

    const restoreDeletedPage = useCallback(() => {
        const snapshot = deletedPageSnapshotRef.current;
        const currentPages = pagesRef.current;
        if (
            !snapshot
            || currentPages.length >= MAX_DIAGRAM_PAGES
            || currentPages.some(page => page.id === snapshot.page.id)
        ) {
            return null;
        }

        const currentActivePageId = activePageIdRef.current;
        const currentState = readCurrentState();
        const savedPages = currentPages.map(page => page.id === currentActivePageId
            ? { ...page, nodes: currentState.nodes, edges: currentState.edges }
            : page);
        const insertionIndex = Math.min(Math.max(snapshot.index, 0), savedPages.length);
        const restoredPage = clearPageSelection(snapshot.page);
        const nextPages = [
            ...savedPages.slice(0, insertionIndex),
            restoredPage,
            ...savedPages.slice(insertionIndex),
        ];

        pageOperationVersionRef.current += 1;
        activateHistoryScope(restoredPage.id);
        clearSelection?.();
        pagesRef.current = nextPages;
        setPages(nextPages);
        setNodes(restoredPage.nodes);
        setEdges(restoredPage.edges);
        activePageIdRef.current = restoredPage.id;
        setActivePageId(restoredPage.id);
        deletedPageSnapshotRef.current = null;
        setRestorableDeletedPageName(null);
        setCanRestoreDeletedPage(false);
        return restoredPage.id;
    }, [activateHistoryScope, clearSelection, readCurrentState, setEdges, setNodes]);

    // 重命名页面
    const renamePage = useCallback((pageId: string, newName: string) => {
        const normalizedName = normalizePageName(newName).slice(0, MAX_DIAGRAM_PAGE_NAME_LENGTH);
        if (!isPageNameAvailable(pagesRef.current, normalizedName, pageId)) return false;
        setPages(prev => {
            const nextPages = prev.map(p =>
                p.id === pageId ? { ...p, name: normalizedName } : p
            );
            pagesRef.current = nextPages;
            return nextPages;
        });
        return true;
    }, []);

    const duplicatePage = useCallback((pageId: string, preferredName: string) => {
        const currentPages = pagesRef.current;
        if (currentPages.length >= MAX_DIAGRAM_PAGES) return null;

        const sourceIndex = currentPages.findIndex(page => page.id === pageId);
        if (sourceIndex < 0) return null;

        const duplicateName = createUniquePageName(
            currentPages,
            preferredName,
            MAX_DIAGRAM_PAGE_NAME_LENGTH,
        );
        if (!duplicateName) return null;

        const currentState = readCurrentState();
        const sourcePage = currentPages[sourceIndex];
        const sourceCanvas = pageId === activePageIdRef.current
            ? currentState
            : { nodes: sourcePage.nodes, edges: sourcePage.edges };
        const batchId = crypto.randomUUID();
        const duplicateId = `page-${batchId}`;
        const duplicatedCanvas = duplicatePageCanvas(sourceCanvas.nodes, sourceCanvas.edges, batchId);
        const duplicatedPage: DiagramPage = {
            id: duplicateId,
            name: duplicateName,
            ...duplicatedCanvas,
        };

        const savedPages = currentPages.map(page => page.id === activePageIdRef.current
            ? { ...page, nodes: currentState.nodes, edges: currentState.edges }
            : page);
        const nextPages = [
            ...savedPages.slice(0, sourceIndex + 1),
            duplicatedPage,
            ...savedPages.slice(sourceIndex + 1),
        ];

        pageOperationVersionRef.current += 1;
        activateHistoryScope(duplicateId);
        clearSelection?.();
        pagesRef.current = nextPages;
        setPages(nextPages);
        setNodes(duplicatedPage.nodes);
        setEdges(duplicatedPage.edges);
        activePageIdRef.current = duplicateId;
        setActivePageId(duplicateId);
        return duplicateId;
    }, [activateHistoryScope, clearSelection, readCurrentState, setEdges, setNodes]);

    const movePage = useCallback((pageId: string, direction: 'left' | 'right') => {
        const currentPages = pagesRef.current;
        const sourceIndex = currentPages.findIndex(page => page.id === pageId);
        if (sourceIndex < 0) return false;

        const targetIndex = sourceIndex + (direction === 'left' ? -1 : 1);
        if (targetIndex < 0 || targetIndex >= currentPages.length) return false;

        const nextPages = [...currentPages];
        [nextPages[sourceIndex], nextPages[targetIndex]] = [nextPages[targetIndex], nextPages[sourceIndex]];
        pagesRef.current = nextPages;
        setPages(nextPages);
        return true;
    }, []);

    const getPersistedMetadata = useCallback(() => {
        const currentState = readCurrentState();
        return createMultiPageMetadata(
            pagesRef.current.map(clearPageSelection),
            activePageIdRef.current,
            currentState.nodes,
            currentState.edges,
        );
    }, [readCurrentState]);

    const restorePersistedMetadata = useCallback((metadata: unknown) => {
        const restored = parseMultiPageMetadata(metadata);
        if (!restored) return null;
        deletedPageSnapshotRef.current = null;
        setRestorableDeletedPageName(null);
        setCanRestoreDeletedPage(false);
        const clearedPages = restored.pages.map(clearPageSelection);
        clearSelection?.();
        pageOperationVersionRef.current += 1;
        resetPageHistoryScopes([
            ...pagesRef.current.map(page => page.id),
            ...clearedPages.map(page => page.id),
        ]);
        activateHistoryScope(restored.activePageId);
        pagesRef.current = clearedPages;
        activePageIdRef.current = restored.activePageId;
        setPages(clearedPages);
        setActivePageId(restored.activePageId);
        return clearedPages.find(page => page.id === restored.activePageId) ?? null;
    }, [activateHistoryScope, clearSelection, resetPageHistoryScopes]);

    const getPageOperationScope = useCallback(
        () => `${activePageIdRef.current}:${pageOperationVersionRef.current}`,
        [],
    );

    return {
        pages,
        activePageId,
        canRestoreDeletedPage,
        restorableDeletedPageName,
        getPageOperationScope,
        switchPage,
        addPage,
        deletePage,
        restoreDeletedPage,
        renamePage,
        duplicatePage,
        movePage,
        getPersistedMetadata,
        restorePersistedMetadata,
    };
};
