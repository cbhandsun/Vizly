import { useCallback, useRef, type RefObject } from 'react';

import {
  isBaseReactFlowZoomedOut,
  resolveBaseReactFlowContainerClassName,
  syncBaseReactFlowZoomClass,
} from './baseReactFlowViewport';

type Viewport = { x: number; y: number; zoom: number };

export const useBaseReactFlowViewportSemanticState = (
  containerRef: RefObject<HTMLDivElement | null>,
) => {
  const zoomedOutRef = useRef(false);
  const syncViewportSemanticState = useCallback((viewport: Viewport) => {
    zoomedOutRef.current = isBaseReactFlowZoomedOut(viewport);
    syncBaseReactFlowZoomClass({ container: containerRef.current, viewport });
  }, [containerRef]);
  const resolveContainerClassName = useCallback((
    baseClassName: string,
    isLayoutStable: boolean,
  ) => resolveBaseReactFlowContainerClassName({
    baseClassName,
    isLayoutStable,
    zoomedOut: zoomedOutRef.current,
  }), []);

  return { resolveContainerClassName, syncViewportSemanticState };
};
