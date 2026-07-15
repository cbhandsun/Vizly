export type { NodeLike } from './smartEdgeGeometryCore';
export {
    getNodePosition,
    getCenterFromHandle,
    getHandleFromCenter,
    calculateOptimalPositions,
    getPortOffsetPoint,
    ensureMinLastSegment,
    ensureMinFirstSegment,
    getSVGPath,
    simplifyPath,
    getIntersection,
    getJumpPoints,
    preventEndpointCollinearBacktrack,
} from './smartEdgeGeometryCore';
export {
    trySimplify4PointCShape,
    straightenMicroOffset,
    straightenAlignedLocalDogleg,
    removeCrossAxisDetour,
} from './smartEdgeLocalSimplification';
export {
    removeMainAxisOvershoot,
    removeLargeBacktrack,
    collapseCollinearBacktracks,
} from './smartEdgeBacktrackSimplification';
export {
    removeSmallJogs,
    collapseRedundantBends,
} from './smartEdgeJogSimplification';
export {
    createRoundedPathWithJumps,
    getSmartLabelPosition,
} from './smartEdgeJumpRendering';
export {
    removeShortDiagonals,
    nudgeSegments,
    getClosestDistanceToPath,
} from './smartEdgeSegmentAdjustment';
export type { OrthoOptions } from './smartEdgeOrthogonalization';
export { makePathOrthogonal } from './smartEdgeOrthogonalization';
export {
    getCandidatePorts,
    selectBestPortCombination,
    routeWithAStar,
    enforcePortSpacing,
    removeTinyOrthogonalJogs,
} from './smartEdgePortRouting';
export {
    smoothShortSegments,
    createFilletedPath,
    offsetPathSegments,
} from './smartEdgeFilletRendering';
export { createPathWithJumpsFromObstacles } from './smartEdgeObstacleJumpRendering';
export {
    generateGreedyOrthogonalPath,
    alignSegmentsToObstacles,
    optimizeOrthogonalPath,
} from './smartEdgeOrchestration';
