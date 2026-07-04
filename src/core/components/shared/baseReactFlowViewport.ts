type Viewport = { x: number; y: number; zoom: number };

type ReactFlowViewportInstance = {
  setViewport: (viewport: Viewport) => void;
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
