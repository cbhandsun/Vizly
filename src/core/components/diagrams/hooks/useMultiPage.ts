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

export interface MultiPageHistoryScopes {
    switchScope: (pageId: string) => void;
    removeScope: (pageId: string) => void;
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
    const switchHistoryScope = historyScopes?.switchScope;
    const removeHistoryScope = historyScopes?.removeScope;

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

        // 保存当前页面状态
        const currentNodes = getCurrentNodes();
        const currentEdges = getCurrentEdges();

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
        setNodes(targetPage.nodes);
        setEdges(targetPage.edges);

        activePageIdRef.current = targetPageId;
        setActivePageId(targetPageId);
    }, [activePageId, getCurrentNodes, getCurrentEdges, setNodes, setEdges]);

    // 添加页面
    const addPage = useCallback(() => {
        if (pagesRef.current.length >= MAX_DIAGRAM_PAGES) return null;

        // 先保存当前页面
        const currentNodes = getCurrentNodes();
        const currentEdges = getCurrentEdges();

        const newId = `page-${crypto.randomUUID()}`;
        const newName = createNextPageName(pagesRef.current);
        const newPage = createPage(newId, newName);

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
    }, [activePageId, getCurrentNodes, getCurrentEdges, setNodes, setEdges]);

    // 删除页面
    const deletePage = useCallback((pageId: string) => {
        const currentPages = pagesRef.current;
        if (currentPages.length <= 1) return false; // 至少保留一页

        const deletedIndex = currentPages.findIndex(page => page.id === pageId);
        if (deletedIndex < 0) return false;
        const remainingPages = currentPages.filter(page => page.id !== pageId);
        pagesRef.current = remainingPages;
        setPages(remainingPages);

        // 删除当前页后优先选择右侧相邻页；删除末页时回到左侧相邻页，避免跳回首页打断上下文。
        if (pageId === activePageIdRef.current) {
            const adjacentPage = currentPages[deletedIndex + 1] ?? currentPages[deletedIndex - 1];
            if (!adjacentPage) return false;
            setNodes(adjacentPage.nodes);
            setEdges(adjacentPage.edges);
            activePageIdRef.current = adjacentPage.id;
            setActivePageId(adjacentPage.id);
        }
        removeHistoryScope?.(pageId);
        return true;
    }, [removeHistoryScope, setNodes, setEdges]);

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
        pagesRef.current,
        activePageIdRef.current,
        getCurrentNodes(),
        getCurrentEdges(),
    ), [getCurrentEdges, getCurrentNodes]);

    const restorePersistedMetadata = useCallback((metadata: unknown) => {
        const restored = parseMultiPageMetadata(metadata);
        if (!restored) return null;
        pagesRef.current = restored.pages;
        activePageIdRef.current = restored.activePageId;
        setPages(restored.pages);
        setActivePageId(restored.activePageId);
        return restored.pages.find(page => page.id === restored.activePageId) ?? null;
    }, []);

    return {
        pages,
        activePageId,
        switchPage,
        addPage,
        deletePage,
        renamePage,
        getPersistedMetadata,
        restorePersistedMetadata,
    };
};
