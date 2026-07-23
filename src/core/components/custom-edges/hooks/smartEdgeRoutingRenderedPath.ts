import type { EdgeProps } from '@xyflow/react';
import { createFilletedPath } from '../../../algorithms/smartEdgeUtils';
import {
    detectContainerHeaderSkimRisk,
    repairContainerHeaderSkimPath,
    repairDirectionalSourceExitPath,
    repairEndpointPortConstraintPath,
    repairTangentialEndpointEntryPath,
    type RoutingNodeRect,
} from '../../../algorithms/containerHeaderSkimRepair';
import {
    getRenderedPathCache as _getRenderedPathCache,
    setRenderedPathCacheValue as _setRenderedPathCacheValue,
} from '../../../routing/renderedPathCache';
import { snapSimpleOrthogonalPath, type PathPoint } from './smartEdgeRoutingGeometry';
import {
    RENDERED_BUSINESS_NODE_CLEARANCE,
    orthogonalizePointChain,
    parseRenderedPathPoints,
    pathEndpointsTouchCurrentNodes,
    pathHasObstacleHit,
    pathHasShortEndpointStub,
    repairEndpointHairpin,
} from './smartEdgeRoutingRenderedGeometry';
import {
    repairAlignedDetourIfDirectIsClean,
    repairAlignedLocalDoglegIfDirectIsClean,
    repairEarlySameSourceFanOut,
    repairExcessiveAlignedDetour,
    repairHardObstacleRenderedPath,
    repairLocalMicroDoglegs,
    repairNearlyAlignedMicroJog,
    repairRedundantOuterLoop,
    repairTwoPointRenderedCrossing,
} from './smartEdgeRoutingRenderedRepairs';

interface ResolveRenderedSmartEdgePathOptions {
    props: EdgeProps;
    id: string;
    source: string;
    target: string;
    jumpPath: string | null | undefined;
    busGeometryPath: string | null;
    finalPath: string;
    isLayoutPathLocked: boolean;
    canUseFreshWorkerPath: boolean;
    edgeData: { isTreeBus?: boolean; treeRouting?: boolean } | undefined;
    nodesDragging: boolean;
    isLoading: boolean;
    edgeConfig: { strictOrthogonal?: boolean };
    visualCornerRadius: number;
    renderCornerRadius: number;
    safeObstacles: Array<{ x: number; y: number; width: number; height: number }>;
    renderedBusinessObstacles: RoutingNodeRect[];
    routingNodeRects: RoutingNodeRect[];
    hasSameSourceFanOut: boolean;
}

export const resolveRenderedSmartEdgePath = ({
    props,
    id,
    source,
    target,
    jumpPath,
    busGeometryPath,
    finalPath,
    isLayoutPathLocked,
    canUseFreshWorkerPath,
    edgeData,
    nodesDragging,
    isLoading,
    edgeConfig,
    visualCornerRadius,
    renderCornerRadius,
    safeObstacles,
    renderedBusinessObstacles,
    routingNodeRects,
    hasSameSourceFanOut,
}: ResolveRenderedSmartEdgePathOptions): string => {
    const canApplyRenderedSoftRepair = !isLayoutPathLocked
        && canUseFreshWorkerPath
        && !edgeData?.isTreeBus
        && !edgeData?.treeRouting;
    const canApplyLocalDoglegRepair = canUseFreshWorkerPath;
    const canApplySameSourceFanOutRepair = canUseFreshWorkerPath;

    const snappedFinalPath = snapSimpleOrthogonalPath(
        jumpPath || busGeometryPath || finalPath || `M ${props.sourceX} ${props.sourceY} L ${props.targetX} ${props.targetY}`
    );
    const snappedFinalPointsForQuality = orthogonalizePointChain(parseRenderedPathPoints(snappedFinalPath));
    const lockedPathNeedsContainerRepair = isLayoutPathLocked
        && snappedFinalPointsForQuality.length >= 2
        && (
            pathHasObstacleHit(snappedFinalPointsForQuality, renderedBusinessObstacles, RENDERED_BUSINESS_NODE_CLEARANCE)
            || !pathEndpointsTouchCurrentNodes(snappedFinalPointsForQuality, source, target, routingNodeRects)
            || pathHasShortEndpointStub(snappedFinalPointsForQuality, source, target, routingNodeRects)
            || detectContainerHeaderSkimRisk(snappedFinalPointsForQuality, {
                sourceId: source,
                targetId: target,
                nodes: routingNodeRects,
            })
        );
    const canApplyContainerHeaderSkimRepair = !nodesDragging
        && !isLoading
        && routingNodeRects.length > 0
        && (!isLayoutPathLocked || lockedPathNeedsContainerRepair);
    const microJogRepairedPath = repairNearlyAlignedMicroJog(
        id,
        snappedFinalPath,
        renderCornerRadius,
        canApplyRenderedSoftRepair,
        safeObstacles
    );
    const alignedDetourRepairedPath = repairAlignedDetourIfDirectIsClean(
        id,
        microJogRepairedPath,
        renderCornerRadius,
        canApplyRenderedSoftRepair,
        safeObstacles
    );
    const alignedLocalDoglegRepairedPath = repairAlignedLocalDoglegIfDirectIsClean(
        id,
        alignedDetourRepairedPath,
        renderCornerRadius,
        canApplyLocalDoglegRepair,
        safeObstacles
    );
    const localDoglegRepairedPath = repairLocalMicroDoglegs(
        id,
        alignedLocalDoglegRepairedPath,
        renderCornerRadius,
        canApplyLocalDoglegRepair,
        safeObstacles
    );
    const hairpinRepairedPath = repairEndpointHairpin(
        id,
        localDoglegRepairedPath,
        renderCornerRadius,
        canApplyRenderedSoftRepair,
        safeObstacles
    );
    const sameSourceFanOutRepairedPath = repairEarlySameSourceFanOut(
        id,
        hairpinRepairedPath,
        renderCornerRadius,
        canApplySameSourceFanOutRepair,
        hasSameSourceFanOut,
        safeObstacles
    );
    const outerLoopRepairedPath = repairRedundantOuterLoop(
        id,
        sameSourceFanOutRepairedPath,
        renderCornerRadius,
        canApplyRenderedSoftRepair,
        safeObstacles
    );
    const compactedFinalPath = repairExcessiveAlignedDetour(
        id,
        outerLoopRepairedPath,
        renderCornerRadius,
        canApplyRenderedSoftRepair,
        safeObstacles
    );
    const crossingInputPath = edgeConfig.strictOrthogonal && /[ACQST]/i.test(compactedFinalPath)
        ? (createFilletedPath(parseRenderedPathPoints(compactedFinalPath), 0) || compactedFinalPath)
        : compactedFinalPath;
    let structuralSafePath = repairTwoPointRenderedCrossing(
        id,
        crossingInputPath,
        renderCornerRadius,
        canApplyRenderedSoftRepair,
        safeObstacles
    );
    if (edgeConfig.strictOrthogonal && /[ACQST]/i.test(structuralSafePath)) {
        structuralSafePath = createFilletedPath(parseRenderedPathPoints(structuralSafePath), 0) || structuralSafePath;
    }
    if (canApplyContainerHeaderSkimRepair) {
        const headerSkimInputPath = /[ACQST]/i.test(structuralSafePath)
            ? (createFilletedPath(parseRenderedPathPoints(structuralSafePath), 0) || structuralSafePath)
            : structuralSafePath;
        const structuralPoints = orthogonalizePointChain(parseRenderedPathPoints(headerSkimInputPath));
        const endpointsTouchCurrentNodes = pathEndpointsTouchCurrentNodes(structuralPoints, source, target, routingNodeRects);
        if (!endpointsTouchCurrentNodes) {
            // Loading/stale paths can briefly contain old coordinates. Do not repair or cache them.
        } else {
        const otherPaths = new Map<string, PathPoint[]>();
        _getRenderedPathCache().forEach((cachedPath, cachedEdgeId) => {
            if (cachedEdgeId === id || !cachedPath) return;
            const cachedPoints = orthogonalizePointChain(parseRenderedPathPoints(cachedPath));
            if (cachedPoints.length >= 2) otherPaths.set(cachedEdgeId, cachedPoints);
        });
        const endpointPortRepaired = repairEndpointPortConstraintPath(structuralPoints, {
            edgeId: id,
            sourceId: source,
            targetId: target,
            nodes: routingNodeRects,
            obstacles: safeObstacles,
            otherPaths,
        });
        const sourceExitRepaired = repairDirectionalSourceExitPath(endpointPortRepaired ?? structuralPoints, {
            edgeId: id,
            sourceId: source,
            targetId: target,
            nodes: routingNodeRects,
            obstacles: safeObstacles,
            otherPaths,
        });
        const endpointEntryRepaired = repairTangentialEndpointEntryPath(sourceExitRepaired ?? endpointPortRepaired ?? structuralPoints, {
            edgeId: id,
            sourceId: source,
            targetId: target,
            nodes: routingNodeRects,
            obstacles: safeObstacles,
            otherPaths,
        });
        const headerSkimRepaired = repairContainerHeaderSkimPath(endpointEntryRepaired ?? sourceExitRepaired ?? endpointPortRepaired ?? structuralPoints, {
            edgeId: id,
            sourceId: source,
            targetId: target,
            nodes: routingNodeRects,
            obstacles: safeObstacles,
            otherPaths,
        });
        const repairedCandidate = headerSkimRepaired ?? endpointEntryRepaired ?? sourceExitRepaired ?? endpointPortRepaired;
        const finalEndpointPortRepaired = repairedCandidate
            ? repairEndpointPortConstraintPath(repairedCandidate, {
                edgeId: id,
                sourceId: source,
                targetId: target,
                nodes: routingNodeRects,
                obstacles: safeObstacles,
                otherPaths,
            })
            : null;
        const containerEntryRepaired = [
            finalEndpointPortRepaired,
            headerSkimRepaired,
            endpointEntryRepaired,
            sourceExitRepaired,
            endpointPortRepaired,
        ].find((candidate): candidate is PathPoint[] => {
            return !!candidate && pathEndpointsTouchCurrentNodes(candidate, source, target, routingNodeRects);
        }) ?? null;
        if (containerEntryRepaired) {
            structuralSafePath = createFilletedPath(containerEntryRepaired, edgeConfig.strictOrthogonal ? 0 : visualCornerRadius) || structuralSafePath;
            if (canUseFreshWorkerPath || !isLoading) {
                _setRenderedPathCacheValue(id, structuralSafePath);
            }
        }
        }
    }
    const finalAlignedDoglegPath = repairAlignedLocalDoglegIfDirectIsClean(
        id,
        structuralSafePath,
        renderCornerRadius,
        canApplyLocalDoglegRepair,
        safeObstacles
    );
    const hardObstacleRepairedPath = repairHardObstacleRenderedPath(
        id,
        finalAlignedDoglegPath,
        renderCornerRadius,
        !nodesDragging && !isLoading && renderedBusinessObstacles.length > 0,
        renderedBusinessObstacles
    );
    const finalLocalDoglegPath = repairLocalMicroDoglegs(
        id,
        hardObstacleRepairedPath,
        renderCornerRadius,
        canApplyLocalDoglegRepair,
        safeObstacles
    );
    const finalClearanceRepairedPath = repairHardObstacleRenderedPath(
        id,
        finalLocalDoglegPath,
        renderCornerRadius,
        !nodesDragging && !isLoading && renderedBusinessObstacles.length > 0,
        renderedBusinessObstacles
    );
    if (finalClearanceRepairedPath !== structuralSafePath && (canUseFreshWorkerPath || !isLoading)) {
        _setRenderedPathCacheValue(id, finalClearanceRepairedPath);
    }
    const safeFinalPath = edgeConfig.strictOrthogonal && visualCornerRadius > 0
        ? (createFilletedPath(parseRenderedPathPoints(finalClearanceRepairedPath), visualCornerRadius) || finalClearanceRepairedPath)
        : finalClearanceRepairedPath;

    return safeFinalPath;
};
