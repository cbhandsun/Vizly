import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';

import { diagramConfigManager } from '@/core/config/DiagramConfig';
import { getWindowSearchString } from '../../utils/inputBoundary';
import {
  computeBaseReactFlowFitViewport,
  computeBaseReactFlowNodeBounds,
  expandBaseReactFlowBoundsForEdges,
  shouldSkipBaseReactFlowMinorResize,
} from './baseReactFlowFitWidthTop';
import { resolveBaseReactFlowFitSchedule, type BaseReactFlowFitMode } from './baseReactFlowFitSchedule';
import {
  computeBaseReactFlowNodeStructureSignature,
  scheduleBaseReactFlowInitializationReset,
  shouldResetBaseReactFlowInitialization,
} from './baseReactFlowInitialization';
import { readBaseReactFlowFitRatio, readBaseReactFlowMaxFitZoom } from './baseReactFlowFitConfig';
import { logBaseReactFlowConfigReadFailure, logBaseReactFlowEventBindingFailure, logBaseReactFlowFitWidthTopFailure } from './baseReactFlowLogging';
import { applyDiagramOverviewFit, readDiagramOverviewFitInput, sameDiagramViewport } from './diagramOverviewFit';
import { waitForDiagramControlViewportPaint } from './diagramControlPaint';
import type { DiagramFitViewport } from './diagramControlFit';

type ContainerSize = { width: number; height: number };

interface UseBaseReactFlowFitControllerParams {
  rfInstance: Pick<ReactFlowInstance<Node, Edge>, 'fitView' | 'getNodes' | 'getEdges' | 'getViewport' | 'setViewport'>;
  containerRef?: RefObject<HTMLElement | null>;
  syncSemanticViewport?: (viewport: DiagramFitViewport) => void;
  renderNodes: Node[];
  visibleNodeCount: number;
  edges: Edge[];
  containerSize: ContainerSize;
  fitMode: BaseReactFlowFitMode;
  fitTriggerKey?: string | number;
  pinFit: boolean;
  fitPadding: number;
  minZoom: number;
  maxZoom: number;
  defaultDebounceMs: number;
}

export const useBaseReactFlowFitController = ({
  rfInstance,
  containerRef,
  syncSemanticViewport,
  renderNodes,
  visibleNodeCount,
  edges,
  containerSize,
  fitMode,
  fitTriggerKey,
  pinFit,
  fitPadding,
  minZoom,
  maxZoom,
  defaultDebounceMs,
}: UseBaseReactFlowFitControllerParams): void => {
  const [hasInitialized, setHasInitialized] = useState(false);
  const previousNodeSignatureRef = useRef('');
  const previousBoundsRef = useRef<unknown>(null);
  const previousContainerRef = useRef<ContainerSize | null>(null);
  const cooldownUntilRef = useRef(0);
  const lastZoomRef = useRef<number | null>(null);
  const initializedAtRef = useRef(0);
  const lastFitTriggerKeyRef = useRef(fitTriggerKey);
  const lastOverviewViewportRef = useRef<DiagramFitViewport | null>(null);

  useEffect(() => {
    const currentSignature = computeBaseReactFlowNodeStructureSignature(renderNodes);
    const previousSignature = previousNodeSignatureRef.current;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const shouldPreserveUserViewport = !pinFit && hasInitialized;
    if (!shouldPreserveUserViewport && shouldResetBaseReactFlowInitialization({
      currentSignature,
      previousSignature,
      nodeCount: visibleNodeCount,
    })) {
      resetTimer = scheduleBaseReactFlowInitializationReset({
        setHasInitialized,
        prevBBoxRef: previousBoundsRef,
        prevContainerRef: previousContainerRef,
        cooldownUntilRef,
        lastZoomRef,
        initAtRef: initializedAtRef,
      });
    }

    previousNodeSignatureRef.current = currentSignature;
    return () => {
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [hasInitialized, pinFit, renderNodes, visibleNodeCount]);

  const performFitWidthTop = useCallback((force?: boolean): boolean => {
    if (!rfInstance || containerSize.width <= 0 || containerSize.height <= 0) return false;
    if (!force && Date.now() < cooldownUntilRef.current) return false;
    if (!force && hasInitialized && shouldSkipBaseReactFlowMinorResize({
      currentSize: containerSize,
      previousSize: previousContainerRef.current,
      nodeCount: visibleNodeCount,
    })) return false;

    try {
      const currentNodes = rfInstance.getNodes();
      if (currentNodes.length === 0) return false;
      const nodeBounds = computeBaseReactFlowNodeBounds(currentNodes);
      if (!nodeBounds) return false;
      const expandedBounds = expandBaseReactFlowBoundsForEdges({ bounds: nodeBounds, edges });
      const fitRatio = readBaseReactFlowFitRatio({
        search: getWindowSearchString(),
        readConfig: () => diagramConfigManager.getConfig(),
        onReadFailure: error => logBaseReactFlowConfigReadFailure('canvas.zoom.fitRatio', error),
      });
      const maxFitZoom = readBaseReactFlowMaxFitZoom({
        readConfig: () => diagramConfigManager.getConfig(),
        onReadFailure: error => logBaseReactFlowConfigReadFailure('canvas.zoom.maxFitZoom', error),
      });
      const { x, y, zoom } = computeBaseReactFlowFitViewport({
        bounds: expandedBounds,
        containerSize,
        fitPadding: Math.max(0, fitPadding),
        fitRatio,
        maxFitZoom,
        minZoom,
        maxZoom,
        hasInitialized,
        lastZoom: lastZoomRef.current,
        force,
        previousContainer: previousContainerRef.current,
      });

      rfInstance.setViewport({ x, y, zoom }, { duration: hasInitialized ? 300 : 0 });
      lastZoomRef.current = zoom;
      previousBoundsRef.current = expandedBounds;
      previousContainerRef.current = { ...containerSize };
      cooldownUntilRef.current = Date.now()
        + (hasInitialized ? Math.min(1_000, 300 + Math.min(visibleNodeCount, 700)) : 120);
      if (!hasInitialized) setHasInitialized(true);
      return true;
    } catch (error) {
      logBaseReactFlowFitWidthTopFailure(error);
      return false;
    }
  }, [
    containerSize,
    edges,
    fitPadding,
    hasInitialized,
    maxZoom,
    minZoom,
    rfInstance,
    visibleNodeCount,
  ]);

  useEffect(() => {
    const schedulePlan = resolveBaseReactFlowFitSchedule({
      fitMode,
      hasInstance: Boolean(rfInstance),
      nodeCount: visibleNodeCount,
      fitTriggerKey,
      lastFitTriggerKey: lastFitTriggerKeyRef.current,
      pinFit,
      hasInitialized,
      containerSize,
      previousContainer: previousContainerRef.current,
      defaultDebounceMs,
    });
    if (!schedulePlan.shouldSchedule) return;

    const scheduledViewport = rfInstance.getViewport();
    // After an unpinned overview, a user's pan/zoom owns subsequent resizes.
    // A new explicit trigger remains an intentional request to fit again.
    if (fitMode === 'fitAll' && !pinFit && hasInitialized && !schedulePlan.isTriggerKeyChanged
      && (!lastOverviewViewportRef.current || !sameDiagramViewport(lastOverviewViewportRef.current, scheduledViewport))) return;
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      if (fitMode === 'fitWidthTop') {
        performFitWidthTop(schedulePlan.isTriggerKeyChanged);
      } else if (fitMode === 'fitAll') {
        // A gesture or restored viewport during the existing debounce wins
        // over this older automatic request, including before initialization.
        if (!pinFit && !sameDiagramViewport(scheduledViewport, rfInstance.getViewport())) {
          lastOverviewViewportRef.current = null;
          previousContainerRef.current = { ...containerSize };
          if (!hasInitialized) setHasInitialized(true);
        } else {
          let appliedViewport: DiagramFitViewport | null = null;
          void applyDiagramOverviewFit({
            readFitInput: () => readDiagramOverviewFitInput({
              container: containerRef?.current ?? null, fallbackSize: containerSize,
              nodes: rfInstance.getNodes(), edges: rfInstance.getEdges(), viewport: rfInstance.getViewport(),
            }),
            getViewport: rfInstance.getViewport,
            setViewport: async viewport => {
              const applied = await rfInstance.setViewport(viewport);
              if (applied) appliedViewport = viewport;
              return applied;
            },
            fallbackFit: async () => false,
            syncSemanticViewport,
            waitForPaint: () => waitForDiagramControlViewportPaint({ signal: controller.signal }),
            isCancelled: () => controller.signal.aborted,
          }).then(applied => {
            if (!applied || controller.signal.aborted) return;
            lastOverviewViewportRef.current = appliedViewport;
            previousContainerRef.current = { ...containerSize };
            if (!hasInitialized) setHasInitialized(true);
          }).catch(error => {
            if (!controller.signal.aborted) logBaseReactFlowEventBindingFailure('fitAll', error);
          });
        }
      }
      if (schedulePlan.isTriggerKeyChanged) lastFitTriggerKeyRef.current = fitTriggerKey;
    }, schedulePlan.debounceTime);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    containerSize,
    containerRef,
    defaultDebounceMs,
    fitMode,
    fitPadding,
    fitTriggerKey,
    hasInitialized,
    performFitWidthTop,
    pinFit,
    rfInstance,
    syncSemanticViewport,
    visibleNodeCount,
  ]);
};
