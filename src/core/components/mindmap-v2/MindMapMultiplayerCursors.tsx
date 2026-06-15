import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMindElixir } from './MindElixirContext';
import { collaborationService } from '../../services/CollaborationService';

interface CursorState {
    clientId: number;
    user: { name: string; color: string; id: string };
    cursor: { x: number; y: number } | null;
}

export default function MindMapMultiplayerCursors() {
    const { instance } = useMindElixir();
    const [cursors, setCursors] = useState<CursorState[]>([]);
    const frameRef = useRef<number | null>(null);
    const mapContainer = useMemo(
        () => instance?.container?.querySelector('.map-container') as HTMLElement | null,
        [instance],
    );

    useEffect(() => {
        if (!instance?.container) return;

        const containerEle = instance.container.querySelector('.map-container') as HTMLElement;
        if (!containerEle) return;

        const provider = collaborationService.getProviderSafe();
        if (!provider) return; // Offline mode

        // ── 1. Listen for awareness updates to update remote cursors ──
        const handleAwarenessChange = () => {
            const states = Array.from(provider.awareness.getStates().entries());
            const currentClientId = provider.awareness.clientID;
            
            const activeCursors = states
                .filter(([clientId]) => clientId !== currentClientId) // Exclude self
                .map(([clientId, state]) => ({
                    clientId,
                    user: state.user,
                    cursor: state.cursor || null,
                }))
                .filter(c => c.cursor && c.user); // Only show if they have cursor data

            setCursors(activeCursors as CursorState[]);
        };

        provider.awareness.on('change', handleAwarenessChange);

        // ── 2. Track local cursor and broadcast to others ──
        const handleMouseMove = (e: MouseEvent) => {
            if (!containerEle) return;
            
            // We need to send coordinates relative to the map-container's local space.
            // map-container has transform: translate(x,y) scale(s)
            // It's easier to just calculate the exact relative offset.
            
            const rect = containerEle.getBoundingClientRect();
            // Invert the scale to get true local coordinates
            const scale = instance.scaleVal || 1;
            
            // X and Y relative to the top-left of the scaled container
            const localX = (e.clientX - rect.left) / scale;
            const localY = (e.clientY - rect.top) / scale;

            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            frameRef.current = requestAnimationFrame(() => {
                provider.awareness.setLocalStateField('cursor', { x: localX, y: localY });
            });
        };

        const handleMouseLeave = () => {
            provider.awareness.setLocalStateField('cursor', null);
        };

        instance.container.addEventListener('mousemove', handleMouseMove);
        instance.container.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            provider.awareness.off('change', handleAwarenessChange);
            instance.container.removeEventListener('mousemove', handleMouseMove);
            instance.container.removeEventListener('mouseleave', handleMouseLeave);
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [instance]);

    if (!mapContainer || cursors.length === 0) return null;

    const overlay = (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
            {cursors.map(c => (
                <div
                    key={c.clientId}
                    style={{
                        position: 'absolute',
                        left: c.cursor!.x,
                        top: c.cursor!.y,
                        transform: 'translate(-2px, -2px)', // offset arrow point slightly
                        transition: 'left 0.1s linear, top 0.1s linear',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 2
                    }}
                >
                    {/* Cursor Arrow SVG */}
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill={c.user.color}
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}
                    >
                        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                    </svg>

                    {/* Nametag */}
                    <div style={{
                        background: c.user.color,
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '0 8px 8px 8px',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    }}>
                        {c.user.name}
                    </div>
                </div>
            ))}
        </div>
    );

    return createPortal(overlay, mapContainer);
}
