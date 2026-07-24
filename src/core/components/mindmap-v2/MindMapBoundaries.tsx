import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMindElixir } from './MindElixirContext';
import { logMindmapBoundariesWalkFailure } from './mindmapPanelLogging';
import type { NodeObj } from 'mind-elixir';

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
        () => instance?.container?.querySelector('.map-container') as HTMLElement | null,
        [instance],
    );

    useEffect(() => {
        if (!instance?.container) return;

        const containerEle = instance.container.querySelector('.map-container') as HTMLElement;
        if (!containerEle) return;

        const updateBoundaries = () => {
            if (!containerEle) return;
            const boxes: BoundaryBox[] = [];
            const data = instance.getData();

            const walk = (node: BoundaryNode) => {
                // If the node has boundary data, render a bounding box
                if (node.boundary) {
                    const tpc = instance.findEle(node.id);
                    if (tpc) {
                        // For root, it's 'me-root'. For branches, it's 'me-wrapper' which encapsulates topic AND children.
                        const wrapper = tpc.closest('me-wrapper') as HTMLElement;
                        const targetElement = wrapper || tpc.closest('me-root') as HTMLElement;
                        
                        if (targetElement) {
                            // Compute relative position by walking up offsetParents until mapContainer
                            let el = targetElement;
                            let x = 0;
                            let y = 0;
                            while (el && el !== containerEle && !el.classList.contains('map-container')) {
                                x += el.offsetLeft;
                                y += el.offsetTop;
                                el = el.offsetParent as HTMLElement;
                            }
                            
                            // Extract base color, default to indigo if malformed
                            const baseColor = node.boundary.color || '#6366f1';
                            
                            boxes.push({
                                id: node.id,
                                // Add 15px padding around the elements
                                x: x - 15,
                                y: y - 15,
                                width: targetElement.offsetWidth + 30,
                                height: targetElement.offsetHeight + 30,
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

        // 1. Update on operation (layout changes, add/remove nodes)
        const handleOp = () => {
            updateBoundaries();
        };
        instance.bus.addListener('operation', handleOp);

        // 2. MutationObserver to watch DOM structure/attribute changes
        const mutationObserver = new MutationObserver((mutations) => {
            const isInternal = mutations.every(m => {
                const target = m.target as HTMLElement;
                return target.closest && target.closest('.mindmap-boundary-layer');
            });
            if (!isInternal) {
                updateBoundaries();
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
            updateBoundaries();
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
                updateBoundaries();
            }
        };
        containerEle.addEventListener('load', handleLoad, true);

        return () => {
            if (typeof instance.bus.removeListener === 'function') {
                instance.bus.removeListener('operation', handleOp);
            }
            mutationObserver.disconnect();
            resizeObserver.disconnect();
            containerEle.removeEventListener('load', handleLoad, true);
        };
    }, [instance]);

    if (!mapContainer || boundaries.length === 0) return null;

    // Convert hex to rgba for background filling
    const hexToRgba = (hex: string, alpha: number) => {
        const cleanHex = hex.replace('#', '');
        let r = 99, g = 102, b = 241;
        if (cleanHex.length === 3) {
            r = parseInt(cleanHex[0] + cleanHex[0], 16) || 99;
            g = parseInt(cleanHex[1] + cleanHex[1], 16) || 102;
            b = parseInt(cleanHex[2] + cleanHex[2], 16) || 241;
        } else if (cleanHex.length === 6) {
            r = parseInt(cleanHex.slice(0, 2), 16) || 99;
            g = parseInt(cleanHex.slice(2, 4), 16) || 102;
            b = parseInt(cleanHex.slice(4, 6), 16) || 241;
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

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
                    backgroundColor: b.color.startsWith('#') ? hexToRgba(b.color, 0.08) : 'rgba(99,102,241,0.08)',
                    border: `2px dashed ${b.color.startsWith('#') ? hexToRgba(b.color, 0.6) : 'rgba(99,102,241,0.6)'}`,
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
                            <span>📌</span> {b.title}
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
