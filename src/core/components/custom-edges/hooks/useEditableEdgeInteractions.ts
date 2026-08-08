import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Position } from '@xyflow/react';
import {
    generateOrthogonalPath,
    Waypoint as OrthogonalWaypoint,
    type OrthogonalPathResult,
    type Segment,
} from '../../../utils/orthogonalPath';
import { getUiScale } from '../../shared/viewportStore';
import type { Waypoint } from '../EditableEdge';
type BendPoint = OrthogonalPathResult['bendPoints'][number];

const keyboardDelta = (event: React.KeyboardEvent<Element>) => {
    const step = event.shiftKey ? 10 : 1;
    switch (event.key) {
        case 'ArrowLeft': return { x: -step, y: 0 };
        case 'ArrowRight': return { x: step, y: 0 };
        case 'ArrowUp': return { x: 0, y: -step };
        case 'ArrowDown': return { x: 0, y: step };
        default: return null;
    }
};

export interface UseEditableEdgeInteractionsProps {
    id: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: Position;
    targetPosition: Position;
    waypoints: Waypoint[];
    viewport: { x: number; y: number; zoom: number };
    edgeCallbacks: {
        onWaypointsChange: (id: string, wp: Waypoint[]) => void;
        onLabelChange: (id: string, label: string) => void;
    };
    initialLabel?: string;
}

export function useEditableEdgeInteractions({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    waypoints,
    viewport,
    edgeCallbacks,
    initialLabel
}: UseEditableEdgeInteractionsProps) {
    const [draftWaypoints, setDraftWaypoints] = useState<Waypoint[] | null>(null);
    const localWaypoints = draftWaypoints ?? waypoints;

    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

    const [draggingSegment, setDraggingSegment] = useState<{
        segIndex: number;
        isHorizontal: boolean;
        startPointIdx: number;
        endPointIdx: number;
        initialMousePos: { x: number; y: number };
    } | null>(null);

    const segmentRafIdRef = useRef<number | null>(null);
    const snapshotPointsRef = useRef<Waypoint[]>([]);

    const [isEditingLabel, setIsEditingLabel] = useState(false);
    const [editingLabelValue, setEditingLabelValue] = useState(initialLabel || '');

    const rafIdRef = useRef<number | null>(null);

    const screenToFlowPosition = useCallback((clientX: number, clientY: number) => {
        const uiScale = getUiScale();
        return {
            x: (clientX / uiScale - viewport.x) / viewport.zoom,
            y: (clientY / uiScale - viewport.y) / viewport.zoom,
        };
    }, [viewport.x, viewport.y, viewport.zoom]);

    const pathResult = useMemo(() => {
        return generateOrthogonalPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            waypoints: localWaypoints as OrthogonalWaypoint[],
            sourcePosition,
            targetPosition,
        });
    }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, localWaypoints]);

    const edgePath = pathResult.pathData;
    const bendPoints = pathResult.bendPoints;
    const segments = useMemo(() => {
        return pathResult.segments || [];
    }, [pathResult.segments]);

    const labelPos = (() => {
        if (segments.length === 0) {
            return { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
        }
        let totalLen = 0;
        const segLens: number[] = [];
        for (const seg of segments) {
            const len = Math.hypot(seg.end.x - seg.start.x, seg.end.y - seg.start.y);
            segLens.push(len);
            totalLen += len;
        }
        let halfLen = totalLen / 2;
        for (let i = 0; i < segments.length; i++) {
            if (halfLen <= segLens[i]) {
                const t = segLens[i] > 0 ? halfLen / segLens[i] : 0;
                return {
                    x: segments[i].start.x + t * (segments[i].end.x - segments[i].start.x),
                    y: segments[i].start.y + t * (segments[i].end.y - segments[i].start.y),
                };
            }
            halfLen -= segLens[i];
        }
        const last = segments[segments.length - 1];
        return { x: (last.start.x + last.end.x) / 2, y: (last.start.y + last.end.y) / 2 };
    })();

    const handleBendPointPointerDown = useCallback((index: number, _bp: BendPoint, e: React.PointerEvent<Element>) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraggingIndex(index);
    }, []);

    const handleBendPointPointerMove = useCallback((e: React.PointerEvent<Element>) => {
        if (draggingIndex === null) return;
        if (rafIdRef.current !== null) return;

        rafIdRef.current = requestAnimationFrame(() => {
            try {
                const bp = bendPoints[draggingIndex];
                if (!bp) return;

                const flowPos = screenToFlowPosition(e.clientX, e.clientY);
                if (isNaN(flowPos.x) || isNaN(flowPos.y)) return;

                const newWaypoints = [...localWaypoints];
                if (bp.isWaypoint && bp.waypointIndex !== undefined) {
                    newWaypoints[bp.waypointIndex] = flowPos;
                } else {
                    newWaypoints.push(flowPos);
                }
                setDraftWaypoints(newWaypoints);
            } finally {
                rafIdRef.current = null;
            }
        });
    }, [draggingIndex, bendPoints, localWaypoints, screenToFlowPosition]);

    const handleBendPointPointerUp = useCallback((e: React.PointerEvent<Element>) => {
        if (draggingIndex !== null) {
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (edgeCallbacks?.onWaypointsChange) {
                edgeCallbacks.onWaypointsChange(id, localWaypoints);
            }
        }
        setDraggingIndex(null);
        setDraftWaypoints(null);
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
    }, [draggingIndex, localWaypoints, edgeCallbacks, id]);

    const handleBendPointKeyDown = useCallback((_index: number, bp: BendPoint, event: React.KeyboardEvent<Element>) => {
        const delta = keyboardDelta(event);
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();

        const nextWaypoints = [...waypoints];
        const moved = { x: bp.x + delta.x, y: bp.y + delta.y };
        if (bp.isWaypoint && bp.waypointIndex !== undefined) {
            nextWaypoints[bp.waypointIndex] = moved;
        } else {
            nextWaypoints.push(moved);
        }
        edgeCallbacks.onWaypointsChange(id, nextWaypoints);
    }, [edgeCallbacks, id, waypoints]);

    const handleSegmentPointerDown = useCallback((index: number, seg: Segment, e: React.PointerEvent<Element>) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        
        const allPoints: Waypoint[] = [];
        if (segments.length > 0) {
            allPoints.push({ x: segments[0].start.x, y: segments[0].start.y });
            for (const s of segments) {
                allPoints.push({ x: s.end.x, y: s.end.y });
            }
        }

        const middlePoints = allPoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));
        snapshotPointsRef.current = middlePoints;

        setDraftWaypoints(middlePoints);

        setDraggingSegment({
            segIndex: index,
            isHorizontal: seg.isHorizontal,
            startPointIdx: index - 1,
            endPointIdx: index,
            initialMousePos: { x: e.clientX, y: e.clientY }
        });
    }, [segments]);

    const handleSegmentPointerMove = useCallback((e: React.PointerEvent<Element>) => {
        if (!draggingSegment) return;
        if (segmentRafIdRef.current !== null) return;

        segmentRafIdRef.current = requestAnimationFrame(() => {
            const { startPointIdx, endPointIdx, isHorizontal, initialMousePos } = draggingSegment;

            let uiScale = getUiScale();
            if (typeof uiScale !== 'number' || !isFinite(uiScale) || uiScale <= 0) {
                 uiScale = 1;
            }

            const flowDeltaX = (e.clientX - initialMousePos.x) / uiScale / viewport.zoom;
            const flowDeltaY = (e.clientY - initialMousePos.y) / uiScale / viewport.zoom;
            
            const updatedWaypoints = snapshotPointsRef.current.map(p => ({ ...p }));

            if (isHorizontal) {
                if (startPointIdx >= 0 && startPointIdx < updatedWaypoints.length) {
                    updatedWaypoints[startPointIdx].y = snapshotPointsRef.current[startPointIdx].y + flowDeltaY;
                }
                if (endPointIdx >= 0 && endPointIdx < updatedWaypoints.length) {
                    updatedWaypoints[endPointIdx].y = snapshotPointsRef.current[endPointIdx].y + flowDeltaY;
                }
            } else {
                if (startPointIdx >= 0 && startPointIdx < updatedWaypoints.length) {
                    updatedWaypoints[startPointIdx].x = snapshotPointsRef.current[startPointIdx].x + flowDeltaX;
                }
                if (endPointIdx >= 0 && endPointIdx < updatedWaypoints.length) {
                    updatedWaypoints[endPointIdx].x = snapshotPointsRef.current[endPointIdx].x + flowDeltaX;
                }
            }

            setDraftWaypoints(updatedWaypoints);
            segmentRafIdRef.current = null;
        });
    }, [draggingSegment, viewport.zoom]);

    const handleSegmentPointerUp = useCallback((e: React.PointerEvent<Element>) => {
        if (draggingSegment !== null) {
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (edgeCallbacks?.onWaypointsChange) {
                edgeCallbacks.onWaypointsChange(id, localWaypoints);
            }
        }
        setDraggingSegment(null);
        setDraftWaypoints(null);
        snapshotPointsRef.current = [];

        if (segmentRafIdRef.current !== null) {
            cancelAnimationFrame(segmentRafIdRef.current);
            segmentRafIdRef.current = null;
        }
    }, [draggingSegment, localWaypoints, edgeCallbacks, id]);

    const handleSegmentKeyDown = useCallback((index: number, seg: Segment, event: React.KeyboardEvent<Element>) => {
        const delta = keyboardDelta(event);
        if (!delta) return;
        if ((seg.isHorizontal && delta.y === 0) || (!seg.isHorizontal && delta.x === 0)) return;
        event.preventDefault();
        event.stopPropagation();

        const allPoints: Waypoint[] = [];
        if (segments.length > 0) {
            allPoints.push({ x: segments[0].start.x, y: segments[0].start.y });
            for (const segment of segments) allPoints.push({ x: segment.end.x, y: segment.end.y });
        }
        const nextWaypoints = allPoints.slice(1, -1).map(point => ({ ...point }));
        const adjacentIndexes = [index - 1, index];
        for (const pointIndex of adjacentIndexes) {
            if (pointIndex < 0 || pointIndex >= nextWaypoints.length) continue;
            if (seg.isHorizontal) nextWaypoints[pointIndex].y += delta.y;
            else nextWaypoints[pointIndex].x += delta.x;
        }
        edgeCallbacks.onWaypointsChange(id, nextWaypoints);
    }, [edgeCallbacks, id, segments]);

    const handleEdgeClick = useCallback((e: React.MouseEvent<SVGPathElement>) => {
        e.stopPropagation();

        // [DEBUG] Alt+Click or Ctrl+Click: Select this edge for the Routing Debugger
        // Alt: quick ergonomic shortcut (works in most browsers when clicking SVG)
        // Ctrl: fallback for Windows where Alt may focus browser menu bar
        if (e.altKey || (e.ctrlKey && !e.shiftKey && !e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            try {
                window.dispatchEvent(new CustomEvent('vizly:selectDebugEdge', { detail: { edgeId: id } }));
                import('../../../services/EdgeRoutingCoordinator').then(({ EdgeRoutingCoordinator }) => {
                    const coordinator = EdgeRoutingCoordinator.getInstance() as unknown as {
                        setDebugEdge(id: string | null): void;
                        forceDebugReRoute(id: string | null): void;
                    };
                    coordinator.setDebugEdge(id);
                    coordinator.forceDebugReRoute(id);
                }).catch(() => {/* ignore */});
            } catch {/* ignore */}
            return;
        }

        const svg = e.currentTarget.ownerSVGElement;
        if (!svg) return;

        const point = svg.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;

        const transformedPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());
        const clickX = transformedPoint.x;
        const clickY = transformedPoint.y;

        const allPoints: Waypoint[] = [];
        if (segments.length > 0) {
            allPoints.push({ x: segments[0].start.x, y: segments[0].start.y });
            for (const s of segments) {
                allPoints.push({ x: s.end.x, y: s.end.y });
            }
        }

        const middlePoints = allPoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));

        let bestSegIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const dx = seg.end.x - seg.start.x;
            const dy = seg.end.y - seg.start.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 0.01) continue;

            const t = Math.max(0, Math.min(1,
                ((clickX - seg.start.x) * dx + (clickY - seg.start.y) * dy) / lenSq
            ));
            const projX = seg.start.x + t * dx;
            const projY = seg.start.y + t * dy;
            const dist = Math.hypot(clickX - projX, clickY - projY);

            if (dist < bestDist) {
                bestDist = dist;
                bestSegIdx = i;
            }
        }

        const seg = segments[bestSegIdx];
        if (!seg) return;
        
        const newWaypoint: Waypoint = seg.isHorizontal
            ? { x: clickX, y: seg.start.y } 
            : { x: seg.start.x, y: clickY };

        const insertAt = bestSegIdx;
        middlePoints.splice(insertAt, 0, newWaypoint);

        if (edgeCallbacks?.onWaypointsChange) {
            edgeCallbacks.onWaypointsChange(id, middlePoints);
        }
    }, [segments, edgeCallbacks, id]);


    const handleDeleteWaypoint = useCallback((bp: BendPoint, e: React.SyntheticEvent) => {
        e.stopPropagation();
        if (bp.waypointIndex !== undefined && edgeCallbacks?.onWaypointsChange) {
            const newWaypoints = waypoints.filter((_: Waypoint, i: number) => i !== bp.waypointIndex);
            edgeCallbacks.onWaypointsChange(id, newWaypoints);
        }
    }, [waypoints, edgeCallbacks, id]);
    
    const handleAddWaypointToSegment = useCallback((index: number, seg: Segment, e: React.SyntheticEvent) => {
        e.stopPropagation();
        const allPoints: Waypoint[] = [];
        if (segments.length > 0) {
            allPoints.push({ x: segments[0].start.x, y: segments[0].start.y });
            for (const s of segments) {
                allPoints.push({ x: s.end.x, y: s.end.y });
            }
        }
        const middlePoints = allPoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));
        const newWaypoint: Waypoint = { x: seg.midPoint.x, y: seg.midPoint.y };
        middlePoints.splice(index, 0, newWaypoint);
        if (edgeCallbacks?.onWaypointsChange) {
            edgeCallbacks.onWaypointsChange(id, middlePoints);
        }
    }, [segments, edgeCallbacks, id]);

    return {
        // Geometric data
        edgePath,
        bendPoints,
        segments,
        labelPos,

        // Interaction State
        draggingIndex,
        draggingSegment,
        hoveredSegment,
        setHoveredSegment,

        // Label State
        isEditingLabel,
        setIsEditingLabel,
        editingLabelValue,
        setEditingLabelValue,

        // Handlers
        handleBendPointPointerDown,
        handleBendPointPointerMove,
        handleBendPointPointerUp,
        handleBendPointKeyDown,
        handleSegmentPointerDown,
        handleSegmentPointerMove,
        handleSegmentPointerUp,
        handleSegmentKeyDown,
        handleEdgeClick,
        handleDeleteWaypoint,
        handleAddWaypointToSegment
    };
}
