import React from 'react';
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { Segment } from '../../../utils/orthogonalPath';

interface BendPoint {
    x: number;
    y: number;
    isWaypoint: boolean;
    waypointIndex?: number;
}

interface DraggingSegment {
    segIndex: number;
    isHorizontal: boolean;
    startPointIdx: number;
    endPointIdx: number;
    initialMousePos: { x: number; y: number };
}

export interface EditableEdgeGraphicsProps {
    id: string;
    edgePath: string;
    style?: React.CSSProperties;
    markerEnd?: string;
    markerStart?: string;
    selected: boolean;
    viewportZoom: number;
    bendPoints: BendPoint[];
    segments: Segment[];
    labelPos: { x: number; y: number };
    label?: string;
    
    // Interaction State
    draggingIndex: number | null;
    draggingSegment: DraggingSegment | null;
    hoveredSegment: number | null;
    setHoveredSegment: (idx: number | null) => void;
    isEditingLabel: boolean;
    setIsEditingLabel: (isEditing: boolean) => void;
    editingLabelValue: string;
    setEditingLabelValue: (val: string) => void;

    // Handlers
    onBendPointDown: (idx: number, bp: BendPoint, e: React.PointerEvent) => void;
    onBendPointMove: (e: React.PointerEvent) => void;
    onBendPointUp: (e: React.PointerEvent) => void;
    onBendPointKeyDown: (idx: number, bp: BendPoint, e: React.KeyboardEvent) => void;
    onSegmentDown: (idx: number, seg: Segment, e: React.PointerEvent) => void;
    onSegmentMove: (e: React.PointerEvent) => void;
    onSegmentUp: (e: React.PointerEvent) => void;
    onSegmentKeyDown: (idx: number, seg: Segment, e: React.KeyboardEvent) => void;
    onEdgeClick: (e: React.MouseEvent<SVGPathElement>) => void;
    onDeleteWaypoint: (bp: BendPoint, e: React.SyntheticEvent) => void;
    onAddWaypointToSegment: (idx: number, seg: Segment, e: React.SyntheticEvent) => void;
    onLabelChangeSubmit: () => void;
}

const EditableEdgeGraphicsComponent: React.FC<EditableEdgeGraphicsProps> = ({
    id,
    edgePath,
    style,
    markerEnd,
    markerStart,
    selected,
    viewportZoom,
    bendPoints,
    segments,
    labelPos,
    label,
    draggingIndex,
    draggingSegment,
    hoveredSegment,
    setHoveredSegment,
    isEditingLabel,
    setIsEditingLabel,
    editingLabelValue,
    setEditingLabelValue,
    onBendPointDown,
    onBendPointMove,
    onBendPointUp,
    onBendPointKeyDown,
    onSegmentDown,
    onSegmentMove,
    onSegmentUp,
    onSegmentKeyDown,
    onEdgeClick,
    onDeleteWaypoint,
    onAddWaypointToSegment,
    onLabelChangeSubmit
}) => {
    const { t } = useTranslation();
    const activateOnKeyboard = (event: React.KeyboardEvent, action: () => void) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        action();
    };

    return (
        <>
            {/* Glow Path — 发光投影（叠加在主路径下方） */}
            <path
                d={edgePath}
                fill="none"
                stroke={style?.stroke || '#94a3b8'}
                strokeWidth={((style?.strokeWidth as number) || 2) + 3}
                className="edge-glow-path"
            />

            {/* Main Edge Path */}
            <BaseEdge
                id={id}
                path={edgePath}
                style={style}
                markerEnd={markerEnd}
                markerStart={markerStart}
            />

            {/* 选中态 — 蚂蚁线流动动画 */}
            {selected && (
                <path
                    d={edgePath}
                    fill="none"
                    stroke={style?.stroke || '#6366f1'}
                    strokeWidth={(style?.strokeWidth as number) || 2}
                    className="edge-selected-flow"
                    markerEnd={markerEnd}
                    style={{ pointerEvents: 'none' }}
                />
            )}

            {/* 可点击的透明宽路径 — 仅辅助选取，点击时智能添加拐点 */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={selected ? 18 : 14}
                style={{ cursor: 'pointer' }}
                onClick={onEdgeClick}
            />

            {/* Bend Point 控制点 — 选中时显示 */}
            {selected && bendPoints.map((bp, index) => {
                const zScale = 1 / (viewportZoom || 1);
                return (
                    <g
                        key={`${id}-bend-${index}`}
                        transform={`translate(${bp.x}, ${bp.y})`}
                        style={{ outline: 'none' }}
                    >
                        {/* 圆形拖拽点 */}
                        <circle
                            r={4 * zScale}
                            role="slider"
                            tabIndex={0}
                            aria-label={t('designer.edgeEditor.moveBendPoint', { index: index + 1 })}
                            aria-valuetext={`${Math.round(bp.x)}, ${Math.round(bp.y)}`}
                            fill="#1677ff"
                            stroke="white"
                            strokeWidth={1.5 * zScale}
                            style={{
                                cursor: draggingIndex === index ? 'grabbing' : 'grab',
                                pointerEvents: 'all',
                            }}
                            onPointerDown={(e) => onBendPointDown(index, bp, e)}
                            onPointerMove={onBendPointMove}
                            onPointerUp={onBendPointUp}
                            onKeyDown={(event) => onBendPointKeyDown(index, bp, event)}
                        />
                        {/* ✕ 删除按钮 — waypoint 类型永久显示 */}
                        {bp.isWaypoint && (
                            <g
                                transform={`translate(${12 * zScale}, ${-12 * zScale})`}
                                role="button"
                                tabIndex={0}
                                aria-label={t('designer.edgeEditor.deleteWaypoint', { index: (bp.waypointIndex ?? index) + 1 })}
                                style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                onClick={(e) => onDeleteWaypoint(bp, e)}
                                onKeyDown={(event) => activateOnKeyboard(event, () => onDeleteWaypoint(bp, event))}
                            >
                                <circle r={6 * zScale} fill="#ff4d4f" />
                                <path
                                    d={`M${-2.5 * zScale},${-2.5 * zScale} L${2.5 * zScale},${2.5 * zScale} M${-2.5 * zScale},${2.5 * zScale} L${2.5 * zScale},${-2.5 * zScale}`}
                                    stroke="white"
                                    strokeWidth={1.5 * zScale}
                                />
                            </g>
                        )}
                    </g>
                );
            })}

            {/* Segment Handles + ⊕ 添加按钮 — 选中时永久显示 */}
            {selected && segments.map((seg, index) => {
                const zScale = 1 / (viewportZoom || 1);
                const rectW = (seg.isHorizontal ? 28 : 6) * zScale;
                const rectH = (seg.isHorizontal ? 6 : 28) * zScale;
                const rectX = -rectW / 2;
                const rectY = -rectH / 2;

                return (
                    <g
                        key={`${id}-seg-${index}`}
                        transform={`translate(${seg.midPoint.x}, ${seg.midPoint.y})`}
                        style={{ outline: 'none' }}
                    >
                        {/* 拖拽长条 */}
                        <rect
                            x={rectX}
                            y={rectY}
                            width={rectW}
                            height={rectH}
                            rx={3 * zScale}
                            role="slider"
                            tabIndex={0}
                            aria-label={t('designer.edgeEditor.moveSegment', { index: index + 1 })}
                            aria-valuetext={`${Math.round(seg.midPoint.x)}, ${Math.round(seg.midPoint.y)}`}
                            fill={(hoveredSegment === index || draggingSegment?.segIndex === index) ? '#0958d9' : '#1677ff'}
                            style={{
                                cursor: seg.isHorizontal ? 'ns-resize' : 'ew-resize',
                                pointerEvents: 'all',
                                transition: 'fill 0.15s ease',
                            }}
                            onPointerEnter={() => setHoveredSegment(index)}
                            onPointerLeave={() => setHoveredSegment(null)}
                            onPointerDown={(e) => onSegmentDown(index, seg, e)}
                            onPointerMove={onSegmentMove}
                            onPointerUp={onSegmentUp}
                            onKeyDown={(event) => onSegmentKeyDown(index, seg, event)}
                        />
                        
                        {/* ⊕ 添加拐点按钮 */}
                        <g
                            transform={`translate(${seg.isHorizontal ? 0 : -16 * zScale}, ${seg.isHorizontal ? -16 * zScale : 0})`}
                            role="button"
                            tabIndex={0}
                            aria-label={t('designer.edgeEditor.addWaypoint', { index: index + 1 })}
                            style={{ cursor: 'pointer', pointerEvents: 'all' }}
                            onClick={(e) => onAddWaypointToSegment(index, seg, e)}
                            onKeyDown={(event) => activateOnKeyboard(event, () => onAddWaypointToSegment(index, seg, event))}
                        >
                            <circle r={7 * zScale} fill="#1677ff" stroke="white" strokeWidth={1.5 * zScale} />
                            <path
                                d={`M${-3.5 * zScale},0 L${3.5 * zScale},0 M0,${-3.5 * zScale} L0,${3.5 * zScale}`}
                                stroke="white"
                                strokeWidth={1.5 * zScale}
                            />
                        </g>
                    </g>
                );
            })}

            {/* Edge Label - 支持双击编辑 */}
            {label && (
                <EdgeLabelRenderer>
                    {isEditingLabel ? (
                        <div
                            key={`${id}-label-editing`}
                            style={{
                                position: 'absolute',
                                transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
                                zIndex: 1001,
                                pointerEvents: 'auto',
                            }}
                            className="nodrag nopan"
                        >
                            <input
                                type="text"
                                aria-label={t('designer.edgeEditor.labelInput')}
                                value={editingLabelValue}
                                onChange={(e) => setEditingLabelValue(e.target.value)}
                                onBlur={() => {
                                    onLabelChangeSubmit();
                                    setIsEditingLabel(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        onLabelChangeSubmit();
                                        setIsEditingLabel(false);
                                    }
                                    if (e.key === 'Escape') {
                                        setIsEditingLabel(false);
                                    }
                                }}
                                autoFocus
                                placeholder={t('designer.edgeEditor.labelPlaceholder')}
                                style={{
                                    background: 'white',
                                    border: '2px solid #1677ff',
                                    borderRadius: 4,
                                    padding: '2px 6px',
                                    fontSize: 12,
                                    outline: 'none',
                                    minWidth: 60,
                                    textAlign: 'center',
                                }}
                            />
                        </div>
                    ) : (
                        <div
                            key={`${id}-label-display`}
                            className="edge-label-premium nodrag nopan"
                            style={{
                                position: 'absolute',
                                transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
                                color: style?.stroke || '#333',
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={t('designer.edgeEditor.editLabel', { label })}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingLabelValue(label || '');
                                setIsEditingLabel(true);
                            }}
                            onKeyDown={(event) => activateOnKeyboard(event, () => {
                                setEditingLabelValue(label || '');
                                setIsEditingLabel(true);
                            })}
                        >
                            {label}
                        </div>
                    )}
                </EdgeLabelRenderer>
            )}
        </>
    );
};

export const EditableEdgeGraphics = React.memo(EditableEdgeGraphicsComponent);
