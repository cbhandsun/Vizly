import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { FlowchartNodeData } from '../FlowchartNode';
import {
    useBeforeDiagramStructuralChange,
    useNodeUpdate,
} from '../../diagrams/useNodeUpdate';
import {
    calculateCanvasVisibleLeft,
    calculateCanvasVisibleRight,
    calculateQuickCloneViewportAdjustment,
    resolveFlowchartQuickCloneLabelKey,
    type FlowchartQuickCloneDirection,
} from '../flowchartQuickClone';
import {
    cloneFlowchartNode,
    quickCloneFlowchartNode,
    shouldSnapshotFlowchartNodeDataUpdate,
} from '../flowchartNodeMutations';

export function useFlowchartNodeInteractions(
    id: string,
    data: FlowchartNodeData,
    selected: boolean,
    editingAllowed = true,
) {
    const {
        getEdges,
        getNodes,
        getViewport,
        setEdges,
        setNodes,
        setViewport,
    } = useReactFlow();
    const { t } = useTranslation();
    const onUpdateNodeData = useNodeUpdate();
    const beforeStructuralChange = useBeforeDiagramStructuralChange();

    const [isHovered, setIsHovered] = useState(false);
    const [bounceAnimate, setBounceAnimate] = useState(false);
    const prevSelectedRef = useRef(selected);
    const editStartRef = useRef<number | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Node Update Helper
    const handleUpdateData = useCallback((newData: Partial<FlowchartNodeData>) => {
        if (!editingAllowed) return;
        if (onUpdateNodeData) {
            onUpdateNodeData(
                [id],
                { data: { ...data, ...newData } },
                { snapshot: shouldSnapshotFlowchartNodeDataUpdate(newData) },
            );
        } else {
            setNodes((nds) => nds.map((n) => {
                if (n.id === id) {
                    return { ...n, data: { ...n.data, ...newData } };
                }
                return n;
            }));
        }
    }, [data, editingAllowed, id, onUpdateNodeData, setNodes]);

    // Bounce Animation on Select
    useEffect(() => {
        if (selected && !prevSelectedRef.current) {
            const startTimer = setTimeout(() => setBounceAnimate(true), 0);
            const stopTimer = setTimeout(() => setBounceAnimate(false), 300);
            prevSelectedRef.current = selected;
            return () => {
                clearTimeout(startTimer);
                clearTimeout(stopTimer);
            };
        }
        prevSelectedRef.current = selected;
        return undefined;
    }, [selected]);

    // Auto-expand Text Bounds
    useEffect(() => {
        if (!editingAllowed) return;
        if (!contentRef.current) return;
        const requiredHeight = contentRef.current.scrollHeight;
        
        setNodes(nds => {
            const thisNode = nds.find(n => n.id === id);
            if (thisNode) {
                const explicitStyleH = typeof thisNode.style?.height === 'number'
                    ? thisNode.style.height
                    : parseInt(String(thisNode.style?.height || '0')) || 0;
                const explicitRootH = typeof thisNode.height === 'number' ? thisNode.height : parseInt(String(thisNode.height || '0')) || 0;
                
                const currentHeight = explicitStyleH > 0 ? explicitStyleH : explicitRootH;
                const hasHeightConstraint = currentHeight > 0;
                
                if (hasHeightConstraint && requiredHeight > currentHeight) {
                    return nds.map(n => n.id === id ? {
                        ...n,
                        height: requiredHeight,
                        style: {
                            ...n.style,
                            height: requiredHeight
                        }
                    } : n);
                }
            }
            return nds;
        });
    }, [data.description, data.isEditing, data.label, data.shape, editingAllowed, id, setNodes]);


    const handleDelete = useCallback(() => {
        if (!editingAllowed) return;
        const currentNodes = getNodes();
        if (!currentNodes.some(node => node.id === id)) return;
        beforeStructuralChange?.();
        setNodes(currentNodes.filter(node => node.id !== id));
        setEdges(getEdges().filter(edge => edge.source !== id && edge.target !== id));
    }, [beforeStructuralChange, editingAllowed, getEdges, getNodes, id, setEdges, setNodes]);

    const handleDomainClassChange = useCallback((dc: string, domainName: string) => {
        handleUpdateData({
            domainClass: dc,
            domain: domainName,
            theme: undefined
        });
    }, [handleUpdateData]);

    const ensureNodeVisible = useCallback((nx: number, ny: number, nodeWidth: number, nodeHeight: number) => {
        const vp = getViewport();
        const container = document.querySelector<HTMLElement>('.react-flow');
        if (!container) return;
        const containerRect = container.getBoundingClientRect();
        const drawer = document.querySelector<HTMLElement>('.side-drawer');
        const drawerRect = drawer?.getBoundingClientRect();
        const sidebar = document.querySelector<HTMLElement>('.designer-right-sidebar');
        const sidebarRect = sidebar?.getBoundingClientRect();
        const visibleLeft = calculateCanvasVisibleLeft({
            containerLeft: containerRect.left,
            containerRight: containerRect.right,
            containerWidth: containerRect.width,
            drawerLeft: drawerRect?.left,
            drawerRight: drawerRect?.right,
            drawerWidth: drawerRect?.width,
            drawerHeight: drawerRect?.height,
            drawerVisible: Boolean(
                drawer
                && drawerRect
                && getComputedStyle(drawer).visibility !== 'hidden'
            ),
        });
        const visibleRight = calculateCanvasVisibleRight({
            containerLeft: containerRect.left,
            containerRight: containerRect.right,
            containerWidth: containerRect.width,
            sidebarLeft: sidebarRect?.left,
            sidebarRight: sidebarRect?.right,
            sidebarWidth: sidebarRect?.width,
            sidebarHeight: sidebarRect?.height,
            sidebarVisible: Boolean(
                sidebar
                && sidebarRect
                && getComputedStyle(sidebar).visibility !== 'hidden'
            ),
        });
        const adjustment = calculateQuickCloneViewportAdjustment({
            containerWidth: containerRect.width,
            containerHeight: containerRect.height,
            visibleLeft,
            visibleRight,
            nodeX: nx,
            nodeY: ny,
            nodeWidth,
            nodeHeight,
            viewportX: vp.x,
            viewportY: vp.y,
            zoom: vp.zoom,
        });
        if (adjustment) {
            setViewport(adjustment, { duration: 300 });
        }
    }, [getViewport, setViewport]);

    const handleClone = useCallback(() => {
        if (!editingAllowed) return;
        const mutation = cloneFlowchartNode({
            nodes: getNodes(),
            edges: getEdges(),
            sourceId: id,
            timestamp: Date.now(),
        });
        if (!mutation) return;
        beforeStructuralChange?.();
        setNodes(mutation.nodes);
        setEdges(mutation.edges);
        ensureNodeVisible(
            mutation.newNode.position.x,
            mutation.newNode.position.y,
            120,
            60,
        );
    }, [
        beforeStructuralChange,
        editingAllowed,
        ensureNodeVisible,
        getEdges,
        getNodes,
        id,
        setEdges,
        setNodes,
    ]);

    const handleQuickClone = useCallback((direction: FlowchartQuickCloneDirection, e: React.SyntheticEvent | PointerEvent) => {
        if (e && 'stopPropagation' in e) {
             e.stopPropagation();
        }
        if (!editingAllowed) return;
        const sourceNode = getNodes().find(node => node.id === id);
        if (!sourceNode) return;
        const sourceData = sourceNode.data as FlowchartNodeData;
        const mutation = quickCloneFlowchartNode({
            nodes: getNodes(),
            edges: getEdges(),
            sourceId: id,
            direction,
            label: t(resolveFlowchartQuickCloneLabelKey(sourceData.shape || 'rectangle')),
            timestamp: Date.now(),
        });
        if (!mutation) return;
        beforeStructuralChange?.();
        setNodes(mutation.nodes);
        setEdges(mutation.edges);

        setTimeout(
            () => ensureNodeVisible(
                mutation.newNode.position.x,
                mutation.newNode.position.y,
                mutation.nodeSize.width,
                mutation.nodeSize.height,
            ),
            80,
        );
    }, [
        beforeStructuralChange,
        editingAllowed,
        ensureNodeVisible,
        getEdges,
        getNodes,
        id,
        setEdges,
        setNodes,
        t,
    ]);

    return {
        isHovered,
        setIsHovered,
        bounceAnimate,
        contentRef,
        editStartRef,
        handleUpdateData,
        handleDelete,
        handleClone,
        handleDomainClassChange,
        handleQuickClone
    };
}
