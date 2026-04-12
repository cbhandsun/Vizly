import { EdgeProps } from '@xyflow/react';

/**
 * Canvas Reference Edge
 * 
 * This component renders NOTHING (null).
 * It is used in "Canvas Hybrid Mode" to replace standard SVG edges.
 * The actual visual representation is handled by the <CanvasEdgeLayer />.
 * 
 * Keeping this component registered allows React Flow to:
 * 1. Maintain the logical graph connection.
 * 2. Handle layout and handles correctly? (Handles are on nodes, so yes).
 * 3. Avoid DOM overhead of thousands of SVG paths.
 */
export function CanvasRefEdge(_props: EdgeProps) {
    return null;
}
