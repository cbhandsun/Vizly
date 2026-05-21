import { useState, useRef, useCallback, useEffect } from 'react';

interface Offset {
    left: number;
    bottom: number;
}

export function useMinimapOverlay(
    defaultSize: 'small' | 'medium' | 'large' = 'large',
    containerRef: React.RefObject<HTMLDivElement | null>
) {
    const [isMinimized, setIsMinimized] = useState<boolean>(() => {
        try {
            return localStorage.getItem('designer.minimap.minimized') === 'true';
        } catch {
            return false;
        }
    });

    const [currentSize, setCurrentSize] = useState<'small' | 'medium' | 'large'>(() => {
        try {
            const saved = localStorage.getItem('designer.minimap.size');
            return (saved === 'small' || saved === 'medium' || saved === 'large') ? saved : defaultSize;
        } catch {
            return defaultSize;
        }
    });

    const [offset, setOffset] = useState<Offset>(() => {
        try {
            const saved = localStorage.getItem('designer.minimap.offset');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (typeof parsed.left === 'number' && typeof parsed.bottom === 'number') {
                    return parsed;
                }
            }
        } catch {}
        return { bottom: 76, left: 24 };
    });

    const [isDragging, setIsDragging] = useState(false);

    const dragStartRef = useRef({ x: 0, y: 0, startOffsetLeft: 0, startOffsetBottom: 0 });

    useEffect(() => {
        try {
            localStorage.setItem('designer.minimap.minimized', String(isMinimized));
        } catch {}
    }, [isMinimized]);

    useEffect(() => {
        try {
            localStorage.setItem('designer.minimap.size', currentSize);
        } catch {}
    }, [currentSize]);

    useEffect(() => {
        try {
            localStorage.setItem('designer.minimap.offset', JSON.stringify(offset));
        } catch {}
    }, [offset]);

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
            startOffsetLeft: offset.left,
            startOffsetBottom: offset.bottom
        };
        
        cancelViewportAnimation();

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    }, [isMinimized, offset]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;

        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        const newOffsetLeft = dragStartRef.current.startOffsetLeft + deltaX;
        const newOffsetBottom = dragStartRef.current.startOffsetBottom - deltaY;

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

        setOffset({
            left: Math.max(minLeft, Math.min(newOffsetLeft, maxLeft)),
            bottom: Math.max(minBottom, Math.min(newOffsetBottom, maxBottom))
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
        offset, setOffset,
        isDragging, handleDragStart, handleMouseMove, handleMouseUp
    };
}
