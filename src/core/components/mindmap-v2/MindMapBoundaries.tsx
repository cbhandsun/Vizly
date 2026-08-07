import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMindElixir } from './MindElixirContext';
import { logMindmapBoundariesWalkFailure } from './mindmapPanelLogging';
import type { NodeObj } from 'mind-elixir';
import { PushpinOutlined } from '@ant-design/icons';
import {
    measureMindMapBoundaryRect,
    mindMapBoundaryColorToRgba,
    resolveMindMapBoundaryTarget,
    resolveMindMapContainer,
} from './mindMapBoundaryPresentation';

interface BoundaryBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    title?: string;
}

type BoundaryNode = NodeObj & {
    boundary?: { color?: string; title?: string };
};

export default function MindMapBoundaries() {
    const { instance } = useMindElixir();
    const [boundaries, setBoundaries] = useState<BoundaryBox[]>([]);
    const mapContainer = useMemo(
        () => resolveMindMapContainer(instance?.container),
        [instance],
    );

    useEffect(() => {
        if (!instance) return;
        const containerEle = resolveMindMapContainer(instance.container);
        if (!containerEle) return;
        let pendingFrame = 0;

        const updateBoundaries = () => {
            if (!containerEle) return;
            const boxes: BoundaryBox[] = [];
            const data = instance.getData();

            const walk = (node: BoundaryNode) => {
                // If the node has boundary data, render a bounding box
                if (node.boundary) {
                    let tpc: HTMLElement | null = null;
                    try {
                        tpc = instance.findEle(node.id);
                    } catch {
                        // Mind Elixir can publish an operation before the replacement topic is mounted.
                    }
                    if (tpc) {
                        const targetElement = resolveMindMapBoundaryTarget(tpc);
                        
                        if (targetElement) {
                            const rect = measureMindMapBoundaryRect(containerEle, targetElement);
                            
                            // Extract base color, default to indigo if malformed
                            const baseColor = node.boundary.color || '#6366f1';
                            
                            boxes.push({
                                id: node.id,
                                ...rect,
                                color: baseColor,
                                title: node.boundary.title
                            });
                        }
                    }
                }
                (node.children || []).forEach(child => walk(child as BoundaryNode));
            };

            try {
                walk(data.nodeData);
                setBoundaries(boxes);
            } catch (err) {
                logMindmapBoundariesWalkFailure(err);
            }
        };

        updateBoundaries();

        const scheduleBoundaryUpdate = () => {
            if (pendingFrame) cancelAnimationFrame(pendingFrame);
            pendingFrame = requestAnimationFrame(() => {
                pendingFrame = 0;
                updateBoundaries();
            });
        };

        // 1. Update on operation (layout changes, add/remove nodes)
        const handleOp = scheduleBoundaryUpdate;
        instance.bus.addListener('operation', handleOp);

        // 2. MutationObserver to watch DOM structure/attribute changes
        const mutationObserver = new MutationObserver((mutations) => {
            const isInternal = mutations.every(m => {
                const target = m.target as HTMLElement;
                return target.closest && target.closest('.mindmap-boundary-layer');
            });
            if (!isInternal) {
                scheduleBoundaryUpdate();
            }
        });
        mutationObserver.observe(containerEle, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
        });

        // 3. ResizeObserver to watch container or main layout resizing
        const resizeObserver = new ResizeObserver(() => {
            scheduleBoundaryUpdate();
        });
        const mainEle = containerEle.querySelector('me-main');
        if (mainEle) {
            resizeObserver.observe(mainEle);
        }
        resizeObserver.observe(containerEle);

        // 4. Also listen to image load events inside the container
        const handleLoad = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG') {
                scheduleBoundaryUpdate();
            }
        };
        containerEle.addEventListener('load', handleLoad, true);

        return () => {
            if (typeof instance.bus.removeListener === 'function') {
                instance.bus.removeListener('operation', handleOp);
            }
            mutationObserver.disconnect();
            resizeObserver.disconnect();
            if (pendingFrame) cancelAnimationFrame(pendingFrame);
            containerEle.removeEventListener('load', handleLoad, true);
        };
    }, [instance]);

    if (!mapContainer || boundaries.length === 0) return null;

    const overlay = (
        <div 
            className="mindmap-boundary-layer"
            style={{ 
                position: 'absolute', 
                inset: 0, 
                zIndex: 0, // Put behind nodes
                pointerEvents: 'none' 
            }}
        >
            {boundaries.map(b => (
                <div key={b.id} style={{
                    position: 'absolute',
                    left: b.x,
                    top: b.y,
                    width: b.width,
                    height: b.height,
                    backgroundColor: mindMapBoundaryColorToRgba(b.color, 0.08),
                    border: `2px dashed ${mindMapBoundaryColorToRgba(b.color, 0.6)}`,
                    borderRadius: 16,
                    transition: 'all 0.15s ease-out'
                }}>
                    {b.title && (
                        <div style={{
                            position: 'absolute',
                            top: -12,
                            left: '50%',
                            transform: 'translate(-50%, -100%)',
                            background: b.color,
                            color: '#fff',
                            padding: '4px 10px',
                            borderRadius: 14,
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                        }}>
                            <PushpinOutlined aria-hidden="true" /> {b.title}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    // Portal the layer directly into the scaled .map-container 
    // so boundaries zoom and pan perfectly with the map.
    return createPortal(overlay, mapContainer);
}
