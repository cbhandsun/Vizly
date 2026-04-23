import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMindElixir } from './MindElixirWrapper';

interface BoundaryBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    title?: string;
}

export default function MindMapBoundaries() {
    const { instance } = useMindElixir();
    const [boundaries, setBoundaries] = useState<BoundaryBox[]>([]);
    const [mapContainer, setMapContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (!instance?.container) return;

        const containerEle = instance.container.querySelector('.map-container') as HTMLElement;
        if (containerEle) {
            setMapContainer(containerEle);
        }

        const updateBoundaries = () => {
            if (!containerEle) return;
            const boxes: BoundaryBox[] = [];
            const data = instance.getData();

            const walk = (node: any) => {
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
                (node.children || []).forEach(walk);
            };

            try {
                walk(data.nodeData);
                setBoundaries(boxes);
            } catch (err) {
                console.error('[MindMapBoundaries] Walk error', err);
            }
        };

        updateBoundaries();

        // 1. Update on operation (layout changes, add/remove nodes)
        const handleOp = () => {
            updateBoundaries();
            setTimeout(updateBoundaries, 150); // Give flexbox layout time to settle
        };
        instance.bus.addListener('operation', handleOp);
        
        // 2. Poll fallback for node collapse animations or window resizes 
        // that don't emit operations but change bounding rects
        const interval = setInterval(updateBoundaries, 200);

        return () => {
            if (typeof instance.bus.removeListener === 'function') {
                instance.bus.removeListener('operation', handleOp);
            }
            clearInterval(interval);
        };
    }, [instance]);

    if (!mapContainer || boundaries.length === 0) return null;

    // Convert hex to rgba for background filling
    const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16) || 99;
        const g = parseInt(hex.slice(3, 5), 16) || 102;
        const b = parseInt(hex.slice(5, 7), 16) || 241;
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
