import { useState, useRef, useCallback, useEffect } from 'react';
import {
    readMinimapMinimized,
    readMinimapOffset,
    readMinimapSize,
    writeMinimapMinimized,
    writeMinimapOffset,
    writeMinimapSize,
    type MinimapOffset,
    type MinimapSize,
} from '../../../utils/minimapOverlayStorage';

export function useMinimapOverlay(
    defaultSize: MinimapSize = 'large',
    containerRef: React.RefObject<HTMLDivElement | null>
) {
    const [isMinimized, setIsMinimized] = useState<boolean>(() => {
        return readMinimapMinimized();
    });

    const [currentSize, setCurrentSize] = useState<MinimapSize>(() => {
        return readMinimapSize(defaultSize);
    });

    const [offset, setOffset] = useState<MinimapOffset>(() => {
        return readMinimapOffset();
    });

    const [isDragging, setIsDragging] = useState(false);

    const dragStartRef = useRef({ x: 0, y: 0, startOffsetLeft: 0, startOffsetBottom: 0 });

    useEffect(() => {
        writeMinimapMinimized(isMinimized);
    }, [isMinimized]);

    useEffect(() => {
        writeMinimapSize(currentSize);
    }, [currentSize]);

    useEffect(() => {
        writeMinimapOffset(offset);
    }, [offset]);

    const toggleMinimize = useCallback(() => setIsMinimized(prev => !prev), []);

    const cycleSize = useCallback(() => {
        const sizes: MinimapSize[] = ['small', 'medium', 'large'];
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
