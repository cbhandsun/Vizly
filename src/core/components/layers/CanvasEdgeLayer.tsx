import React, { useEffect, useRef, memo } from 'react';
import { useStore, useReactFlow, ReactFlowState, Edge, Node } from '@xyflow/react';
import { getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/react';


// Selector to get nodes, edges, transform, and real-time drag state
const selector = (state: any) => ({
    nodes: state.nodes,
    edges: state.edges,
    transform: state.transform,
    nodesDragging: state.nodesDragging, // Track if nodes are being dragged
    nodeInternals: state.nodeInternals  // Get real-time node positions during drag
});

/**
 * Canvas Edge Layer
 * 
 * Renders edges using HTML5 Canvas 2D Context for high performance.
 * This skips the DOM overhead of thousands of SVG elements.
 * 
 * Usage:
 * Place this component inside <ReactFlow>.
 * Ensure standard edges are hidden or use a 'null' edge type to prevent double rendering.
 */
const CanvasEdgeLayer = memo(() => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { nodes, edges, transform, nodesDragging, nodeInternals } = useStore(selector);
    const [x, y, zoom] = transform;

    // Redraw whenever nodes/edges/transform/drag state changes
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        // Resize canvas if needed (to match container)
        // We check logical size (CSS) vs buffer size
        const targetWidth = rect.width * dpr;
        const targetHeight = rect.height * dpr;

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
        }

        // Reset transform to identity for clearing
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Apply viewport transform (Global Zoom/Pan)
        // Note: React Flow transform is [x, y, zoom]. 
        // Canvas transform is (scaleX, skewY, skewX, scaleY, tx, ty).
        ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, x * dpr, y * dpr);

        // Common styles
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw Edges
        edges.forEach((edge: Edge) => {
            if (edge.hidden) return;

            // Use nodeInternals for real-time positions during drag
            const sourceNode = nodeInternals?.get(edge.source);
            const targetNode = nodeInternals?.get(edge.target);

            if (!sourceNode || !targetNode) return;

            // Resolve effective type (handle swapped type for canvas mode)
            const edgeType = (edge.data?.originalType as string) || edge.type || 'default';

            let pathString = '';

            // 1. Prefer Worker Pre-calculated path (P1)
            if (edge.data?.workerPath) {
                pathString = edge.data.workerPath as string;
            }
            // 2. Fallback: Calculate simple bezier/straight (P2)
            // Note: Accurate calculation requires exact handle positions which are complex to resolve here 
            // without internal React Flow helpers.
            // For MVP, if worker path is missing, we might skip or draw a simple line center-to-center.
            // However, BaseReactFlow usually ensures "Smart" edges have worker paths.
            // Native edges might not.
            else {
                // Simplified fallback for native edges calculation
                // We use internal positions + simple center fallback if handles obscure
                const sx = (sourceNode.position?.x ?? 0) + (sourceNode.measured?.width ?? 150) / 2;
                const sy = (sourceNode.position?.y ?? 0) + (sourceNode.measured?.height ?? 40) / 2;
                const tx = (targetNode.position?.x ?? 0) + (targetNode.measured?.width ?? 150) / 2;
                const ty = (targetNode.position?.y ?? 0) + (targetNode.measured?.height ?? 40) / 2;

                const [path] = getStraightPath({
                    sourceX: sx,
                    sourceY: sy,
                    targetX: tx,
                    targetY: ty
                });
                pathString = path;
            }

            // Draw Path
            if (pathString) {
                const strokeColor = (edge.style?.stroke as string) || '#b1b1b7';
                const strokeWidth = Number(edge.style?.strokeWidth) || 1.5;

                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = strokeWidth;

                // Highlight states overrides
                if (edge.selected) {
                    ctx.strokeStyle = '#3b82f6'; // Brand blue
                    ctx.lineWidth = 2.5;
                    // Add glow effect for selected
                    ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
                    ctx.shadowBlur = 4;
                } else {
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                }

                const p2d = new Path2D(pathString);
                ctx.stroke(p2d);
            }
        });

    }, [nodes, edges, x, y, zoom, nodesDragging, nodeInternals]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none', // Let clicks pass through to nodes
                zIndex: 0 // Behind nodes (Nodes are usually zIndex 1000 in RF)
            }}
        />
    );
});

export default CanvasEdgeLayer;
