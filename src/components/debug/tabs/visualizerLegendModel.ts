import {
    normalizeVisibilityGraph,
    type AlgorithmDebugPayload,
    type DebugPayload,
    type VisibilityGraphLike,
} from './visualizerModel';

const isRecord = (value: unknown): value is Record<string, unknown> => (
    !!value && typeof value === 'object' && !Array.isArray(value)
);

const displayValue = (value: unknown): string => (
    typeof value === 'string' || typeof value === 'number' ? String(value) : '?'
);

export interface VisualizerLegendDetails {
    strategy: string;
    hasGrid: boolean;
    visibilityEdgeCount: number;
    hasQuadTree: boolean;
    visitedCount: number;
    source: string;
    target: string;
    direction: string;
    geometry: string;
    deltaX: string;
    deltaY: string;
    explicitSource: string;
    explicitTarget: string;
    sourceHandle: string;
    targetHandle: string;
    layoutDirection: string;
    manyToOne: string;
    incomingCount: string;
    hasPrecomputedTrunk: string;
    peerGroupSize: string;
    peerGroupKey: string;
    peerGroupMembers: string;
    hasMorePeerGroupMembers: boolean;
    trunkAxis: string;
    trunkOrientation: string;
    waypointInitialScore: number | null;
    waypointFinalScore: number | null;
    waypointChanged: string;
    waypointShiftChanges: number;
    waypointRerouteChanges: number;
    waypointHardCrossings: string | number;
    waypointSoftCrossings: string | number;
    waypointNearMisses: string | number;
}

export function createVisualizerLegendDetails(debugData: DebugPayload): VisualizerLegendDetails {
    const algorithmDebug = isRecord(debugData.algorithmDebug)
        ? debugData.algorithmDebug as AlgorithmDebugPayload & Record<string, unknown>
        : null;
    const portSelection = isRecord(algorithmDebug?.portSelection)
        ? algorithmDebug.portSelection
        : {};
    const centers = isRecord(portSelection.centers) ? portSelection.centers : {};
    const selected = isRecord(portSelection.selected) ? portSelection.selected : {};
    const waypoint = isRecord(algorithmDebug?.waypointRefinement)
        ? algorithmDebug.waypointRefinement
        : {};
    const waypointInitial = isRecord(waypoint.initial) ? waypoint.initial : {};
    const waypointFinal = isRecord(waypoint.final) ? waypoint.final : {};
    const peerMembers = Array.isArray(portSelection.peerGroupMembers)
        ? portSelection.peerGroupMembers
        : [];
    const debugRecord = debugData as unknown as Record<string, unknown>;
    const visibilityGraph: VisibilityGraphLike | undefined =
        debugData.vg ?? algorithmDebug?.vg ?? algorithmDebug?.visibilityGraph;

    return {
        strategy: debugData.metadata?.strategy ?? algorithmDebug?.strategy ?? 'Unknown',
        hasGrid: Boolean(debugData.grid ?? algorithmDebug?.grid),
        visibilityEdgeCount: normalizeVisibilityGraph(visibilityGraph).length,
        hasQuadTree: Boolean(debugData.quadTree ?? algorithmDebug?.spatialIndex ?? algorithmDebug?.quadTree),
        visitedCount: (debugData.visited ?? algorithmDebug?.visited)?.length ?? 0,
        source: displayValue(debugRecord.selectedSourcePos ?? selected.source),
        target: displayValue(debugRecord.selectedTargetPos ?? selected.target),
        direction: displayValue(portSelection.effectiveDir ?? portSelection.layoutDirection ?? debugData.metadata?.strategy),
        geometry: displayValue(portSelection.geometry ?? portSelection.detectedGeometry),
        deltaX: typeof centers.dx === 'number' ? centers.dx.toFixed(0) : '?',
        deltaY: typeof centers.dy === 'number' ? centers.dy.toFixed(0) : '?',
        explicitSource: typeof portSelection.hasExplicitSource === 'boolean'
            ? (portSelection.hasExplicitSource ? 'Yes' : 'No')
            : '?',
        explicitTarget: typeof portSelection.hasExplicitTarget === 'boolean'
            ? (portSelection.hasExplicitTarget ? 'Yes' : 'No')
            : '?',
        sourceHandle: displayValue(portSelection.sourceHandle),
        targetHandle: displayValue(portSelection.targetHandle),
        layoutDirection: displayValue(portSelection.layoutDirection),
        manyToOne: typeof portSelection.isManyToOne === 'boolean'
            ? (portSelection.isManyToOne ? 'Yes' : 'No')
            : '?',
        incomingCount: typeof portSelection.incomingCount === 'number'
            ? String(portSelection.incomingCount)
            : '?',
        hasPrecomputedTrunk: typeof portSelection.hasPrecomputedTrunk === 'boolean'
            ? (portSelection.hasPrecomputedTrunk ? 'Yes' : 'No')
            : '?',
        peerGroupSize: typeof portSelection.peerGroupSize === 'number'
            ? String(portSelection.peerGroupSize)
            : '?',
        peerGroupKey: typeof portSelection.peerGroupKey === 'string' ? portSelection.peerGroupKey : '?',
        peerGroupMembers: peerMembers.map(String).slice(0, 8).join(','),
        hasMorePeerGroupMembers: peerMembers.length > 8,
        trunkAxis: typeof portSelection.trunkAxis === 'number' ? portSelection.trunkAxis.toFixed(0) : '?',
        trunkOrientation: typeof portSelection.trunkVertical === 'boolean'
            ? (portSelection.trunkVertical ? 'V' : 'H')
            : '?',
        waypointInitialScore: typeof waypointInitial.totalScore === 'number' ? waypointInitial.totalScore : null,
        waypointFinalScore: typeof waypointFinal.totalScore === 'number' ? waypointFinal.totalScore : null,
        waypointChanged: typeof waypoint.changed === 'boolean' ? (waypoint.changed ? 'moved' : 'kept') : '?',
        waypointShiftChanges: typeof waypoint.segmentShiftChanges === 'number' ? waypoint.segmentShiftChanges : 0,
        waypointRerouteChanges: typeof waypoint.rerouteChanges === 'number' ? waypoint.rerouteChanges : 0,
        waypointHardCrossings: typeof waypointFinal.hardCrossings === 'number' ? waypointFinal.hardCrossings : '?',
        waypointSoftCrossings: typeof waypointFinal.softCrossings === 'number' ? waypointFinal.softCrossings : '?',
        waypointNearMisses: typeof waypointFinal.softNearMisses === 'number' ? waypointFinal.softNearMisses : '?',
    };
}
