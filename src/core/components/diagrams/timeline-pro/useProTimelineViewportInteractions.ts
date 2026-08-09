import { useCallback, useRef, useState, type RefObject } from 'react';
import type React from 'react';

import {
    getProTimelineKeyboardPanDelta,
    getProTimelineZoomedPanX,
    isProTimelinePanClick,
    normalizeProTimelineZoom,
} from './proTimelineViewportInteraction';

interface ProTimelineViewportInteractionOptions {
    clearSelection: () => void;
    panX: number;
    panY: number;
    setPan: (x: number, y: number) => void;
    setPanByDelta: (dx: number, dy: number) => void;
    setZoom: (zoom: number) => void;
    timelineRef: RefObject<HTMLDivElement | null>;
    zoomLevel: number;
}

interface PanPointerState {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
}

export function useProTimelineViewportInteractions({
    clearSelection,
    panX,
    panY,
    setPan,
    setPanByDelta,
    setZoom,
    timelineRef,
    zoomLevel,
}: ProTimelineViewportInteractionOptions) {
    const [isDragPan, setIsDragPan] = useState(false);
    const panPointerRef = useRef<PanPointerState | null>(null);

    const zoomAroundViewportPoint = useCallback((nextZoomInput: number, viewportAnchorX?: number) => {
        const nextZoom = normalizeProTimelineZoom(nextZoomInput);
        const rect = timelineRef.current?.getBoundingClientRect();
        const anchorX = typeof viewportAnchorX === 'number' && Number.isFinite(viewportAnchorX)
            ? viewportAnchorX
            : (rect?.width ?? 0) / 2;
        setPan(getProTimelineZoomedPanX(panX, zoomLevel, nextZoom, anchorX), panY);
        setZoom(nextZoom);
    }, [panX, panY, setPan, setZoom, timelineRef, zoomLevel]);

    const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            const rect = timelineRef.current?.getBoundingClientRect();
            const anchorX = rect ? event.clientX - rect.left : undefined;
            zoomAroundViewportPoint(zoomLevel - event.deltaY * 0.005, anchorX);
            return;
        }
        setPanByDelta(-event.deltaX, -event.deltaY);
    }, [setPanByDelta, timelineRef, zoomAroundViewportPoint, zoomLevel]);

    const isPanSurface = useCallback((target: EventTarget | null) => (
        target === timelineRef.current
        || (typeof HTMLElement !== 'undefined'
            && target instanceof HTMLElement
            && target.classList.contains('pro-timeline-bg'))
    ), [timelineRef]);

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isPanSurface(event.target) || event.button !== 0 || event.isPrimary === false) return;
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        panPointerRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
        };
        setIsDragPan(true);
    }, [isPanSurface]);

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const pointer = panPointerRef.current;
        if (!pointer || pointer.pointerId !== event.pointerId) return;
        const dx = event.clientX - pointer.lastX;
        const dy = event.clientY - pointer.lastY;
        pointer.lastX = event.clientX;
        pointer.lastY = event.clientY;
        if (dx !== 0 || dy !== 0) setPanByDelta(dx, dy);
    }, [setPanByDelta]);

    const finishPan = useCallback((event: React.PointerEvent<HTMLDivElement>, clearOnClick: boolean) => {
        const pointer = panPointerRef.current;
        if (!pointer || pointer.pointerId !== event.pointerId) return;
        if (clearOnClick && isProTimelinePanClick(pointer.startX, pointer.startY, event.clientX, event.clientY)) {
            clearSelection();
        }
        panPointerRef.current = null;
        setIsDragPan(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, [clearSelection]);

    const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        finishPan(event, true);
    }, [finishPan]);

    const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        finishPan(event, false);
    }, [finishPan]);

    const handleLostPointerCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (panPointerRef.current?.pointerId !== event.pointerId) return;
        panPointerRef.current = null;
        setIsDragPan(false);
    }, []);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        const panDelta = getProTimelineKeyboardPanDelta(event.key);
        if (panDelta) {
            event.preventDefault();
            setPanByDelta(panDelta.dx, panDelta.dy);
            return;
        }
        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomAroundViewportPoint(zoomLevel + 0.2);
        } else if (event.key === '-') {
            event.preventDefault();
            zoomAroundViewportPoint(zoomLevel - 0.2);
        } else if (event.key === '0') {
            event.preventDefault();
            zoomAroundViewportPoint(1);
        }
    }, [setPanByDelta, zoomAroundViewportPoint, zoomLevel]);

    return {
        handleKeyDown,
        handleLostPointerCapture,
        handlePointerCancel,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handleWheel,
        isDragPan,
        zoomAroundViewportPoint,
    };
}
