import { useCallback, useRef, type RefObject } from 'react';

import {
  isBaseReactFlowFarZoomedOut,
  isBaseReactFlowZoomedOut,
  resolveBaseReactFlowContainerClassName,
  syncBaseReactFlowZoomClass,
} from './baseReactFlowViewport';

type Viewport = { x: number; y: number; zoom: number };

export const useBaseReactFlowViewportSemanticState = (
  containerRef: RefObject<HTMLDivElement | null>,
) => {
  const zoomedOutRef = useRef(false);
  const farZoomedOutRef = useRef(false);
  const syncViewportSemanticState = useCallback((viewport: Viewport) => {
    zoomedOutRef.current = isBaseReactFlowZoomedOut(viewport);
    farZoomedOutRef.current = isBaseReactFlowFarZoomedOut(viewport);
    syncBaseReactFlowZoomClass({ container: containerRef.current, viewport });
  }, [containerRef]);
  const resolveContainerClassName = useCallback((
    baseClassName: string,
    isLayoutStable: boolean,
  ) => resolveBaseReactFlowContainerClassName({
    baseClassName,
    isLayoutStable,
    zoomedOut: zoomedOutRef.current,
    farZoomedOut: farZoomedOutRef.current,
  }), []);

  return { resolveContainerClassName, syncViewportSemanticState };
};
