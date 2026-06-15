import { useState, useCallback, useEffect, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';

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
) => {
    const [pages, setPages] = useState<DiagramPage[]>([
        createPage(DEFAULT_PAGE_ID, '页面 1'),
    ]);
    const [activePageId, setActivePageId] = useState(DEFAULT_PAGE_ID);
    const pagesRef = useRef(pages);

    useEffect(() => {
        pagesRef.current = pages;
    }, [pages]);

    // 切换页面
    const switchPage = useCallback((targetPageId: string) => {
        if (targetPageId === activePageId) return;

        // 保存当前页面状态
        const currentNodes = getCurrentNodes();
        const currentEdges = getCurrentEdges();

        setPages(prev => prev.map(p =>
            p.id === activePageId
                ? { ...p, nodes: currentNodes, edges: currentEdges }
                : p
        ));

        // 加载目标页面
        const targetPage = pagesRef.current.find(p => p.id === targetPageId);
        if (targetPage) {
            setNodes(targetPage.nodes);
            setEdges(targetPage.edges);
        }

        setActivePageId(targetPageId);
    }, [activePageId, getCurrentNodes, getCurrentEdges, setNodes, setEdges]);

    // 添加页面
    const addPage = useCallback(() => {
        // 先保存当前页面
        const currentNodes = getCurrentNodes();
        const currentEdges = getCurrentEdges();

        const newId = `page-${Date.now()}`;
        const newName = `页面 ${pagesRef.current.length + 1}`;
        const newPage = createPage(newId, newName);

        setPages(prev => [
            ...prev.map(p =>
                p.id === activePageId
                    ? { ...p, nodes: currentNodes, edges: currentEdges }
                    : p
            ),
            newPage,
        ]);

        // 切换到新页面（空画布）
        setNodes([]);
        setEdges([]);
        setActivePageId(newId);

        return newId;
    }, [activePageId, getCurrentNodes, getCurrentEdges, setNodes, setEdges]);

    // 删除页面
    const deletePage = useCallback((pageId: string) => {
        if (pagesRef.current.length <= 1) return; // 至少保留一页

        const remainingPages = pagesRef.current.filter(p => p.id !== pageId);
        setPages(remainingPages);

        // 如果删除的是当前页，切换到第一页
        if (pageId === activePageId) {
            const first = remainingPages[0];
            setNodes(first.nodes);
            setEdges(first.edges);
            setActivePageId(first.id);
        }
    }, [activePageId, setNodes, setEdges]);

    // 重命名页面
    const renamePage = useCallback((pageId: string, newName: string) => {
        setPages(prev => prev.map(p =>
            p.id === pageId ? { ...p, name: newName } : p
        ));
    }, []);

    return {
        pages,
        activePageId,
        switchPage,
        addPage,
        deletePage,
        renamePage,
    };
};
