type Viewport = { x: number; y: number; zoom: number };

type ReactFlowViewportInstance = {
  setViewport: (viewport: Viewport) => void;
};

const MIN_READABLE_EDGE_LABEL_ZOOM = 0.72;
const MAX_EDGE_LABEL_SCALE = 2.4;

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

  if (viewport.zoom < 0.4) {
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
  fitMode: 'fitWidthTop' | 'fitAll' | 'none';
  lastViewport: Viewport | null | undefined;
}): boolean => {
  if (!lastViewport || fitMode !== 'none') {
    return false;
  }

  instance.setViewport(lastViewport);
  return true;
};

export const createBaseReactFlowExportStateHandlers = ({
  setHidden,
}: {
  setHidden: (hidden: boolean) => void;
}) => ({
  onStart: () => setHidden(true),
  onStop: () => setHidden(false),
});
