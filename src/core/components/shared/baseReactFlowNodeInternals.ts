type ReactFlowNodeInternalsState = {
  updateNodeInternals?: (internals: Map<string, { id: string; nodeElement: HTMLElement; force: boolean }>, options?: { triggerFitView?: boolean }) => void;
  nodeLookup?: Map<string, { internals?: { handleBounds?: { source?: unknown[]; target?: unknown[] } } }>;
};

type ReactFlowStoreApi = {
  getState: () => ReactFlowNodeInternalsState;
};

type RefreshFn = () => void;

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
  const state = rfStore.getState();
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
  const state = rfStore.getState();
  const nodeLookup = state.nodeLookup;
  if (!nodeLookup) return false;

  return nodeIds.every((id) => {
    const element = getBaseReactFlowNodeElement(container, id);
    if (!element || !element.querySelector('.react-flow__handle')) return true;
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
    refresh();
    retryTimer = setTimeoutImpl(() => {
      attempts += 1;
      if (!areHandlesMeasured() && attempts < 8) {
        retryUntilMeasured();
      }
    }, attempts < 3 ? 120 : 280);
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

export const scheduleBaseReactFlowMountedDomRefresh = ({
  refresh,
  delays = [240, 720, 1440, 2400],
  requestAnimationFrameImpl = window.requestAnimationFrame.bind(window),
  cancelAnimationFrameImpl = window.cancelAnimationFrame.bind(window),
  setTimeoutImpl = window.setTimeout.bind(window),
  clearTimeoutImpl = window.clearTimeout.bind(window),
}: {
  refresh: RefreshFn;
  delays?: number[];
  requestAnimationFrameImpl?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrameImpl?: (handle: number) => void;
  setTimeoutImpl?: (handler: TimerHandler, timeout?: number) => number;
  clearTimeoutImpl?: (handle?: number) => void;
}): (() => void) => {
  let cancelled = false;
  const guardedRefresh = () => {
    if (!cancelled) {
      refresh();
    }
  };

  const raf = requestAnimationFrameImpl(() => {
    guardedRefresh();
  });
  const timers = delays.map((delay) => setTimeoutImpl(() => {
    guardedRefresh();
  }, delay));

  return () => {
    cancelled = true;
    cancelAnimationFrameImpl(raf);
    for (const timer of timers) {
      clearTimeoutImpl(timer);
    }
  };
};
