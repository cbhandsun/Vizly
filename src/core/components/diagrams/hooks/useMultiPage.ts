import { useState, useCallback, useEffect, useRef } from 'react';
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
    clearSelection?: () => void;
}

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
    const clearSelection = historyScopes?.clearSelection;

    useEffect(() => {
        pagesRef.current = pages;
    }, [pages]);

    useEffect(() => {
        activePageIdRef.current = activePageId;
    }, [activePageId]);

    useEffect(() => {
        switchHistoryScope?.(activePageId);
    }, [activePageId, switchHistoryScope]);

    // 切换页面
    const switchPage = useCallback((targetPageId: string) => {
        if (targetPageId === activePageId) return;

        const targetPage = pagesRef.current.find(p => p.id === targetPageId);
        if (!targetPage) return;

        pageOperationVersionRef.current += 1;
        clearSelection?.();

        // 保存当前页面状态
        const currentNodes = clearSelectedItems(getCurrentNodes());
        const currentEdges = clearSelectedItems(getCurrentEdges());
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

        // 加载目标页面；历史作用域由 activePageId effect 统一切换，避免同一事件重复同步。
        setNodes(clearedTargetPage.nodes);
        setEdges(clearedTargetPage.edges);

        activePageIdRef.current = targetPageId;
        setActivePageId(targetPageId);
    }, [activePageId, clearSelection, getCurrentNodes, getCurrentEdges, setNodes, setEdges]);

    // 添加页面
    const addPage = useCallback(() => {
        if (pagesRef.current.length >= MAX_DIAGRAM_PAGES) return null;

        // 先保存当前页面
        const currentNodes = clearSelectedItems(getCurrentNodes());
        const currentEdges = clearSelectedItems(getCurrentEdges());

        const newId = `page-${crypto.randomUUID()}`;
        const newName = createNextPageName(pagesRef.current);
        const newPage = createPage(newId, newName);

        pageOperationVersionRef.current += 1;
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

        // 切换到新页面（空画布）；历史作用域由 activePageId effect 统一隔离。
        setNodes([]);
        setEdges([]);
        activePageIdRef.current = newId;
        setActivePageId(newId);

        return newId;
    }, [activePageId, clearSelection, getCurrentNodes, getCurrentEdges, setNodes, setEdges]);

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
            clearSelection?.();
            setNodes(clearedAdjacentPage.nodes);
            setEdges(clearedAdjacentPage.edges);
            activePageIdRef.current = adjacentPage.id;
            setActivePageId(adjacentPage.id);
        }
        pagesRef.current = remainingPages;
        setPages(remainingPages);
        removeHistoryScope?.(pageId);
        return true;
    }, [clearSelection, removeHistoryScope, setNodes, setEdges]);

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

    const getPersistedMetadata = useCallback(() => createMultiPageMetadata(
        pagesRef.current.map(clearPageSelection),
        activePageIdRef.current,
        clearSelectedItems(getCurrentNodes()),
        clearSelectedItems(getCurrentEdges()),
    ), [getCurrentEdges, getCurrentNodes]);

    const restorePersistedMetadata = useCallback((metadata: unknown) => {
        const restored = parseMultiPageMetadata(metadata);
        if (!restored) return null;
        const clearedPages = restored.pages.map(clearPageSelection);
        clearSelection?.();
        pageOperationVersionRef.current += 1;
        pagesRef.current = clearedPages;
        activePageIdRef.current = restored.activePageId;
        setPages(clearedPages);
        setActivePageId(restored.activePageId);
        return clearedPages.find(page => page.id === restored.activePageId) ?? null;
    }, [clearSelection]);

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
