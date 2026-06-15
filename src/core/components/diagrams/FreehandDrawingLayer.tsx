import React, { useState } from 'react';
import { getStroke } from 'perfect-freehand';

interface DrawingOptions {
    size: number;
    thinning: number;
    smoothing: number;
    streamline: number;
    easing: (t: number) => number;
    start: {
        taper: number;
        easing: (t: number) => number;
        cap: boolean;
    };
    end: {
        taper: number;
        easing: (t: number) => number;
        cap: boolean;
    };
}

const defaultOptions: DrawingOptions = {
    size: 4,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t: number) => t,
    start: { taper: 0, easing: (t: number) => t, cap: true },
    end: { taper: 0, easing: (t: number) => t, cap: true },
};

export interface FreehandDrawingLayerProps {
    isDrawingMode: boolean;
    currentColor?: string;
    onDrawEnd?: (stroke: any) => void;
    // zoom and pan data if available from ReactFlow viewport
    zoom?: number;
    pan?: { x: number; y: number };
}

export const FreehandDrawingLayer: React.FC<FreehandDrawingLayerProps> = ({
    isDrawingMode,
    currentColor = '#000000',
    onDrawEnd,
    zoom = 1,
    pan = { x: 0, y: 0 }
}) => {
    // Current ongoing stroke
    const [currentStroke, setCurrentStroke] = useState<number[][]>([]);
    // All completed strokes (for local rendering until passed up)
    const [strokes, setStrokes] = useState<{ points: number[][]; color: string }[]>([]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isDrawingMode) return;
        // Don't draw with right click or middle click
        if (e.button !== 0) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;
        
        setCurrentStroke([[x, y, e.pressure]]);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDrawingMode || currentStroke.length === 0) return;
        if (e.buttons !== 1) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;
        
        setCurrentStroke(prev => [...prev, [x, y, e.pressure]]);
    };

    const handlePointerUp = () => {
        if (!isDrawingMode || currentStroke.length === 0) return;
        
        const newStroke = { points: currentStroke, color: currentColor };
        setStrokes(prev => [...prev, newStroke]);
        
        if (onDrawEnd) {
            onDrawEnd(newStroke);
        }
        
        setCurrentStroke([]);
    };

    // Calculate SVG path data using perfect-freehand
    const getSvgPathFromStroke = (strokePoints: number[][]) => {
        if (!strokePoints.length) return '';
        
        const strokeData = getStroke(strokePoints, defaultOptions);
        const d = strokeData.reduce(
            (acc, [x0, y0], i, arr) => {
                const [x1, y1] = arr[(i + 1) % arr.length];
                return `${acc} Q ${x0} ${y0} ${Math.round((x0 + x1) / 2)} ${Math.round((y0 + y1) / 2)}`;
            },
            `M ${strokeData[0][0]} ${strokeData[0][1]}`
        );
        return d + ' Z';
    };

    // If we're not actively drawing and there are no strokes, don't render anything
    if (!isDrawingMode && strokes.length === 0 && currentStroke.length === 0) {
        return null;
    }

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: isDrawingMode ? 'auto' : 'none',
                zIndex: isDrawingMode ? 10 : 5,
                touchAction: 'none'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <g style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                {strokes.map((stroke, i) => (
                    <path
                        key={i}
                        d={getSvgPathFromStroke(stroke.points)}
                        fill={stroke.color}
                    />
                ))}
                {currentStroke.length > 0 && (
                    <path
                        d={getSvgPathFromStroke(currentStroke)}
                        fill={currentColor}
                    />
                )}
            </g>
        </svg>
    );
};
