type BaseReactFlowPerformanceConfig = {
  enableVirtualization: boolean;
  batchSize: number;
  debounceMs: number;
};

const readNestedValue = (value: unknown, path: readonly string[]): unknown => {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

export const DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG: BaseReactFlowPerformanceConfig = {
  enableVirtualization: true,
  batchSize: 50,
  debounceMs: 100,
};

export const readBaseReactFlowZoomSensitivity = ({
  readConfig,
  onReadFailure,
}: {
  readConfig: () => unknown;
  onReadFailure?: (error: unknown) => void;
}): number => {
  try {
    const sensitivity = readNestedValue(readConfig(), ['canvas', 'zoom', 'sensitivity']);
    return typeof sensitivity === 'number' && Number.isFinite(sensitivity) && sensitivity > 0
      ? sensitivity
      : 1;
  } catch (error) {
    onReadFailure?.(error);
    return 1;
  }
};

export const detectBaseReactFlowTouchDevice = ({
  hasTouchStart,
  maxTouchPoints,
}: {
  hasTouchStart: boolean;
  maxTouchPoints: number;
}): boolean => hasTouchStart || maxTouchPoints > 0;

export const resolveBaseReactFlowReconnectRadius = (
  value: number | undefined,
): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
);

export const resolveBaseReactFlowInteractionFlags = ({
  preventScrolling,
  panOnScroll,
  panOnDrag,
  isTouchDevice,
  isMobileScreen,
}: {
  preventScrolling?: boolean;
  panOnScroll: boolean;
  panOnDrag: boolean;
  isTouchDevice: boolean;
  isMobileScreen: boolean;
}) => ({
  effectivePreventScrolling: preventScrolling !== undefined
    ? preventScrolling
    : (isTouchDevice || isMobileScreen),
  effectivePanOnScroll: panOnScroll || (isTouchDevice && !panOnDrag),
});

export const readBaseReactFlowPerformanceConfig = ({
  readConfig,
  onReadFailure,
}: {
  readConfig: () => unknown;
  onReadFailure?: (error: unknown) => void;
}): BaseReactFlowPerformanceConfig => {
  try {
    const raw = readNestedValue(readConfig(), ['performance']);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG;
    }
    const candidate = raw as Record<string, unknown>;
    return {
      enableVirtualization: typeof candidate.enableVirtualization === 'boolean'
        ? candidate.enableVirtualization
        : DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG.enableVirtualization,
      batchSize: typeof candidate.batchSize === 'number' && Number.isFinite(candidate.batchSize) && candidate.batchSize > 0
        ? candidate.batchSize
        : DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG.batchSize,
      debounceMs: typeof candidate.debounceMs === 'number' && Number.isFinite(candidate.debounceMs) && candidate.debounceMs >= 0
        ? candidate.debounceMs
        : DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG.debounceMs,
    };
  } catch (error) {
    onReadFailure?.(error);
    return DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG;
  }
};

export const computeBaseReactFlowIsLargeGraph = ({
  nodeCount,
  edgeCount,
  performanceConfig,
}: {
  nodeCount: number;
  edgeCount: number;
  performanceConfig: BaseReactFlowPerformanceConfig;
}): boolean => {
  return performanceConfig.enableVirtualization
    && (nodeCount + edgeCount) >= Math.max(120, performanceConfig.batchSize * 3);
};

export const createBaseReactFlowProOptions = ({
  isLargeGraph,
}: {
  isLargeGraph: boolean;
}) => ({
  onlyRenderVisibleElements: isLargeGraph,
  hideAttribution: true,
});

export const createBaseReactFlowDefaultEdgeOptions = ({
  isLargeGraph,
}: {
  isLargeGraph: boolean;
}) => {
  // Keep the mode parameter in the public contract; both modes now share the
  // same shadow-free paint so zooming and virtualization do not change style.
  void isLargeGraph;
  return {
    type: 'advanced-smart-step',
    markerEnd: {
      type: 'arrowclosed' as const,
      color: '#64748B',
      width: 20,
      height: 20,
    },
    style: {
      stroke: '#64748B',
      strokeWidth: 1.5,
      strokeOpacity: 1,
      filter: 'none',
    },
  };
};
