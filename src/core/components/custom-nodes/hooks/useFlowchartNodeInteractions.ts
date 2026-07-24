import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow, Node } from '@xyflow/react';
import type { FlowchartNodeData } from '../FlowchartNode';
import { MarkerType } from '@xyflow/react';
import { useNodeUpdate } from '../../diagrams/useNodeUpdate';

export function useFlowchartNodeInteractions(id: string, data: FlowchartNodeData, selected: boolean) {
    const { setNodes, setEdges, getViewport, setViewport } = useReactFlow();
    const onUpdateNodeData = useNodeUpdate();

    const [isHovered, setIsHovered] = useState(false);
    const [bounceAnimate, setBounceAnimate] = useState(false);
    const prevSelectedRef = useRef(selected);
    const editStartRef = useRef<number | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Node Update Helper
    const handleUpdateData = useCallback((newData: Partial<FlowchartNodeData>) => {
        if (onUpdateNodeData) {
            onUpdateNodeData([id], { data: { ...data, ...newData } });
        } else {
            setNodes((nds) => nds.map((n) => {
                if (n.id === id) {
                    return { ...n, data: { ...n.data, ...newData } };
                }
                return n;
            }));
        }
    }, [id, data, onUpdateNodeData, setNodes]);

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
    }, [id, setNodes, data.label, data.description, data.isEditing, data.shape]);


    const handleDelete = useCallback(() => {
        setNodes((nds) => nds.filter((n) => n.id !== id));
        setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    }, [id, setNodes, setEdges]);

    const handleClone = useCallback(() => {
        setNodes((nds) => {
            const source = nds.find(n => n.id === id);
            if (!source) return nds;
            const newNode = {
                ...source,
                id: `${source.id}_copy_${Date.now()}`,
                position: { x: source.position.x + 30, y: source.position.y + 30 },
                selected: true
            };
            return [...nds.map(n => ({ ...n, selected: false })), newNode];
        });
    }, [id, setNodes]);

    const handleDomainClassChange = useCallback((dc: string, domainName: string) => {
        handleUpdateData({
            domainClass: dc,
            domain: domainName,
            theme: undefined
        });
    }, [handleUpdateData]);

    const ensureNodeVisible = useCallback((nx: number, ny: number) => {
        const vp = getViewport();
        const container = document.querySelector('.react-flow') as HTMLElement;
        if (!container) return;
        const { width: cw, height: ch } = container.getBoundingClientRect();
        const screenX = nx * vp.zoom + vp.x;
        const screenY = ny * vp.zoom + vp.y;
        const margin = 80;
        if (screenX < margin || screenX > cw - margin || screenY < margin || screenY > ch - margin) {
            setViewport({
                x: cw / 2 - nx * vp.zoom,
                y: ch / 2 - ny * vp.zoom,
                zoom: vp.zoom
            }, { duration: 300 });
        }
    }, [getViewport, setViewport]);

    const handleQuickClone = useCallback((direction: 'top' | 'right' | 'bottom' | 'left', e: React.MouseEvent | PointerEvent) => {
        if (e && 'stopPropagation' in e) {
             e.stopPropagation();
        }
        const newNodeId = `flowchart-node-${Date.now()}`;
        const finalPos = { x: 0, y: 0 };
        
        setNodes((nds) => {
            const sourceNode = nds.find(n => n.id === id);
            if (!sourceNode) return nds;
            
            const offsetDistX = 180;
            const offsetDistY = 140;
            let nx = sourceNode.position.x;
            let ny = sourceNode.position.y;
            
            switch (direction) {
                case 'top': ny -= offsetDistY; break;
                case 'bottom': ny += offsetDistY; break;
                case 'left': nx -= offsetDistX; break;
                case 'right': nx += offsetDistX; break;
            }

            const nodeW = (sourceNode.measured?.width ?? sourceNode.width ?? 120) as number;
            const nodeH = (sourceNode.measured?.height ?? sourceNode.height ?? 60) as number;
            const OVERLAP_PAD = 20;
            const MAX_SHIFTS = 5;

            for (let shift = 0; shift < MAX_SHIFTS; shift++) {
                const hasOverlap = nds.some(n => {
                    if (n.id === id) return false;
                    const nw = (n.measured?.width ?? n.width ?? 120) as number;
                    const nh = (n.measured?.height ?? n.height ?? 60) as number;
                    return !(nx + nodeW + OVERLAP_PAD < n.position.x ||
                             nx > n.position.x + nw + OVERLAP_PAD ||
                             ny + nodeH + OVERLAP_PAD < n.position.y ||
                             ny > n.position.y + nh + OVERLAP_PAD);
                });
                if (!hasOverlap) break;
                switch (direction) {
                    case 'top': ny -= offsetDistY; break;
                    case 'bottom': ny += offsetDistY; break;
                    case 'left': nx -= offsetDistX; break;
                    case 'right': nx += offsetDistX; break;
                }
            }

            finalPos.x = nx; finalPos.y = ny;
            const srcData = sourceNode.data as FlowchartNodeData;
            const shape = srcData.shape || 'rectangle';
            const SHAPE_LABELS: Record<string, string> = {
                'rectangle': 'Process', 'pill': 'Start/End', 'diamond': 'Decision',
                'parallelogram': 'I/O', 'database': 'Database', 'predefined-process': 'Sub-Process',
                'document': 'Document', 'multi-document': 'Multi-Doc', 'note': 'Note',
                'ellipse': 'Ellipse', 'circle': 'Circle', 'triangle': 'Triangle',
                'hexagon': 'Hexagon', 'trapezoid': 'Trapezoid', 'star': 'Star',
                'cloud': 'Cloud', 'manual-input': 'Manual Input', 'delay': 'Delay',
                'display': 'Display', 'off-page': 'Off-Page', 'internal-storage': 'Storage',
            };

            const newNode: Node = {
                id: newNodeId,
                type: sourceNode.type,
                position: { x: nx, y: ny },
                style: sourceNode.style,
                data: {
                    label: SHAPE_LABELS[shape] || 'Process',
                    shape,
                    ...(srcData.theme && { theme: srcData.theme }),
                    ...(srcData.domainClass && { domainClass: srcData.domainClass }),
                    ...(srcData.domain && { domain: srcData.domain }),
                    ...(srcData.style && { style: srcData.style }),
                    ...(srcData.textAlign && { textAlign: srcData.textAlign }),
                    isEditing: true,
                    layer: srcData.layer || 'layer-0',
                },
                selected: true,
            };

            return [...nds.map(n => ({ ...n, selected: false })), newNode];
        });

        setEdges((eds) => {
            let handleSource = 'right';
            let handleTarget = 'left';

            switch (direction) {
                case 'top': handleSource = 'top'; handleTarget = 'bottom'; break;
                case 'bottom': handleSource = 'bottom'; handleTarget = 'top'; break;
                case 'left': handleSource = 'left'; handleTarget = 'right'; break;
                case 'right': handleSource = 'right'; handleTarget = 'left'; break;
            }

            const newEdge = {
                id: `e-${id}-${newNodeId}`,
                source: id,
                target: newNodeId,
                sourceHandle: handleSource,
                targetHandle: handleTarget,
                type: 'advanced-smart-step',
                markerEnd: { type: MarkerType.ArrowClosed },
                selected: true
            };
            return [...eds.map(e => ({ ...e, selected: false })), newEdge];
        });

        setTimeout(() => ensureNodeVisible(finalPos.x, finalPos.y), 50);
    }, [id, setNodes, setEdges, ensureNodeVisible]);

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
