/**
 * SharedTrunkLayer
 *
 * Renders the shared trunk segment for M2O / O2M edge groups as a single
 * SVG path overlaid on the ReactFlow canvas.
 *
 * Why a separate layer:
 *   Instead of N overlapping edge paths (which may have sub-pixel y differences
 *   from rounding, nudge, or fillet rendering), we extract the shared
 *   horizontal/vertical trunk portion ONCE and draw it as a single authoritative
 *   SVG path. Individual edge paths are trimmed to branch-only stubs that connect
 *   source → trunk junction, with no arrowhead. The trunk layer carries the
 *   arrowhead at the hub entry point.
 *
 * Placement: Mount this component inside the ReactFlow <ReactFlowProvider>
 * tree, using useStore to access the current viewport transform so coordinates
 * are kept in sync with pan/zoom.
 */

import React, { useMemo } from 'react';
import { useStore } from '@xyflow/react';
import type { SharedTrunkSegment } from '../../../types/routing';

interface SharedTrunkLayerProps {
    trunks: SharedTrunkSegment[];
    /** Stroke color for the trunk. Defaults to the standard edge color. */
    color?: string;
    /** Stroke width. Defaults to 1.5 (slightly thicker than branch stubs). */
    strokeWidth?: number;
}

export const SharedTrunkLayer: React.FC<SharedTrunkLayerProps> = ({
    trunks,
    color = '#94a3b8',
    strokeWidth = 1.5,
}) => {
    // Read current viewport transform from the ReactFlow store so the SVG
    // overlay stays aligned when the user pans / zooms.
    const transform = useStore((s) => s.transform);
    const [tx, ty, zoom] = transform;

    const markerUrl = `url(#trunk-arrow)`;

    const paths = useMemo(() => trunks.filter(t => t.path && t.points.length >= 2), [trunks]);

    if (paths.length === 0) return null;

    return (
        <svg
            className="shared-trunk-layer"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',   // Non-interactive — edges handle selection
                overflow: 'visible',
                zIndex: 3,               // Just above edge layer (z-index 2 typically)
            }}
        >
            <defs>
                {/* Arrowhead marker matching the standard edge arrowhead */}
                <marker
                    id="trunk-arrow"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path d="M0,0 L0,6 L9,3 z" fill={color} />
                </marker>
            </defs>

            <g transform={`translate(${tx},${ty}) scale(${zoom})`}>
                {paths.map((trunk) => (
                    <path
                        key={trunk.id}
                        d={trunk.path}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        markerEnd={markerUrl}
                        opacity={0.85}
                    />
                ))}
            </g>
        </svg>
    );
};

export default SharedTrunkLayer;
