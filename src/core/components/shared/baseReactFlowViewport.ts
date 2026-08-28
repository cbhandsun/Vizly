type Viewport = { x: number; y: number; zoom: number };

import { isUsablePersistedDiagramViewport } from '../../utils/viewportPersistence';

type ReactFlowViewportInstance = {
  setViewport: (viewport: Viewport) => void;
};

export type BaseReactFlowInitialFitMode = 'fitWidthTop' | 'fitAll' | 'none' | 'restoreOrFitAll';

const MIN_READABLE_EDGE_LABEL_ZOOM = 0.72;
const MAX_EDGE_LABEL_SCALE = 2.4;

export const isBaseReactFlowZoomedOut = (viewport: Viewport): boolean => (
  Number.isFinite(viewport.zoom) && viewport.zoom < 0.4
);

export const resolveBaseReactFlowContainerClassName = ({
  baseClassName,
  isLayoutStable,
  zoomedOut,
}: {
  baseClassName: string;
  isLayoutStable: boolean;
  zoomedOut: boolean;
}): string => [
  baseClassName,
  zoomedOut ? 'diagram-zoomed-out' : '',
  isLayoutStable ? '' : 'vizly-layout-committing',
].filter(Boolean).join(' ');

const edgeLabelScaleForZoom = (zoom: number): number => {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(MAX_EDGE_LABEL_SCALE, Math.max(1, MIN_READABLE_EDGE_LABEL_ZOOM / zoom));
};

export const syncBaseReactFlowZoomClass = ({
  container,
  viewport,
  zoomedOutClassName = 'diagram-zoomed-out',
}: {
  container: HTMLElement | null;
  viewport: Viewport;
  zoomedOutClassName?: string;
}): void => {
  if (!container) return;

  container.style.setProperty(
    '--diagram-edge-label-scale',
    edgeLabelScaleForZoom(viewport.zoom).toFixed(3),
  );

  if (isBaseReactFlowZoomedOut(viewport)) {
    if (!container.classList.contains(zoomedOutClassName)) {
      container.classList.add(zoomedOutClassName);
    }
    return;
  }

  if (container.classList.contains(zoomedOutClassName)) {
    container.classList.remove(zoomedOutClassName);
  }
};

export const restoreBaseReactFlowViewportOnInit = ({
  instance,
  fitMode,
  lastViewport,
}: {
  instance: ReactFlowViewportInstance;
  fitMode: BaseReactFlowInitialFitMode;
  lastViewport: Viewport | null | undefined;
}): boolean => {
  if (
    (fitMode !== 'none' && fitMode !== 'restoreOrFitAll')
    || !isUsableBaseReactFlowViewport(lastViewport)
  ) {
    return false;
  }

  instance.setViewport(lastViewport);
  return true;
};

export const isUsableBaseReactFlowViewport = (
  viewport: Viewport | null | undefined,
): viewport is Viewport => isUsablePersistedDiagramViewport(viewport);

/**
 * `restoreOrFitAll` is resolved once per mounted canvas. This prevents an
 * initial blank canvas without turning subsequent node/layout changes into a
 * permanently pinned fit operation that would overwrite the user's viewport.
 */
export const resolveBaseReactFlowInitialFitMode = ({
  fitMode,
  lastViewport,
}: {
  fitMode: BaseReactFlowInitialFitMode;
  lastViewport: Viewport | null | undefined;
}): 'fitWidthTop' | 'fitAll' | 'none' => {
  if (fitMode !== 'restoreOrFitAll') return fitMode;
  return isUsableBaseReactFlowViewport(lastViewport) ? 'none' : 'fitAll';
};

export const createBaseReactFlowExportStateHandlers = ({
  setHidden,
}: {
  setHidden: (hidden: boolean) => void;
}) => ({
  onStart: () => setHidden(true),
  onStop: () => setHidden(false),
});
