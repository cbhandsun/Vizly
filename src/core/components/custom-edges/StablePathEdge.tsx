/**
 * StablePathEdge - 使用预计算路径点的稳定边渲染器
 * 
 * 解决问题：React Flow 的内置边类型会自动计算连线路径，可能在不同渲染中产生不同结果。
 * 
 * 解决方案：读取 edge.data.computedPath（我们的 A* 算法计算的路径点），直接渲染这些点，
 * 完全绕过 React Flow 的自动路径计算。
 */
import React, { memo, useMemo, useRef, useState } from 'react';
import { EdgeLabelRenderer, useStore, type EdgeProps } from '@xyflow/react';
import { getSmartLabelPosition } from '../../algorithms/smartEdgeUtils';
import { useEdgeTheme } from '../diagrams/useEdgeUpdate';
import { getEdgeLabelAutoOffset } from './edgeLabelAvoidance';
import { collectStablePathPeerPaths } from './stablePathEdgePeerPaths';
import { useEdgeLabelObstacles } from './edgeLabelObstacleContext';
import {
    smartEdgeRenderAdapterAcceptsCommittedGeometry,
    useSmartEdgeRoutingRenderAdapter,
} from './smartEdgeRoutingRenderAdapter';
import { useSyncNativeEdgeUpdaterEndpoints } from './useSyncNativeEdgeUpdaterEndpoints';
import { useLineJumps } from './hooks/useLineJumps';
import { ContrastSafeBaseEdge } from './ContrastSafeBaseEdge';
import { injectLineJumps, JUMP_RADIUS } from '../../services/LineJumpEngine';
import { resolveEdgeContrastPaint } from '../../rendering/edgeContrastPaint';
import {
    createSharedTrunkBackboneFragments,
    createSharedTrunkJunctionFragments,
    createSharedTrunkPaintFragments,
    normalizeSharedTrunkPaintPoints,
    readSharedTrunkPaintPlan,
    sharedTrunkPointsToPath,
    type SharedTrunkPaintPlan,
    type SharedTrunkPaintFragment,
} from '../../rendering/sharedTrunkPaint';
import {
    hasStablePathLiveNodeGeometry,
    isStablePathAttachedToLiveEndpoints,
    type StablePathPoint as Point,
} from './stablePathEndpointAttachment';

interface StablePathEdgeData {
    computedPath?: unknown;
    _layoutEpoch?: unknown;
    labelPosition?: unknown;
    labelOffset?: unknown;
    absoluteLabelX?: unknown;
    absoluteLabelY?: unknown;
    labelPriority?: unknown;
    showLabelWhenZoomedOut?: unknown;
}

type SharedTrunkCssVariables = React.CSSProperties & {
    '--vizly-shared-canonical-stroke'?: string;
    '--vizly-shared-canonical-stroke-width'?: string;
    '--vizly-shared-canonical-opacity'?: string;
    '--vizly-shared-junction-stroke'?: string;
    '--vizly-shared-junction-stroke-width'?: string;
    '--vizly-shared-semantic-stroke'?: string;
    '--vizly-shared-semantic-stroke-width'?: string;
    '--vizly-shared-semantic-opacity'?: string;
    '--vizly-shared-trace-width'?: string;
    '--vizly-edge-marker-outline-color'?: string;
};

const isPoint = (value: unknown): value is Point => {
    if (value === null || typeof value !== 'object') return false;
    const point = value as Record<string, unknown>;
    return typeof point.x === 'number' && Number.isFinite(point.x)
        && typeof point.y === 'number' && Number.isFinite(point.y);
};

const readPoint = (value: unknown): Point | undefined => (
    isPoint(value) ? value : undefined
);

function fallbackOrthogonalPoints(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    sourcePosition: unknown,
): Point[] {
    const start = { x: sourceX, y: sourceY };
    const end = { x: targetX, y: targetY };
    if (Math.abs(sourceX - targetX) <= 1 || Math.abs(sourceY - targetY) <= 1) {
        return normalizeSharedTrunkPaintPoints([start, end]) ?? [start, end];
    }

    const sourceSide = String(sourcePosition ?? '').toLowerCase();
    const verticalFirst = sourceSide === 'top' || sourceSide === 'bottom';
    const fallback = verticalFirst
        ? [start, { x: sourceX, y: targetY }, end]
        : [start, { x: targetX, y: sourceY }, end];
    return normalizeSharedTrunkPaintPoints(fallback) ?? fallback;
}

const autoLabelOffset = (
    ownPath: Point[],
    labelPoint: Point,
    labelText: string,
    peerPaths: Point[][],
    obstacles: Array<{ x: number; y: number; width: number; height: number }>,
): Point => {
    return getEdgeLabelAutoOffset(ownPath, labelPoint, labelText, peerPaths, obstacles);
};

const pathLength = (points: readonly Point[]): number => points.reduce(
    (total, point, index) => index === 0
        ? total
        : total + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y),
    0,
);

const longestSemanticFragment = (
    fragments: readonly SharedTrunkPaintFragment[],
): readonly Point[] | undefined => fragments.reduce<SharedTrunkPaintFragment | undefined>(
    (longest, fragment) => !longest || pathLength(fragment.points) > pathLength(longest.points)
        ? fragment
        : longest,
    undefined,
)?.points;

const traceStrokeWidth = (value: unknown): number => (
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(18, Math.max(3.5, value + 1.5))
        : 3.5
);

const ownsSharedTrunkEndpoint = (
    plan: SharedTrunkPaintPlan | null,
    edgeId: string,
    role: 'source' | 'target',
    totalLength: number,
): boolean => plan?.backboneRanges.some(range => (
    range.role === role
    && range.ownerEdgeId === edgeId
    && (role === 'source' ? range.from <= 0.01 : range.to >= totalLength - 0.01)
)) ?? false;

/**
 * 稳定路径边组件
 */
export const StablePathEdge = memo<EdgeProps>((props) => {
    const {
        id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        data,
        style,
        markerEnd,
        markerStart,
        label,
        labelStyle,
        selected,
    } = props;
    const edgeData = data as StablePathEdgeData | undefined;
    const routingRenderAdapter = useSmartEdgeRoutingRenderAdapter();
    const acceptsCommittedGeometry = smartEdgeRenderAdapterAcceptsCommittedGeometry(
        routingRenderAdapter,
    );
    const currentTheme = useEdgeTheme();
    const canvasBackground = currentTheme?.diagram?.canvas?.background ?? '#ffffff';
    // Subscribe to the stable edge-array reference. Returning a freshly mapped
    // array from the store selector made every edge re-render on every node move.
    const allEdges = useStore(state => state.edges);
    // Endpoint objects change when React Flow publishes new absolute geometry.
    // Subscribe only to this edge's two endpoints so layout transitions cannot
    // leave the attachment memo pinned to an early sentinel coordinate.
    const sourceNode = useStore(state => state.nodeLookup.get(props.source));
    const targetNode = useStore(state => state.nodeLookup.get(props.target));
    const labelObstacles = useEdgeLabelObstacles();
    const peerPaths = useMemo(
        () => acceptsCommittedGeometry
            ? collectStablePathPeerPaths(allEdges, id, Boolean(label))
            : [],
        [acceptsCommittedGeometry, allEdges, id, label],
    );
    const [isPointerTracing, setIsPointerTracing] = useState(false);
    const [isLabelFocused, setIsLabelFocused] = useState(false);

    // ReactFlow perf check: we are completely safe from global node movement here
    // 读取预计算的路径点
    const rawComputedPath = useMemo(() => (
        Array.isArray(edgeData?.computedPath)
        && edgeData.computedPath.length <= 512
        && edgeData.computedPath.every(isPoint)
            ? edgeData.computedPath
            : undefined
    ), [edgeData?.computedPath]);
    const computedPath = useMemo(
        () => normalizeSharedTrunkPaintPoints(rawComputedPath) ?? undefined,
        [rawComputedPath],
    );
    const layoutEpoch = edgeData?._layoutEpoch;
    const { edgePath, renderPath, renderPathSource } = useMemo(() => {
        // Layout epochs can refresh React Flow's internal absolute geometry
        // without changing the serialized path or endpoint props.
        void layoutEpoch;
        const canUseComputedPath = acceptsCommittedGeometry
            && computedPath
            && computedPath.length >= 2
            && isStablePathAttachedToLiveEndpoints(
                rawComputedPath ?? computedPath,
                sourceX,
                sourceY,
                targetX,
                targetY,
                sourcePosition,
                targetPosition,
                true,
                sourceNode,
                targetNode,
            );
        const path = canUseComputedPath && computedPath
            ? computedPath
            : fallbackOrthogonalPoints(sourceX, sourceY, targetX, targetY, sourcePosition);
        return {
            edgePath: sharedTrunkPointsToPath(path),
            renderPath: path,
            renderPathSource: canUseComputedPath ? 'computed' : 'fallback',
        };
    }, [
        computedPath,
        layoutEpoch,
        rawComputedPath,
        acceptsCommittedGeometry,
        sourceNode,
        sourcePosition,
        sourceX,
        sourceY,
        targetX,
        targetY,
        targetPosition,
        targetNode,
    ]);

    const isTraceActive = Boolean(selected) || isPointerTracing || isLabelFocused;
    const sharedTrunkPlan = useMemo(() => readSharedTrunkPaintPlan(data), [data]);
    const { jumps, jumpPath } = useLineJumps({
        edgeId: id,
        sourceId: props.source,
        targetId: props.target,
        points: renderPath,
        cornerRadius: 0,
    });
    const renderFragmentPath = (points: readonly Point[]): string => (
        injectLineJumps([...points], jumps, JUMP_RADIUS, 0)
        || sharedTrunkPointsToPath(points)
    );
    const renderedEdgePath = jumpPath || edgePath;
    const { paintFragments, backboneFragments, junctionFragments } = useMemo(() => ({
        paintFragments: createSharedTrunkPaintFragments(renderPath, sharedTrunkPlan),
        backboneFragments: createSharedTrunkBackboneFragments(renderPath, sharedTrunkPlan),
        junctionFragments: createSharedTrunkJunctionFragments(renderPath, sharedTrunkPlan),
    }), [renderPath, sharedTrunkPlan]);
    const hasSharedTrunk = Boolean(sharedTrunkPlan && (
        sharedTrunkPlan.hiddenRanges.length
        || sharedTrunkPlan.backboneRanges.length
        || sharedTrunkPlan.memberships.length
    ));
    const semanticLabelPath = longestSemanticFragment(paintFragments);
    const automaticLabelPath = semanticLabelPath ?? (isTraceActive ? renderPath : undefined);
    const initialLabelPosition = getSmartLabelPosition([...(automaticLabelPath ?? renderPath)]);
    let labelX = initialLabelPosition.x;
    let labelY = initialLabelPosition.y;

    const dataLabelPosition = readPoint(edgeData?.labelPosition);
    if (dataLabelPosition && !sharedTrunkPlan?.hiddenRanges.length) {
        labelX = dataLabelPosition.x;
        labelY = dataLabelPosition.y;
    }

    const labelOffset = readPoint(edgeData?.labelOffset);
    const hasManualLabelPosition = !!labelOffset
        || typeof edgeData?.absoluteLabelX === 'number'
        || typeof edgeData?.absoluteLabelY === 'number';

    if (labelOffset) {
        labelX += Number(labelOffset.x) || 0;
        labelY += Number(labelOffset.y) || 0;
    }

    if (typeof edgeData?.absoluteLabelX === 'number' && Number.isFinite(edgeData.absoluteLabelX)) {
        labelX = edgeData.absoluteLabelX;
    }

    if (typeof edgeData?.absoluteLabelY === 'number' && Number.isFinite(edgeData.absoluteLabelY)) {
        labelY = edgeData.absoluteLabelY;
    }

    if (!hasManualLabelPosition && label && automaticLabelPath && automaticLabelPath.length >= 2) {
        const offset = autoLabelOffset(
            [...automaticLabelPath],
            { x: labelX, y: labelY },
            String(label),
            peerPaths,
            labelObstacles,
        );
        labelX += offset.x;
        labelY += offset.y;
    }

    const graphicsRef = useRef<SVGGElement>(null);
    useSyncNativeEdgeUpdaterEndpoints(
        graphicsRef,
        renderPath?.[0],
        renderPath?.at(-1),
    );

    const isPrimaryLabel = edgeData?.labelPriority === 'primary'
        || edgeData?.showLabelWhenZoomedOut === true
        || (
            typeof style?.strokeWidth === 'number'
            && Number.isFinite(style.strokeWidth)
            && style.strokeWidth >= 3
        );
    const sharedTrunkRoles = [...new Set(
        sharedTrunkPlan?.memberships.map(membership => membership.role) ?? [],
    )].join(' ');
    const ownedSharedTrunkRoles = [...new Set(
        sharedTrunkPlan?.memberships
            .filter(membership => membership.ownerEdgeId === id)
            .map(membership => membership.role) ?? [],
    )].join(' ');
    const labelClassName = [
        'stable-path-edge-label',
        'vizly-edge-label',
        'nodrag',
        'nopan',
        isPrimaryLabel ? 'stable-path-edge-label--primary' : '',
        isTraceActive ? 'stable-path-edge-label--trace-active' : '',
    ].filter(Boolean).join(' ');
    const shouldRenderLabel = Boolean(label) && Boolean(
        semanticLabelPath || hasManualLabelPosition || isTraceActive,
    );
    const semanticTraceStyle = {
        ...style,
        opacity: isTraceActive ? 1 : 0,
        pointerEvents: 'none' as const,
        strokeWidth: traceStrokeWidth(style?.strokeWidth),
        '--vizly-shared-trace-width': `${traceStrokeWidth(style?.strokeWidth)}px`,
    } satisfies SharedTrunkCssVariables;
    const semanticPaintStyle = {
        ...style,
        pointerEvents: 'none' as const,
    };
    const sharedSemanticStyle = hasSharedTrunk
        ? {
            ...semanticPaintStyle,
            '--vizly-shared-semantic-stroke': String(style?.stroke ?? '#64748B'),
            '--vizly-shared-semantic-stroke-width': typeof style?.strokeWidth === 'number'
                ? `${style.strokeWidth}px`
                : String(style?.strokeWidth ?? '1.5px'),
            '--vizly-shared-semantic-opacity': String(style?.opacity ?? 1),
        } satisfies SharedTrunkCssVariables
        : semanticPaintStyle;
    const totalRenderPathLength = useMemo(() => pathLength(renderPath), [renderPath]);
    const needsSourceMarkerCarrier = Boolean(markerStart)
        && ownsSharedTrunkEndpoint(sharedTrunkPlan, id, 'source', totalRenderPathLength)
        && !paintFragments.some(fragment => fragment.startsAtSource);
    const needsTargetMarkerCarrier = Boolean(markerEnd)
        && ownsSharedTrunkEndpoint(sharedTrunkPlan, id, 'target', totalRenderPathLength)
        && !paintFragments.some(fragment => fragment.endsAtTarget);
    const markerCarrierContrast = resolveEdgeContrastPaint({
        stroke: style?.stroke ?? '#64748B',
        strokeWidth: style?.strokeWidth,
        canvasBackground,
        opacity: 1,
        ancestorOpacity: 1,
    });
    const markerCarrierOutlineClass = markerCarrierContrast.kind === 'underlay'
        ? `vizly-edge-contrast-marker-outline--${markerCarrierContrast.underlayTone}`
        : '';
    const markerCarrierStyle = {
        stroke: 'transparent',
        strokeWidth: style?.strokeWidth,
        opacity: 1,
        pointerEvents: 'none',
        ...(markerCarrierContrast.kind === 'underlay'
            ? { '--vizly-edge-marker-outline-color': markerCarrierContrast.underlayColor }
            : {}),
    } satisfies SharedTrunkCssVariables;

    return (
        <>
            <g
                ref={graphicsRef}
                className="stable-path-edge-graphics"
                data-shared-trunk-roles={sharedTrunkRoles || undefined}
                data-shared-trunk-owner-roles={ownedSharedTrunkRoles || undefined}
                data-shared-trunk-hidden-ranges={sharedTrunkPlan?.hiddenRanges.length || undefined}
                data-shared-trunk-backbone-fragments={backboneFragments.length || undefined}
                data-shared-trunk-junction-fragments={junctionFragments.length || undefined}
                data-shared-trunk-trace-fragments={hasSharedTrunk ? 1 : undefined}
                data-shared-trunk-state={hasSharedTrunk ? 'shared' : undefined}
                data-line-jump-count={jumps.length || undefined}
                data-render-path-source={renderPathSource}
                data-source-node-geometry={hasStablePathLiveNodeGeometry(sourceNode) ? 'ready' : 'missing'}
                data-target-node-geometry={hasStablePathLiveNodeGeometry(targetNode) ? 'ready' : 'missing'}
                onPointerEnter={() => setIsPointerTracing(true)}
                onPointerLeave={() => setIsPointerTracing(false)}
            >
                {backboneFragments.map((fragment, index) => (
                    <ContrastSafeBaseEdge
                        key={`${id}-backbone-${index}`}
                        id={`${id}-backbone-${index}`}
                        path={renderFragmentPath(fragment.points)}
                        interactionWidth={0}
                        canvasBackground={canvasBackground}
                        className="shared-trunk-canonical-backbone"
                        style={{
                            stroke: fragment.paint.stroke,
                            strokeWidth: fragment.paint.strokeWidth,
                            strokeDasharray: fragment.paint.strokeDasharray || undefined,
                            opacity: fragment.paint.opacity,
                            strokeLinecap: fragment.paint.strokeLinecap,
                            strokeLinejoin: fragment.paint.strokeLinejoin,
                            pointerEvents: 'none',
                            '--vizly-shared-canonical-stroke': fragment.paint.stroke,
                            '--vizly-shared-canonical-stroke-width': `${fragment.paint.strokeWidth}px`,
                            '--vizly-shared-canonical-opacity': String(fragment.paint.opacity),
                        } as SharedTrunkCssVariables}
                    />
                ))}
                {junctionFragments.map((fragment, index) => {
                    const junctionStrokeWidth = Math.max(5, fragment.paint.strokeWidth + 2);
                    return (
                        <ContrastSafeBaseEdge
                            key={`${id}-junction-${index}`}
                            id={`${id}-junction-${index}`}
                            path={sharedTrunkPointsToPath([
                                { x: fragment.point.x - 0.01, y: fragment.point.y },
                                { x: fragment.point.x + 0.01, y: fragment.point.y },
                            ])}
                            interactionWidth={0}
                            canvasBackground={canvasBackground}
                            className="shared-trunk-junction"
                            style={{
                                stroke: fragment.paint.stroke,
                                strokeWidth: junctionStrokeWidth,
                                opacity: 1,
                                strokeLinecap: 'round',
                                strokeLinejoin: 'round',
                                pointerEvents: 'none',
                                '--vizly-shared-junction-stroke': fragment.paint.stroke,
                                '--vizly-shared-junction-stroke-width': `${junctionStrokeWidth}px`,
                            } as SharedTrunkCssVariables}
                        />
                    );
                })}
                {paintFragments.map((fragment, index) => (
                    <ContrastSafeBaseEdge
                        key={`${id}-paint-${index}`}
                        id={paintFragments.length === 1 ? id : `${id}-paint-${index}`}
                        path={renderFragmentPath(fragment.points)}
                        interactionWidth={0}
                        canvasBackground={canvasBackground}
                        className={hasSharedTrunk ? 'shared-trunk-semantic-fragment' : undefined}
                        style={sharedSemanticStyle}
                        markerEnd={fragment.endsAtTarget ? markerEnd : undefined}
                        markerStart={fragment.startsAtSource ? markerStart : undefined}
                    />
                ))}
                {(needsSourceMarkerCarrier || needsTargetMarkerCarrier) && (
                    <g
                        data-shared-trunk-marker-paint="owner-fallback"
                        data-shared-trunk-marker-roles={[
                            needsSourceMarkerCarrier ? 'source' : '',
                            needsTargetMarkerCarrier ? 'target' : '',
                        ].filter(Boolean).join(' ')}
                        data-edge-contrast={markerCarrierContrast.kind}
                        data-edge-contrast-ratio={markerCarrierContrast.semanticContrastRatio?.toFixed(2)}
                        data-edge-contrast-underlay-ratio={markerCarrierContrast.kind === 'underlay'
                            ? markerCarrierContrast.underlayContrastRatio.toFixed(2)
                            : undefined}
                    >
                        <path
                            aria-hidden="true"
                            className={[
                                'react-flow__edge-path',
                                'shared-trunk-terminal-marker-carrier',
                                markerCarrierOutlineClass,
                            ].filter(Boolean).join(' ')}
                            d={renderedEdgePath}
                            fill="none"
                            focusable="false"
                            markerStart={needsSourceMarkerCarrier ? markerStart : undefined}
                            markerEnd={needsTargetMarkerCarrier ? markerEnd : undefined}
                            style={markerCarrierStyle}
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                )}
                {hasSharedTrunk && (
                    <ContrastSafeBaseEdge
                        id={`${id}-trace`}
                        path={renderedEdgePath}
                        interactionWidth={0}
                        canvasBackground={canvasBackground}
                        className="shared-trunk-accent-trace"
                        style={semanticTraceStyle}
                    />
                )}
                {isTraceActive && (
                    <g
                        aria-hidden="true"
                        className="stable-path-edge-terminals"
                        data-edge-terminal-state="active"
                    >
                        <circle
                            className="stable-path-edge-terminal stable-path-edge-terminal--source"
                            data-edge-terminal="source"
                            cx={renderPath[0].x}
                            cy={renderPath[0].y}
                            r={4.5}
                            vectorEffect="non-scaling-stroke"
                        />
                        <circle
                            className="stable-path-edge-terminal stable-path-edge-terminal--target"
                            data-edge-terminal="target"
                            cx={renderPath[renderPath.length - 1].x}
                            cy={renderPath[renderPath.length - 1].y}
                            r={4.5}
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                )}
                <path
                    className="react-flow__edge-interaction shared-trunk-edge-interaction"
                    d={edgePath}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={20}
                />
            </g>
            {shouldRenderLabel && (
                <EdgeLabelRenderer>
                    <div
                        key={`${id}-label`}
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px) scale(var(--diagram-edge-label-scale, 1))`,
                            transformOrigin: 'center',
                            pointerEvents: 'all',
                            ...labelStyle,
                        }}
                        className={labelClassName}
                        data-edge-id={id}
                        data-edge-label-priority={isPrimaryLabel ? 'primary' : 'detail'}
                        data-edge-trace-state={isTraceActive ? 'active' : 'idle'}
                        tabIndex={selected ? 0 : -1}
                        onPointerEnter={() => setIsPointerTracing(true)}
                        onPointerLeave={() => setIsPointerTracing(false)}
                        onFocus={() => setIsLabelFocused(true)}
                        onBlur={() => setIsLabelFocused(false)}
                    >
                        {label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
});

StablePathEdge.displayName = 'StablePathEdge';

export default StablePathEdge;
