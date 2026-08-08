import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import {
    createMultiPageMetadata,
    MAX_DIAGRAM_PAGE_NAME_LENGTH,
    MAX_DIAGRAM_PAGES,
    parseMultiPageMetadata,
} from '../multiPagePersistence';
import { createNextPageName, isPageNameAvailable, normalizePageName } from '../multiPageNaming';

export interface DiagramPage {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
}

const DEFAULT_PAGE_ID = 'page-1';

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
) => {
    const [pages, setPages] = useState<DiagramPage[]>([
        createPage(DEFAULT_PAGE_ID, '页面 1'),
    ]);
    const [activePageId, setActivePageId] = useState(DEFAULT_PAGE_ID);
    const pagesRef = useRef(pages);
    const activePageIdRef = useRef(activePageId);
    const pageOperationVersionRef = useRef(0);
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
        if (targetPageId === activePageId) return;

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
            p.id === activePageId
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
    }, [activePageId, activateHistoryScope, clearSelection, readCurrentState, setNodes, setEdges]);

    // 添加页面
    const addPage = useCallback(() => {
        if (pagesRef.current.length >= MAX_DIAGRAM_PAGES) return null;

        // 先保存当前页面
        const { nodes: currentNodes, edges: currentEdges } = readCurrentState();

        const newId = `page-${crypto.randomUUID()}`;
        const newName = createNextPageName(pagesRef.current);
        const newPage = createPage(newId, newName);

        pageOperationVersionRef.current += 1;
        activateHistoryScope(newId);
        clearSelection?.();

        setPages(prev => {
            const nextPages = [
                ...prev.map(p =>
                p.id === activePageId
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
    }, [activePageId, activateHistoryScope, clearSelection, readCurrentState, setNodes, setEdges]);

    // 删除页面
    const deletePage = useCallback((pageId: string) => {
        const currentPages = pagesRef.current;
        if (currentPages.length <= 1) return false; // 至少保留一页

        const deletedIndex = currentPages.findIndex(page => page.id === pageId);
        if (deletedIndex < 0) return false;
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
        return true;
    }, [activateHistoryScope, clearSelection, removePageHistoryScope, setNodes, setEdges]);

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
        getPageOperationScope,
        switchPage,
        addPage,
        deletePage,
        renamePage,
        getPersistedMetadata,
        restorePersistedMetadata,
    };
};
