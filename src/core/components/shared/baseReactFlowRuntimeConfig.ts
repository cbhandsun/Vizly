type BaseReactFlowPerformanceConfig = {
  enableVirtualization: boolean;
  batchSize: number;
  debounceMs: number;
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
  readConfig: () => any;
  onReadFailure?: (error: unknown) => void;
}): number => {
  try {
    return readConfig()?.canvas?.zoom?.sensitivity ?? 1;
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
  readConfig: () => any;
  onReadFailure?: (error: unknown) => void;
}): BaseReactFlowPerformanceConfig => {
  try {
    return readConfig()?.performance || DEFAULT_BASE_REACT_FLOW_PERFORMANCE_CONFIG;
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
}) => ({
  type: 'advanced-smart-step',
  markerEnd: { type: 'arrowclosed' as const, width: 10, height: 10 },
  style: {
    strokeOpacity: 0.98,
    filter: isLargeGraph ? 'none' : 'drop-shadow(0 0 0.6px rgba(0,0,0,0.35))',
  },
});
