import { useState, useRef, useCallback, useEffect } from 'react';

interface OverlayState {
    isMinimized: boolean;
    currentSize: 'small' | 'medium' | 'large';
    position: { left: number; bottom: number };
    isDragging: boolean;
}

export function useMinimapOverlay(
    defaultSize: 'small' | 'medium' | 'large' = 'large',
    containerRef: React.RefObject<HTMLDivElement | null>
) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [currentSize, setCurrentSize] = useState<'small' | 'medium' | 'large'>(defaultSize);
    const [position, setPosition] = useState({ bottom: 76, left: 24 });
    const [isDragging, setIsDragging] = useState(false);

    const dragStartRef = useRef({ x: 0, y: 0, startLeft: 0, startBottom: 0 });

    const toggleMinimize = useCallback(() => setIsMinimized(prev => !prev), []);

    const cycleSize = useCallback(() => {
        const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
        setCurrentSize(prev => sizes[(sizes.indexOf(prev) + 1) % sizes.length]);
    }, []);

    const handleDragStart = useCallback((e: React.MouseEvent, cancelViewportAnimation: () => void) => {
        if (isMinimized) return;
        const target = e.target as HTMLElement;

        if (target.closest('.minimap-controls')) return;

        const isMiniMapContent = target.closest('.react-flow__minimap') ||
            target.tagName.toLowerCase() === 'svg' ||
            target.tagName.toLowerCase() === 'rect' ||
            target.tagName.toLowerCase() === 'path';

        if (isMiniMapContent) return;

        e.preventDefault();
        e.stopPropagation();

        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            startLeft: position.left,
            startBottom: position.bottom
        };
        
        cancelViewportAnimation();

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    }, [isMinimized, position]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;

        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        const newLeft = dragStartRef.current.startLeft + deltaX;
        const newBottom = dragStartRef.current.startBottom - deltaY;

        const getParentSize = () => {
            const parent = containerRef.current?.offsetParent as HTMLElement;
            if (parent) return { width: parent.clientWidth, height: parent.clientHeight };
            return { width: window.innerWidth, height: window.innerHeight };
        };

        const rect = containerRef.current?.getBoundingClientRect();
        const containerWidth = rect?.width || 240;
        const containerHeight = rect?.height || 180;
        const { width: parentWidth, height: parentHeight } = getParentSize();

        const minLeft = 10;
        const maxLeft = parentWidth - containerWidth - 10;
        const minBottom = 10;
        const maxBottom = parentHeight - containerHeight - 10;

        setPosition({
            left: Math.max(minLeft, Math.min(newLeft, maxLeft)),
            bottom: Math.max(minBottom, Math.min(newBottom, maxBottom))
        });
    }, [isDragging, containerRef]);

    const handleMouseUp = useCallback((cancelViewportAnimation: () => void) => {
        if (!isDragging) return;
        cancelViewportAnimation();
        setIsDragging(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    }, [isDragging]);

    return {
        isMinimized, toggleMinimize,
        currentSize, cycleSize,
        position, setPosition,
        isDragging, handleDragStart, handleMouseMove, handleMouseUp
    };
}
