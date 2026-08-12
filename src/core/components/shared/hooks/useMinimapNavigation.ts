import { useState, useRef, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { computeMinimapBounds, safeNumber, lerp, easeOutCubic } from './useMinimapMath';
import { diagramConfigManager } from '@/core/config/DiagramConfig';
import {
    getFixedMiniMapPanDelta,
    parseFixedMiniMapKeyboardCommand,
} from '../fixedMiniMapKeyboard';

export function useMinimapNavigation(
    anchorRef: React.RefObject<HTMLDivElement | null>,
    minimapRef: React.RefObject<HTMLDivElement | null>,
    viewportForRender: { x: number; y: number; zoom: number },
    getUiScale: () => number
) {
    const reactFlowInstance = useReactFlow();

    const [isMinimapDragging, setIsMinimapDragging] = useState(false);
    const minimapDragStartRef = useRef({ x: 0, y: 0, startViewport: { x: 0, y: 0, zoom: 1 } });
    const minimapDownPosRef = useRef({ x: 0, y: 0 });
    const minimapMovedRef = useRef<boolean>(false);
    const lastMinimapDragEndTsRef = useRef<number>(0);
    const lastDragTargetRef = useRef<{ x: number; y: number; zoom: number } | null>(null);

    const rafIdRef = useRef<number | null>(null);
    const animTargetRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
    const animStartRef = useRef<{ x: number; y: number; zoom: number; t0: number } | null>(null);

    const cancelViewportAnimation = useCallback(() => {
        if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        animTargetRef.current = null;
        animStartRef.current = null;
    }, []);

    const animateViewportTo = useCallback((target: { x: number; y: number; zoom: number }, duration: number = 200) => {
        cancelViewportAnimation();
        const start = reactFlowInstance.getViewport();
        const t0 = performance.now();
        animTargetRef.current = target;
        animStartRef.current = { ...start, t0 };

        const step = () => {
            if (!animStartRef.current || !animTargetRef.current) return;
            const now = performance.now();
            const progress = Math.min(1, (now - animStartRef.current.t0) / duration);
            const e = easeOutCubic(progress);
            const x = lerp(animStartRef.current.x, animTargetRef.current.x, e);
            const y = lerp(animStartRef.current.y, animTargetRef.current.y, e);
            const zoom = lerp(animStartRef.current.zoom, animTargetRef.current.zoom, e);
            reactFlowInstance.setViewport({ x, y, zoom });
            if (progress < 1) {
                rafIdRef.current = requestAnimationFrame(step);
            } else {
                cancelViewportAnimation();
            }
        };
        rafIdRef.current = requestAnimationFrame(step);
    }, [reactFlowInstance, cancelViewportAnimation]);

    const getCanvasPixelSize = useCallback(() => {
        const rfRoot = (anchorRef.current?.closest?.('.react-flow') as HTMLElement | null) || (document.querySelector('.react-flow') as HTMLElement | null);
        const rendererEl = (rfRoot?.querySelector?.('.react-flow__renderer') as HTMLElement | null) || rfRoot;
        const uiScale = getUiScale();
        return {
            width: Math.max(1, (rendererEl?.clientWidth ?? 800) / uiScale),
            height: Math.max(1, (rendererEl?.clientHeight ?? 600) / uiScale)
        };
    }, [anchorRef, getUiScale]);

    const handleMinimapMouseDown = useCallback((event: React.MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target.closest('.minimap-controls') || target.closest('.minimap-drag-handle')) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        setIsMinimapDragging(true);
        minimapDragStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            startViewport: reactFlowInstance.getViewport()
        };
        minimapDownPosRef.current = { x: event.clientX, y: event.clientY };
        minimapMovedRef.current = false;
        lastDragTargetRef.current = null;
        
        cancelViewportAnimation();

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    }, [reactFlowInstance, cancelViewportAnimation]);

    const handleMinimapMouseMove = useCallback((e: MouseEvent) => {
        if (!isMinimapDragging) return;

        const deltaX = e.clientX - minimapDragStartRef.current.x;
        const deltaY = e.clientY - minimapDragStartRef.current.y;

        const minimapContainer = minimapRef.current;
        if (!minimapContainer) return;

        const minimapRect = minimapContainer.getBoundingClientRect();
        const nodes = reactFlowInstance.getNodes();
        if (nodes.length === 0) return;

        const canvasSize = getCanvasPixelSize();
        // [FIX] Use startViewport consistently for drag ratio — bounds must match
        // what was used when dragging started to keep ratio stable throughout drag
        const bounds = computeMinimapBounds(nodes, minimapDragStartRef.current.startViewport, canvasSize.width, canvasSize.height);
        if (!bounds) return;

        const xRatio = minimapRect.width > 0 ? deltaX / minimapRect.width : 0;
        const yRatio = minimapRect.height > 0 ? deltaY / minimapRect.height : 0;

        const zoom = safeNumber(minimapDragStartRef.current.startViewport.zoom, 1);
        const newX = safeNumber(minimapDragStartRef.current.startViewport.x - (xRatio * bounds.totalWidth * zoom), 0);
        const newY = safeNumber(minimapDragStartRef.current.startViewport.y - (yRatio * bounds.totalHeight * zoom), 0);

        const movedDist = Math.abs(e.clientX - minimapDownPosRef.current.x) + Math.abs(e.clientY - minimapDownPosRef.current.y);
        if (movedDist > 4) minimapMovedRef.current = true;

        lastDragTargetRef.current = { x: newX, y: newY, zoom };
        reactFlowInstance.setViewport({ x: newX, y: newY, zoom });
    }, [isMinimapDragging, reactFlowInstance, getCanvasPixelSize, minimapRef]);

    const handleMinimapMouseUp = useCallback(() => {
        if (!isMinimapDragging) return;
        cancelViewportAnimation();
        if (lastDragTargetRef.current) {
            const { x, y, zoom } = lastDragTargetRef.current;
            reactFlowInstance.setViewport({ x, y, zoom });
        }
        lastMinimapDragEndTsRef.current = Date.now();

        setIsMinimapDragging(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    }, [isMinimapDragging, reactFlowInstance, cancelViewportAnimation]);

    const handleMiniMapDirectNavigation = useCallback((event: React.MouseEvent, isOverlayDragging: boolean) => {
        if (isOverlayDragging) return;

        const target = event.target as HTMLElement;
        if (target.closest('.minimap-controls') || target.closest('.minimap-drag-handle')) return;

        const minimapContainer = minimapRef.current;
        if (!minimapContainer) return;

        const rect = minimapContainer.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const xRatio = rect.width > 0 ? x / rect.width : 0;
        const yRatio = rect.height > 0 ? y / rect.height : 0;

        const viewport = viewportForRender;
        const zoom = safeNumber(viewport.zoom, 1);

        const nodes = reactFlowInstance.getNodes();
        if (nodes.length === 0) return;

        const canvasSize = getCanvasPixelSize();
        const bounds = computeMinimapBounds(nodes, viewport, canvasSize.width, canvasSize.height);
        if (!bounds) return;

        const targetCenterX = safeNumber(bounds.unionMinX + bounds.totalWidth * xRatio, 0);
        const targetCenterY = safeNumber(bounds.unionMinY + bounds.totalHeight * yRatio, 0);

        const viewportCenterX = zoom > 0 ? targetCenterX - (canvasSize.width / 2 / zoom) : targetCenterX;
        const viewportCenterY = zoom > 0 ? targetCenterY - (canvasSize.height / 2 / zoom) : targetCenterY;

        const safeViewportX = safeNumber(-viewportCenterX * zoom, 0);
        const safeViewportY = safeNumber(-viewportCenterY * zoom, 0);

        animateViewportTo({ x: safeViewportX, y: safeViewportY, zoom }, 220);
    }, [reactFlowInstance, viewportForRender, animateViewportTo, getCanvasPixelSize, minimapRef]);

    const handleMiniMapClick = useCallback((event: React.MouseEvent, isOverlayDragging: boolean) => {
        event.stopPropagation();
        if (isOverlayDragging) return;

        const now = Date.now();
        if (minimapMovedRef.current || (now - lastMinimapDragEndTsRef.current) < 250) {
            return;
        }

        const target = event.target as HTMLElement;
        if (target.closest('.minimap-controls') || target.closest('.minimap-drag-handle')) {
            return;
        }

        handleMiniMapDirectNavigation(event, isOverlayDragging);
    }, [handleMiniMapDirectNavigation]);

    const handleMiniMapWheel = useCallback((event: WheelEvent) => {
        if (!minimapRef.current) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();

        const minimapRect = minimapRef.current.getBoundingClientRect();
        // Mouse position within the minimap (0..1 ratios)
        const mx = event.clientX - minimapRect.left;
        const my = event.clientY - minimapRect.top;
        const xRatio = minimapRect.width  > 0 ? mx / minimapRect.width  : 0.5;
        const yRatio = minimapRect.height > 0 ? my / minimapRect.height : 0.5;

        const viewport = reactFlowInstance.getViewport();
        const currentZoom = safeNumber(viewport.zoom, 1);

        // [FIX] Convert minimap ratio → world coordinate using the same bounds
        // the renderer uses, so the zoom anchor stays exactly under the cursor.
        const canvasSize = getCanvasPixelSize();
        const nodes = reactFlowInstance.getNodes();
        const bounds = nodes.length > 0
            ? computeMinimapBounds(nodes, viewport, canvasSize.width, canvasSize.height)
            : null;

        // World coordinate under the mouse in the minimap
        const anchorWorldX = bounds
            ? safeNumber(bounds.unionMinX + bounds.totalWidth  * xRatio, 0)
            : (xRatio * canvasSize.width  - viewport.x) / currentZoom;
        const anchorWorldY = bounds
            ? safeNumber(bounds.unionMinY + bounds.totalHeight * yRatio, 0)
            : (yRatio * canvasSize.height - viewport.y) / currentZoom;

        const cfg = diagramConfigManager.getConfig();
        const minZoomCfg = cfg.canvas?.zoom?.min ?? 0.05;
        const maxZoomCfg = cfg.canvas?.zoom?.max ?? 8;
        const sensitivity = cfg.canvas?.zoom?.sensitivity ?? 1;

        const normalizedDelta = Math.max(-80, Math.min(80, event.deltaY));
        const direction = -normalizedDelta;
        const zoomFactor = Math.exp(direction * (0.0025 * sensitivity));
        const targetZoom = Math.max(minZoomCfg, Math.min(maxZoomCfg, currentZoom * zoomFactor));

        // Preserve anchor world position after zoom change:
        //   newViewport.x = anchorScreenX - anchorWorldX * targetZoom
        // We want the anchor to stay at the same screen fraction of the canvas.
        const rfRoot = (anchorRef.current?.closest?.('.react-flow') as HTMLElement | null)
            || (document.querySelector('.react-flow') as HTMLElement | null);
        const pane = (rfRoot?.querySelector?.('.react-flow__pane') as HTMLElement | null) || rfRoot;
        const paneRect = pane?.getBoundingClientRect();
        // Map minimap ratio back to pane screen position for the anchor screen point
        const anchorScreenX = paneRect ? paneRect.left + xRatio * paneRect.width  - paneRect.left : xRatio * canvasSize.width;
        const anchorScreenY = paneRect ? paneRect.top  + yRatio * paneRect.height - paneRect.top  : yRatio * canvasSize.height;

        const targetX = anchorScreenX - anchorWorldX * targetZoom;
        const targetY = anchorScreenY - anchorWorldY * targetZoom;

        reactFlowInstance.setViewport({ x: targetX, y: targetY, zoom: targetZoom });
    }, [reactFlowInstance, minimapRef, anchorRef, getCanvasPixelSize]);

    const zoomIn = useCallback(() => {
        const viewport = reactFlowInstance.getViewport();
        const cfg = diagramConfigManager.getConfig();
        const maxZoomCfg = cfg.canvas?.zoom?.max ?? 8;
        animateViewportTo({
            ...viewport,
            zoom: Math.min(maxZoomCfg, viewport.zoom * 1.5)
        });
    }, [reactFlowInstance, animateViewportTo]);

    const zoomOut = useCallback(() => {
        const viewport = reactFlowInstance.getViewport();
        const cfg = diagramConfigManager.getConfig();
        const minZoomCfg = cfg.canvas?.zoom?.min ?? 0.05;
        animateViewportTo({
            ...viewport,
            zoom: Math.max(minZoomCfg, viewport.zoom / 1.5)
        });
    }, [reactFlowInstance, animateViewportTo]);

    const resetZoom = useCallback(() => {
        const viewport = reactFlowInstance.getViewport();
        animateViewportTo({ ...viewport, zoom: 1 });
    }, [reactFlowInstance, animateViewportTo]);

    const handleMiniMapKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        const command = parseFixedMiniMapKeyboardCommand(event.key);
        if (!command) return;

        event.preventDefault();
        event.stopPropagation();

        if (command === 'zoom-in') {
            zoomIn();
            return;
        }
        if (command === 'zoom-out') {
            zoomOut();
            return;
        }
        if (command === 'reset-zoom') {
            resetZoom();
            return;
        }

        const viewport = reactFlowInstance.getViewport();
        const canvasSize = getCanvasPixelSize();
        const delta = getFixedMiniMapPanDelta({
            command,
            canvasHeight: canvasSize.height,
            canvasWidth: canvasSize.width,
            largeStep: event.shiftKey,
        });
        if (!delta) return;
        cancelViewportAnimation();
        reactFlowInstance.setViewport({
            x: safeNumber(viewport.x + delta.x, 0),
            y: safeNumber(viewport.y + delta.y, 0),
            zoom: safeNumber(viewport.zoom, 1),
        });
    }, [cancelViewportAnimation, getCanvasPixelSize, reactFlowInstance, resetZoom, zoomIn, zoomOut]);

    return {
        isMinimapDragging,
        cancelViewportAnimation,
        handleMinimapMouseDown,
        handleMinimapMouseMove,
        handleMinimapMouseUp,
        handleMiniMapClick,
        handleMiniMapKeyDown,
        handleMiniMapWheel,
        zoomIn,
        zoomOut,
        resetZoom
    };
}
