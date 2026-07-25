type ReactFlowNodeInternalsState = {
  updateNodeInternals?: unknown;
  nodeLookup?: Map<string, { internals?: { handleBounds?: { source?: unknown[]; target?: unknown[] } } }>;
};

type ReactFlowStoreApi = {
  getState: () => unknown;
};

type RefreshFn = () => void;

export type BaseReactFlowNodeInternalsRefreshNode = {
  id: string;
  type?: string;
  position?: unknown;
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  style?: { width?: unknown; height?: unknown };
};

export type BaseReactFlowNodeInternalsRefreshSnapshot = {
  key: string;
  nodeIds: string[];
};

/**
 * Node-internal measurements depend on mounted node identity, renderer type,
 * and dimensions. Position is intentionally excluded: React Flow already
 * tracks it, and remeasuring every handle during drag creates a full DOM scan.
 */
export const createBaseReactFlowNodeInternalsRefreshSnapshot = (
  nodes: readonly BaseReactFlowNodeInternalsRefreshNode[],
): BaseReactFlowNodeInternalsRefreshSnapshot => {
  const nodeIds: string[] = [];
  const keyParts: Array<[string, string, string, string]> = [];
  for (const node of nodes) {
    const width = node.measured?.width ?? node.width ?? node.style?.width ?? '';
    const height = node.measured?.height ?? node.height ?? node.style?.height ?? '';
    nodeIds.push(node.id);
    keyParts.push([node.id, node.type ?? '', String(width), String(height)]);
  }
  return {
    key: JSON.stringify(keyParts),
    nodeIds,
  };
};

export const readBaseReactFlowNodeInternalsRefreshNodeIds = (
  refreshKey: string,
): string[] => {
  try {
    const entries: unknown = JSON.parse(refreshKey);
    if (!Array.isArray(entries)) return [];
    return entries.flatMap(entry => (
      Array.isArray(entry) && typeof entry[0] === 'string' ? [entry[0]] : []
    ));
  } catch {
    return [];
  }
};

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
  if (!container) return null;
  for (const element of container.querySelectorAll<HTMLElement>('.react-flow__node[data-id]')) {
    if (element.dataset.id === id) return element;
  }
  return null;
};

export const collectBaseReactFlowMountedNodeElements = (
  container: HTMLElement | null,
  nodeIds: readonly string[],
): Map<string, HTMLElement> => {
  const mounted = new Map<string, HTMLElement>();
  if (!container || nodeIds.length === 0) return mounted;
  const requestedIds = new Set(nodeIds);
  for (const element of container.querySelectorAll<HTMLElement>('.react-flow__node[data-id]')) {
    const id = element.dataset.id;
    if (id && requestedIds.has(id)) mounted.set(id, element);
  }
  return mounted;
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

  for (const [id, nodeElement] of collectBaseReactFlowMountedNodeElements(container, nodeIds)) {
    internalsMap.set(id, { id, nodeElement, force: true });
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
  const mountedNodes = collectBaseReactFlowMountedNodeElements(container, nodeIds);
  if (mountedNodes.size === 0) return false;

  return Array.from(mountedNodes).every(([id, element]) => {
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
