type ReactFlowNodeInternalsState = {
  updateNodeInternals?: unknown;
  nodeLookup?: Map<string, { internals?: { handleBounds?: { source?: unknown[]; target?: unknown[] } } }>;
};

type ReactFlowStoreApi = {
  getState: () => unknown;
};

type RefreshFn = () => void;

const readReactFlowNodeInternalsState = (
  rfStore: ReactFlowStoreApi,
): ReactFlowNodeInternalsState => {
  const state = rfStore.getState();
  return typeof state === 'object' && state !== null
    ? state as ReactFlowNodeInternalsState
    : {};
};

export const getBaseReactFlowNodeElement = (
  container: HTMLElement | null,
  id: string
): HTMLElement | null => {
  const safeId = String(id).replace(/"/g, '\\"');
  return container?.querySelector(`.react-flow__node[data-id="${safeId}"]`) as HTMLElement | null;
};

export const refreshBaseReactFlowNodeInternals = ({
  container,
  nodeIds,
  rfStore,
  updateNodeInternals,
}: {
  container: HTMLElement | null;
  nodeIds: string[];
  rfStore: ReactFlowStoreApi;
  updateNodeInternals: (nodeIds: string[]) => void;
}): void => {
  const state = readReactFlowNodeInternalsState(rfStore);
  const internalsMap = new Map<string, { id: string; nodeElement: HTMLElement; force: boolean }>();

  for (const id of nodeIds) {
    const nodeElement = getBaseReactFlowNodeElement(container, id);
    if (nodeElement) {
      internalsMap.set(id, { id, nodeElement, force: true });
    }
  }

  if (internalsMap.size > 0 && typeof state.updateNodeInternals === 'function') {
    state.updateNodeInternals(internalsMap, { triggerFitView: false });
    return;
  }

  updateNodeInternals(nodeIds);
};

export const areBaseReactFlowHandlesMeasured = ({
  container,
  nodeIds,
  rfStore,
}: {
  container: HTMLElement | null;
  nodeIds: string[];
  rfStore: ReactFlowStoreApi;
}): boolean => {
  const state = readReactFlowNodeInternalsState(rfStore);
  const nodeLookup = state.nodeLookup;
  if (!(nodeLookup instanceof Map)) return false;
  const handlesAreHiddenBySemanticZoom = container?.classList.contains(
    'diagram-zoomed-out',
  ) ?? false;

  return nodeIds.every((id) => {
    const element = getBaseReactFlowNodeElement(container, id);
    if (!element) return false;
    if (!element.querySelector('.react-flow__handle')) return true;
    // Semantic zoom deliberately applies display:none to every handle. React
    // Flow cannot produce handle bounds in that state, so retrying a forced
    // full-graph measurement can never make progress.
    if (handlesAreHiddenBySemanticZoom) return true;
    const bounds = nodeLookup.get(id)?.internals?.handleBounds;
    return Boolean((bounds?.source?.length || 0) + (bounds?.target?.length || 0));
  });
};

export const scheduleBaseReactFlowNodeInternalsRetry = ({
  refresh,
  areHandlesMeasured,
  requestAnimationFrameImpl = window.requestAnimationFrame.bind(window),
  cancelAnimationFrameImpl = window.cancelAnimationFrame.bind(window),
  setTimeoutImpl = window.setTimeout.bind(window),
  clearTimeoutImpl = window.clearTimeout.bind(window),
}: {
  refresh: RefreshFn;
  areHandlesMeasured: () => boolean;
  requestAnimationFrameImpl?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrameImpl?: (handle: number) => void;
  setTimeoutImpl?: (handler: TimerHandler, timeout?: number) => number;
  clearTimeoutImpl?: (handle?: number) => void;
}): (() => void) => {
  let retryTimer: number | undefined;
  let attempts = 0;

  const retryUntilMeasured = () => {
    if (areHandlesMeasured()) {
      return;
    }

    refresh();
    attempts += 1;
    if (attempts >= 8) {
      return;
    }

    retryTimer = setTimeoutImpl(
      retryUntilMeasured,
      attempts < 3 ? 120 : 280,
    );
  };

  const raf = requestAnimationFrameImpl(() => {
    retryUntilMeasured();
  });

  return () => {
    cancelAnimationFrameImpl(raf);
    if (retryTimer !== undefined) {
      clearTimeoutImpl(retryTimer);
    }
  };
};
