import React, { useCallback, useState } from 'react';

import {
    coerceFreehandStroke,
    DEFAULT_FREEHAND_COLOR,
    DEFAULT_FREEHAND_SIZE,
    getFreehandSvgPath,
    MAX_FREEHAND_POINTS,
    type FreehandPoint,
    type FreehandStroke,
} from './freehandStrokeModel';

export interface FreehandDrawingLayerProps {
    isDrawingMode: boolean;
    currentColor?: string;
    onDrawEnd?: (stroke: FreehandStroke) => void;
    zoom?: number;
    pan?: { x: number; y: number };
}

const coerceViewportNumber = (value: number | undefined, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

export const FreehandDrawingLayer: React.FC<FreehandDrawingLayerProps> = ({
    isDrawingMode,
    currentColor = DEFAULT_FREEHAND_COLOR,
    onDrawEnd,
    zoom = 1,
    pan = { x: 0, y: 0 },
}) => {
    const [currentStroke, setCurrentStroke] = useState<FreehandPoint[]>([]);

    const readPoint = useCallback((event: React.PointerEvent<SVGSVGElement>): FreehandPoint => {
        const rect = event.currentTarget.getBoundingClientRect();
        const safeZoom = Math.max(0.01, coerceViewportNumber(zoom, 1));
        const panX = coerceViewportNumber(pan.x, 0);
        const panY = coerceViewportNumber(pan.y, 0);
        return [
            (event.clientX - rect.left - panX) / safeZoom,
            (event.clientY - rect.top - panY) / safeZoom,
            Number.isFinite(event.pressure) ? event.pressure : 0.5,
        ];
    }, [pan.x, pan.y, zoom]);

    const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        if (!isDrawingMode || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setCurrentStroke([readPoint(event)]);
    }, [isDrawingMode, readPoint]);

    const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        if (!isDrawingMode || event.buttons !== 1) return;
        const point = readPoint(event);
        setCurrentStroke(previous => {
            if (previous.length === 0 || previous.length >= MAX_FREEHAND_POINTS) return previous;
            const last = previous[previous.length - 1];
            if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.5) return previous;
            return [...previous, point];
        });
    }, [isDrawingMode, readPoint]);

    const releasePointer = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        releasePointer(event);
        if (!isDrawingMode || currentStroke.length === 0) return;
        const stroke = coerceFreehandStroke({
            points: currentStroke,
            color: currentColor,
            size: DEFAULT_FREEHAND_SIZE,
        });
        setCurrentStroke([]);
        if (stroke) onDrawEnd?.(stroke);
    }, [currentColor, currentStroke, isDrawingMode, onDrawEnd, releasePointer]);

    const handlePointerCancel = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        releasePointer(event);
        setCurrentStroke([]);
    }, [releasePointer]);

    const previewStroke = coerceFreehandStroke({
        points: currentStroke,
        color: currentColor,
        size: DEFAULT_FREEHAND_SIZE,
    });
    if (!isDrawingMode && currentStroke.length === 0) return null;

    return (
        <svg
            role="application"
            aria-label="自由画笔画布，按 Esc 退出"
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: isDrawingMode ? 'auto' : 'none',
                zIndex: 10,
                touchAction: 'none',
                cursor: isDrawingMode ? 'crosshair' : 'default',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
        >
            {previewStroke && (
                <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                    <path d={getFreehandSvgPath(previewStroke)} fill={previewStroke.color} />
                </g>
            )}
        </svg>
    );
};
