// packages/core/src/components/custom-edges/hooks/useSmartEdgeRouting.ts
import { useMemo, useRef, useState, useEffect } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { Position, getSmoothStepPath } from '@xyflow/react';
import { useStore } from '@xyflow/react';
import { useSmartEdgeContext } from '../useSmartEdgeContext';
import { useSmartPathWorker } from './useSmartPathWorker';
import { useObstaclesForEdge } from '../obstacleContext';
import { useLayoutStability } from '../../../context/LayoutStabilityContext';
import { useChannelRouting } from './useChannelRouting';
import { useLineJumps } from './useLineJumps';
import { createFilletedPath, getSmartLabelPosition, getClosestDistanceToPath } from '../../../algorithms/smartEdgeUtils';
import {
    getRenderedPathCache as _getRenderedPathCache,
    setRenderedPathCacheValue as _setRenderedPathCacheValue,
} from '../../../routing/renderedPathCache';
import {
    collectRoutingNodeRects,
} from './smartEdgeRoutingGeometry';
import {
    collectBoundedRenderedLabelAvoidancePaths,
    getLabelAutoOffset,
    getRenderedBusinessObstacles,
} from './smartEdgeRoutingRenderedGeometry';
import { resolveRenderedSmartEdgePath } from './smartEdgeRoutingRenderedPath';
import type { SimpleNodeData } from '../../../hooks/useNodeMap';
import type { CenteredCoords, EdgeData } from './useSmartPathWorker';

export { __smartEdgeRoutingTestUtils } from './smartEdgeRoutingRenderedRepairs';

export interface UseSmartEdgeRoutingReturn {
  safeFinalPath: string;
  finalLabelX: number;
  finalLabelY: number;
  crossfadeOpacity: number;
  opacity: number;
  isLoading: boolean;
  nodesDragging: boolean;
  shouldRenderDebugVisuals: boolean;
  shouldRenderPortHeatmap: boolean;
  isStale: boolean;
  workerSmartPoints: { x: number; y: number }[] | null;
  obstacles: ReturnType<typeof useObstaclesForEdge>;
  isBusEdge: boolean;
  centeredCoords: CenteredCoords;
  workerSmartLabelPos: { x: number; y: number } | null;
  simpleNodeMap: Map<string, SimpleNodeData>;
}

export function useSmartEdgeRouting(props: EdgeProps): UseSmartEdgeRoutingReturn {
  const { id, source, target } = props;
  const context = useSmartEdgeContext(props);
  const { simpleNodeMap, storeEdges, layoutDirection, multiEdgeInfo, centeredCoords, fallbackPositions, edgeConfig, respectSourceHandle, respectTargetHandle, isReverseEdge, nodesDragging, sourceHandleId, targetHandleId } = context;

  const obstacles = useObstaclesForEdge(source, target);
  const zoomLevel = useStore((state) => state.transform[2]);
  const isLayoutStable = useLayoutStability();

  const edgeData = props.data as EdgeData | undefined;
  const safeFallbackPositions = useMemo(() => ({
      sourcePos: fallbackPositions?.sourcePos || Position.Right,
      targetPos: fallbackPositions?.targetPos || Position.Left,
  }), [fallbackPositions?.sourcePos, fallbackPositions?.targetPos]);

  const safeObstacles = Array.isArray(obstacles)
      ? obstacles.map(({ id: obstacleId, x, y, width, height, type }) => ({
          id: obstacleId,
          x,
          y,
          width,
          height,
          type,
      }))
      : [];
  const routingNodeRects = useMemo(
      () => collectRoutingNodeRects(simpleNodeMap),
      [simpleNodeMap]
  );
  const renderedBusinessObstacles = useMemo(
      () => getRenderedBusinessObstacles(routingNodeRects, source, target),
      [routingNodeRects, source, target]
  );
  const hasSameSourceFanOut = useMemo(() => {
      return storeEdges.some(edge => edge.id !== id && edge.source === source);
  }, [storeEdges, id, source]);

  // 1. Worker Calculation
  const { path: workerPath, smartLabelPos: workerSmartLabelPos, smartPoints: workerSmartPoints, isLoading } = useSmartPathWorker({
      id, source, target, centeredCoords,
      fallbackPositions: safeFallbackPositions,
      obstacles: safeObstacles,
      simpleNodeMap,
      storeEdges,
      edgeConfig,
      layoutDirection,
      zoomLevel,
      respectSourceHandle,
      respectTargetHandle,
      isReverseEdge,
      nodesDragging,
      sourceHandleId, targetHandleId,
      edgeData: edgeData ?? {},
      multiEdgeInfo,
      isLayoutStable
  });

  // 2. Fallbacks
  const renderPositions = useMemo(() => {
      const sourcePos = fallbackPositions.sourcePos || props.sourcePosition || Position.Right;
      const targetPos = fallbackPositions.targetPos || props.targetPosition || Position.Left;
      return { sourcePos, targetPos };
  }, [fallbackPositions.sourcePos, fallbackPositions.targetPos, props.sourcePosition, props.targetPosition]);

  const visualCornerRadius = (() => {
      const raw = Number(edgeConfig.renderCornerRadius ?? edgeConfig.visualCornerRadius ?? edgeConfig.borderRadius ?? 8);
      if (!Number.isFinite(raw)) return 8;
      return Math.max(0, Math.min(24, raw));
  })();
  const structuralCornerRadius = edgeConfig.strictOrthogonal ? 0 : visualCornerRadius;

  const [_fallbackPath, _fallbackLabelX, _fallbackLabelY] = useMemo(() => {
      return getSmoothStepPath({
          sourceX: props.sourceX,
          sourceY: props.sourceY,
          sourcePosition: renderPositions.sourcePos,
          targetX: props.targetX,
          targetY: props.targetY,
          targetPosition: renderPositions.targetPos,
          borderRadius: structuralCornerRadius,
      });
  }, [props.sourceX, props.sourceY, props.targetX, props.targetY, renderPositions.sourcePos, renderPositions.targetPos, structuralCornerRadius]);

  const [hasCacheOnMount] = useState(() => _getRenderedPathCache().has(id));
  const isSharedTrunkEdge = !!(
      multiEdgeInfo?.isOneToMany ||
      multiEdgeInfo?.isManyToOne ||
      edgeData?.isTreeBus
  );
  const isBusEdge = !!(
      isSharedTrunkEdge ||
      edgeData?.treeRouting
  );
  const isLayoutPathLocked = !!(
      edgeData?.layoutPathLocked ||
      edgeData?._layoutPathLocked
  );
  const renderCornerRadius = structuralCornerRadius;

  // 3. Channel Routing
  // [UPGRADE] Channel routing is now handled at the Coordinator level (applyGlobalNudge),
  // which writes results back to path data. Running it again here would cause double-shifting.
  const channelPoints = useChannelRouting({
      edgeId: id,
      points: workerSmartPoints,
      enabled: false,  // Disabled: Coordinator-level globalChannelRouting handles this
  });

  // 4. Stale Detection
  const isStale = useMemo(() => {
      if (!workerSmartPoints || workerSmartPoints.length < 2 || !workerPath) return false;
      if (!isLoading && !nodesDragging) return false;

      const firstPt = workerSmartPoints[0];
      const lastPt = workerSmartPoints[workerSmartPoints.length - 1];
      if (respectSourceHandle || respectTargetHandle) {
          const endpointTolerance = 45;
          const sourceStale = respectSourceHandle
              && (Math.abs(firstPt.x - centeredCoords.sourceX) > endpointTolerance || Math.abs(firstPt.y - centeredCoords.sourceY) > endpointTolerance);
          const targetStale = respectTargetHandle
              && (Math.abs(lastPt.x - centeredCoords.targetX) > endpointTolerance || Math.abs(lastPt.y - centeredCoords.targetY) > endpointTolerance);
          if (sourceStale || targetStale) return true;
      }
      return Math.abs(firstPt.x - props.sourceX) > 150 || 
             Math.abs(firstPt.y - props.sourceY) > 150 || 
             Math.abs(lastPt.x - props.targetX) > 150 || 
             Math.abs(lastPt.y - props.targetY) > 150;
  }, [workerSmartPoints, workerPath, props.sourceX, props.sourceY, props.targetX, props.targetY, isLoading, nodesDragging, centeredCoords, respectSourceHandle, respectTargetHandle]);
  const loadedInCurrentRender = !isLoading && !isStale;
  const hasLoadedCandidate = loadedInCurrentRender || hasCacheOnMount;

  const canUseFreshWorkerPath = !nodesDragging && !isLoading && !isStale;

  // 5. Final Path Resolution
  const finalPath = useMemo(() => {
      const cache = _getRenderedPathCache();
      const cachedPath = cache.get(id);

      if (!nodesDragging && cachedPath && (isLoading || isStale)) {
          return cachedPath;
      }

      if (canUseFreshWorkerPath && channelPoints && channelPoints.length > 1) {
          const p = createFilletedPath(channelPoints, renderCornerRadius);
          _setRenderedPathCacheValue(id, p);
          return p;
      }

      if (canUseFreshWorkerPath && edgeConfig.strictOrthogonal && workerSmartPoints && workerSmartPoints.length > 1) {
          const p = createFilletedPath(workerSmartPoints, 0);
          _setRenderedPathCacheValue(id, p);
          return p;
      }

      const useFallback = nodesDragging || isStale || (isLoading && !cachedPath);
      const result = useFallback ? _fallbackPath : (workerPath || cachedPath || _fallbackPath);
      
      if (result && result !== _fallbackPath) {
          _setRenderedPathCacheValue(id, result);
      }
      return result;
  }, [nodesDragging, channelPoints, renderCornerRadius, workerPath, _fallbackPath, isLoading, id, isStale, workerSmartPoints, edgeConfig.strictOrthogonal, canUseFreshWorkerPath]);

  // 6. Line Jumps
  // [FIX-FILLET] Pass cornerRadius so jumpPath retains rounded corners.
  // Prefer channelPoints (post-channel-adjusted) over raw workerSmartPoints
  // to ensure jump detection uses the same points as finalPath.
  const jumpInputPoints = (canUseFreshWorkerPath && channelPoints && channelPoints.length > 1)
      ? channelPoints 
      : (canUseFreshWorkerPath ? workerSmartPoints : null);
  const { jumpPath } = useLineJumps({
      edgeId: id,
      sourceId: source,
      targetId: target,
      points: jumpInputPoints,
      enabled: canUseFreshWorkerPath,
      // Preserve bus/tree trunk geometry exactly. Jump arcs visually bend the
      // shared trunk, which is worse than an ordinary crossing under the routing
      // goals (orthogonal > obstacle avoidance > shared trunk > fewer crossings).
      renderJumps: !isBusEdge && !edgeConfig.strictOrthogonal,
      cornerRadius: renderCornerRadius,
  });

  const busGeometryPath = useMemo(() => {
      if (!isBusEdge || !jumpInputPoints || jumpInputPoints.length < 2) return null;
      return createFilletedPath(jumpInputPoints, renderCornerRadius);
  }, [isBusEdge, jumpInputPoints, renderCornerRadius]);
  const safeFinalPath = resolveRenderedSmartEdgePath({
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
  });
  const hasVisibleCandidate = hasLoadedCandidate || hasCacheOnMount;
  const hasCachedVisiblePath = !!_getRenderedPathCache().get(id);
  const canKeepPreviousPathVisible = hasVisibleCandidate && hasCachedVisiblePath && (isLoading || isStale);
  const opacity = (
      nodesDragging
      || (isLayoutStable && (isLoading || canUseFreshWorkerPath || canKeepPreviousPathVisible))
  ) ? 1 : 0;

  // 7. Crossfade Opacity
  const prevPathRef = useRef<string>(safeFinalPath);
  const [crossfadeOpacity, setCrossfadeOpacity] = useState(1);
  useEffect(() => {
      if (nodesDragging || !hasLoadedCandidate) {
          prevPathRef.current = safeFinalPath;
          return;
      }
      if (prevPathRef.current !== safeFinalPath && prevPathRef.current.length > 10) {
          const fadeOutTimer = setTimeout(() => setCrossfadeOpacity(0.3), 0);
          const fadeInTimer = setTimeout(() => setCrossfadeOpacity(1), 50);
          prevPathRef.current = safeFinalPath;
          return () => {
              clearTimeout(fadeOutTimer);
              clearTimeout(fadeInTimer);
          };
      }
      prevPathRef.current = safeFinalPath;
      return undefined;
  }, [safeFinalPath, nodesDragging, hasLoadedCandidate]);

  // 8. Final Label Position
  const finalLabelPos = (() => {
      if (nodesDragging || isLoading || isStale) {
          return { x: _fallbackLabelX, y: _fallbackLabelY };
      }

      let computedFromPoints: { x: number; y: number } | null = null;
      const candidatePoints = workerSmartPoints;
      if (candidatePoints && candidatePoints.length > 1) {
          computedFromPoints = getSmartLabelPosition(candidatePoints);
      }

      const getWorkerDerivedLabelPos = () => {
          const d = workerPath;
          if (!d || typeof d !== 'string') return null;

          const points: { x: number, y: number }[] = [];
          try {
              const commands = d.replace(/([a-zA-Z])/g, '|$1').split('|').filter(c => c.trim());
              for (const cmdStr of commands) {
                  const parts = cmdStr.trim().split(/[\s,]+/).filter(p => p !== '');
                  if (parts.length === 0) continue;
                  const type = parts[0].toUpperCase();
                  const nums = parts.slice(1).map(Number);
                  const pushPoint = (x: number, y: number) => {
                      if (!isNaN(x) && !isNaN(y)) points.push({ x, y });
                  };
                  if (type === 'M' && nums.length >= 2) pushPoint(nums[0], nums[1]);
                  else if (type === 'L' && nums.length >= 2) pushPoint(nums[0], nums[1]);
                  else if (type === 'Q' && nums.length >= 4) pushPoint(nums[2], nums[3]);
                  else if (type === 'C' && nums.length >= 6) pushPoint(nums[4], nums[5]);
              }
          } catch { return null; }

          if (points.length < 2) return null;
          return getSmartLabelPosition(points);
      };

      const workerDerivedPos = getWorkerDerivedLabelPos();

      const predictBusLabelPos = () => {
          if (!multiEdgeInfo) return null;
          const points = workerSmartPoints;
          if (!points || points.length < 2) return null;

          const info = multiEdgeInfo;
          let idx = info.incomingIndex ?? info.outgoingIndex ?? 0;
          let cnt = info.incomingCount ?? info.outgoingCount ?? 1;

          if (info.isManyToOne && typeof info.incomingCount === 'number') {
              idx = info.incomingIndex;
              cnt = info.incomingCount;
          } else if (info.isOneToMany && typeof info.outgoingCount === 'number') {
              idx = info.outgoingIndex;
              cnt = info.outgoingCount;
          }
          if (cnt <= 1) return null;

          const spacing = 25; 
          const spread = (idx - (cnt - 1) / 2) * spacing;
          const isVerticalLayout = ['TB', 'BT'].includes(layoutDirection || 'TB');

          const shiftedPoints = points.map((p: {x: number, y: number}) => ({
              x: isVerticalLayout ? p.x + spread : p.x,
              y: isVerticalLayout ? p.y : p.y + spread
          }));

          return getSmartLabelPosition(shiftedPoints) || null;
      };

      const predictedPos = predictBusLabelPos();
      const baseFromRouting = workerDerivedPos || predictedPos || computedFromPoints || workerSmartLabelPos || { x: _fallbackLabelX, y: _fallbackLabelY };

      const posFromData = edgeData?.labelPosition;
      let base = baseFromRouting;

      const isUsingWorker = !!(workerDerivedPos || computedFromPoints || workerSmartLabelPos);
      const isUsingPrediction = !workerDerivedPos && !!predictedPos;
      const hasWorkerPoints = !!workerSmartPoints;
      const canRunSanityCheck = (!isUsingWorker && !isUsingPrediction) || hasWorkerPoints;

      if (posFromData && typeof posFromData.x === 'number' && isFinite(posFromData.x) && typeof posFromData.y === 'number' && isFinite(posFromData.y)) {
          let isValid = true;
          if (canRunSanityCheck && candidatePoints && candidatePoints.length > 1) {
            // [FIX N-4] 阈值从 2px 放宽到 80px。
            // 2px 过于严苛：路径点 Math.round 精度误差、Nudge 偏移等都会超过 2px，
            // 导致用户手动调整的标签每次路由更新后跳回默认位置。
            // 80px 可过滤真正游离的位置，同时允许标签合理偏离路径中心。
            const dist = getClosestDistanceToPath({ x: posFromData.x, y: posFromData.y }, candidatePoints);
            if (dist > 80) isValid = false;
          } else if (isUsingWorker && !hasWorkerPoints) {
              isValid = false;
          }
          if (isValid) base = { x: posFromData.x, y: posFromData.y };
      }

      const offset = edgeData?.labelOffset;
      const ox = offset && typeof offset.x === 'number' && isFinite(offset.x) ? offset.x : 0;
      const oy = offset && typeof offset.y === 'number' && isFinite(offset.y) ? offset.y : 0;

      let x = base.x + ox;
      let y = base.y + oy;
      const hasManualLabelPosition = !!offset
          || typeof edgeData?.absoluteLabelX === 'number'
          || typeof edgeData?.absoluteLabelY === 'number';
      const labelText = String(edgeData?.label ?? props.label ?? '');
      if (!hasManualLabelPosition && labelText) {
          const labelAvoidancePaths = collectBoundedRenderedLabelAvoidancePaths(
              _getRenderedPathCache(),
              id,
          );
          const autoOffset = getLabelAutoOffset(
              safeFinalPath,
              { x, y },
              labelText,
              labelAvoidancePaths,
              renderedBusinessObstacles,
          );
          x += autoOffset.x;
          y += autoOffset.y;
      }

      if (typeof edgeData?.absoluteLabelX === 'number' && isFinite(edgeData.absoluteLabelX)) {
          let validAbs = true;
          if (!isUsingPrediction && candidatePoints && candidatePoints.length > 1) {
              const checkY = (typeof edgeData?.absoluteLabelY === 'number' && isFinite(edgeData.absoluteLabelY))
                  ? edgeData.absoluteLabelY : y;
              const dist = getClosestDistanceToPath({ x: edgeData.absoluteLabelX, y: checkY }, candidatePoints);
              if (dist > 80) validAbs = false; // [FIX N-4]
          }
          if (validAbs || !candidatePoints) x = edgeData.absoluteLabelX;
      }

      if (typeof edgeData?.absoluteLabelY === 'number' && isFinite(edgeData.absoluteLabelY)) {
          let validAbs = true;
          if (!isUsingPrediction && candidatePoints && candidatePoints.length > 1) {
              const checkX = (typeof edgeData?.absoluteLabelX === 'number' && isFinite(edgeData.absoluteLabelX))
                  ? edgeData.absoluteLabelX : x;
              const dist = getClosestDistanceToPath({ x: checkX, y: edgeData.absoluteLabelY }, candidatePoints);
              if (dist > 80) validAbs = false;  // [FIX N-4] 同上：80px
          }
          if (validAbs || !candidatePoints) y = edgeData.absoluteLabelY;
      }

      return { x, y };
  })();

  const isGlobalDebugMode = import.meta.env.DEV
    && typeof window !== 'undefined'
    && window.localStorage?.getItem('__diagram_debug_mode__') === 'true';
  const shouldRenderDebugVisuals = edgeConfig.debug && isGlobalDebugMode;
  const shouldRenderPortHeatmap = edgeConfig.debugPortHeatmap && isGlobalDebugMode;

  return {
    safeFinalPath,
    finalLabelX: finalLabelPos.x,
    finalLabelY: finalLabelPos.y,
    crossfadeOpacity,
    opacity,
    isLoading,
    nodesDragging: !!nodesDragging,
    shouldRenderDebugVisuals,
    shouldRenderPortHeatmap,
    isStale,
    workerSmartPoints,
    obstacles,
    isBusEdge,
    centeredCoords,
    workerSmartLabelPos,
    simpleNodeMap,
  };
}
