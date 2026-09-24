import { useState, useRef, useCallback, useEffect } from 'react';
import { clampDraggablePanelPosition } from './draggablePanelPosition';

interface UseDraggablePanelOptions {
    initialPosition?: { x: number; y: number };
    viewportInset?: number;
}

export const useDraggablePanel = ({
    initialPosition = { x: 0, y: 0 },
    viewportInset = 16,
}: UseDraggablePanelOptions = {}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [panelPosition, setPanelPosition] = useState(initialPosition);

    const panelRef = useRef<HTMLDivElement>(null);
    const dragOffsetRef = useRef({ x: 0, y: 0 });
    const rafPendingRef = useRef(false);
    const nextPosRef = useRef<{ x: number; y: number } | null>(null);

    const clampToViewport = useCallback((position: { x: number; y: number }) => {
        const panel = panelRef.current;
        return clampDraggablePanelPosition({
            ...position,
            panelWidth: panel?.offsetWidth ?? 0,
            panelHeight: panel?.offsetHeight ?? 0,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            inset: viewportInset,
        });
    }, [viewportInset]);

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        setIsDragging(true);

        if (panelRef.current) {
            try {
                panelRef.current.setPointerCapture(e.pointerId);
            } catch {
                // Ignore if setPointerCapture fails
            }
        }

        dragOffsetRef.current = {
            x: e.clientX - panelPosition.x,
            y: e.clientY - panelPosition.y,
        };
    }, [panelPosition]);

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (!isDragging || !panelRef.current) return;

        const { x, y } = dragOffsetRef.current;
        nextPosRef.current = clampToViewport({ x: e.clientX - x, y: e.clientY - y });

        if (!rafPendingRef.current) {
            rafPendingRef.current = true;
            requestAnimationFrame(() => {
                rafPendingRef.current = false;
                const next = nextPosRef.current;
                if (next && panelRef.current) {
                    panelRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
                }
            });
        }
    }, [clampToViewport, isDragging]);

    const handlePointerUp = useCallback(() => {
        setIsDragging(false);

        if (panelRef.current) {
            try {
                if (document.activeElement === panelRef.current) {
                    // simple check, though releasePointerCapture usually takes pointerId. 
                    // In React synthetic events usage or raw DOM usage it varies. 
                    // The original code used (window as any).lastPointerId which is risky.
                    // Better to just let it release naturally or capture the ID in down event.
                    // However, standard behavior is implicit release on up.
                }
            } catch {
                // ignore
            }
        }

        if (panelRef.current) {
            const style = window.getComputedStyle(panelRef.current);
            const transform = style.transform;
            if (transform && transform !== 'none') {
                const matrix = new DOMMatrixReadOnly(transform);
                setPanelPosition(clampToViewport({ x: matrix.m41, y: matrix.m42 }));
            } else {
                setPanelPosition(clampToViewport({ x: 0, y: 0 }));
            }
        }
    }, [clampToViewport]);

    useEffect(() => {
        const keepPanelVisible = () => {
            setPanelPosition(current => clampToViewport(current));
        };
        keepPanelVisible();
        window.addEventListener('resize', keepPanelVisible);
        return () => window.removeEventListener('resize', keepPanelVisible);
    }, [clampToViewport]);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('pointermove', handlePointerMove, { passive: true });
            document.addEventListener('pointerup', handlePointerUp);
            document.addEventListener('pointercancel', handlePointerUp);
        } else {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
            document.removeEventListener('pointercancel', handlePointerUp);
        }
        return () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
            document.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [isDragging, handlePointerMove, handlePointerUp]);

    // Sync initial/state position to DOM when not dragging
    useEffect(() => {
        if (!isDragging && panelRef.current) {
            panelRef.current.style.transform = `translate3d(${panelPosition.x}px, ${panelPosition.y}px, 0)`;
        }
    }, [isDragging, panelPosition]);

    return {
        panelRef,
        isDragging,
        handlePointerDown,
        panelPosition
    };
};
