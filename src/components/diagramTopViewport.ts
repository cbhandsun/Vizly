import { useEffect } from 'react';

export const MIN_DIAGRAM_TOP_ALIGN_ZOOM = 1e-4;
export const MAX_DIAGRAM_TOP_ALIGN_ZOOM = 1;
export const DEFAULT_DIAGRAM_LEFT_SIDEBAR_OFFSET = 76;
export const DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET = 60;
export const MAX_DIAGRAM_SIDEBAR_OFFSET = 800;
export const VIEWPORT_SESSION_STORAGE_PREFIX = 'vizly:viewport:v1:';
export const TOP_FIT_SESSION_MIGRATION_KEY = 'vizly:viewport:top-fit-migrated:v2';

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;
const MOBILE_DIAGRAM_BREAKPOINT = 768;
const MOBILE_READING_VIEW_MAX_WIDTH = 600;

export interface DiagramTopContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface DiagramTopSafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DiagramTopViewportLayout {
  safeArea: DiagramTopSafeArea;
  padding: number;
}

export interface DiagramTopViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface DiagramTopViewportInput {
  bounds: DiagramTopContentBounds;
  viewportWidth: number;
  viewportHeight: number;
  safeArea: DiagramTopSafeArea;
  padding?: number;
}

interface SnapshotLike {
  nodes?: readonly unknown[];
  edges?: readonly unknown[];
}

interface ReactFlowViewportInstanceLike {
  getNodes?: () => readonly unknown[];
  getEdges?: () => readonly unknown[];
  setViewport?: (
    viewport: DiagramTopViewport,
    options?: { duration?: number },
  ) => unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const parsePositiveDimension = (value: unknown): number | null => {
  if (isFiniteNumber(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const resolveNodeDimension = (
  candidates: readonly unknown[],
  fallback: number,
): number => {
  for (const candidate of candidates) {
    const parsed = parsePositiveDimension(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return fallback;
};

const isNodeHidden = (node: Record<string, unknown>): boolean => {
  if (node.hidden === true) {
    return true;
  }
  const data = isRecord(node.data) ? node.data : null;
  if (data?.hidden === true) {
    return true;
  }
  const style = isRecord(node.style) ? node.style : null;
  if (!style) {
    return false;
  }
  return style.display === 'none' || style.visibility === 'hidden';
};

const readPointPair = (value: unknown): { x: number; y: number } | null => {
  if (!isRecord(value)) {
    return null;
  }
  const x = value.x;
  const y = value.y;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    return null;
  }
  return { x, y };
};

export const coerceDiagramTopSidebarOffset = (
  value: unknown,
  fallback: number,
): number => {
  const parsed = typeof value === 'number'
    ? value
    : (typeof value === 'string' && value.trim() ? Number.parseFloat(value) : Number.NaN);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_DIAGRAM_SIDEBAR_OFFSET);
};

export const resolveDiagramTopViewportLayout = ({
  viewportWidth,
  leftSidebarOffset,
  rightSidebarOffset,
}: {
  viewportWidth: number;
  leftSidebarOffset?: unknown;
  rightSidebarOffset?: unknown;
}): DiagramTopViewportLayout => {
  if (Number.isFinite(viewportWidth) && viewportWidth <= MOBILE_DIAGRAM_BREAKPOINT) {
    return {
      safeArea: { top: 104, right: 20, bottom: 148, left: 20 },
      padding: 24,
    };
  }

  return {
    safeArea: {
      top: 84,
      right: coerceDiagramTopSidebarOffset(
        rightSidebarOffset,
        DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET,
      ),
      bottom: 64,
      left: coerceDiagramTopSidebarOffset(
        leftSidebarOffset,
        DEFAULT_DIAGRAM_LEFT_SIDEBAR_OFFSET,
      ),
    },
    padding: 16,
  };
};

export const computeDiagramTopAlignedBounds = (
  nodes: readonly unknown[],
  edges: readonly unknown[] = [],
): DiagramTopContentBounds | null => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return null;
  }

  const recordNodes = nodes.filter(isRecord);
  const visibleNodes = recordNodes.filter((node) => !isNodeHidden(node));
  if (visibleNodes.length === 0) {
    return null;
  }

  const nodeById = new Map<string, Record<string, unknown>>();
  for (const node of recordNodes) {
    if (typeof node.id === 'string' && node.id) {
      nodeById.set(node.id, node);
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of visibleNodes) {
    const measured = isRecord(node.measured) ? node.measured : null;
    const style = isRecord(node.style) ? node.style : null;
    const width = resolveNodeDimension(
      [measured?.width, node.width, style?.width],
      DEFAULT_NODE_WIDTH,
    );
    const height = resolveNodeDimension(
      [measured?.height, node.height, style?.height],
      DEFAULT_NODE_HEIGHT,
    );

    const computed = isRecord(node.computed) ? node.computed : null;
    const absPos = readPointPair(node.positionAbsolute)
      ?? readPointPair(computed?.positionAbsolute);

    let xVal = absPos?.x;
    let yVal = absPos?.y;

    if (!isFiniteNumber(xVal) || !isFiniteNumber(yVal)) {
      const pos = readPointPair(node.position);
      if (!pos) {
        continue;
      }
      let x = pos.x;
      let y = pos.y;
      let currentNode: Record<string, unknown> | undefined = node;
      const visited = new Set<string>();

      while (typeof currentNode?.parentId === 'string' && currentNode.parentId) {
        if (visited.has(currentNode.parentId)) {
          break;
        }
        visited.add(currentNode.parentId);
        const parent = nodeById.get(currentNode.parentId);
        if (!parent) {
          break;
        }
        const parentPos = readPointPair(parent.position);
        if (parentPos) {
          x += parentPos.x;
          y += parentPos.y;
        }
        currentNode = parent;
      }

      xVal = x;
      yVal = y;
    }

    const x2 = xVal + width;
    const y2 = yVal + height;
    if (xVal < minX) minX = xVal;
    if (yVal < minY) minY = yVal;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  }

  if (
    !Number.isFinite(minX)
    || !Number.isFinite(minY)
    || !Number.isFinite(maxX)
    || !Number.isFinite(maxY)
  ) {
    return null;
  }

  const recordEdges = Array.isArray(edges) ? edges.filter(isRecord) : [];
  let maxStrokeWidth = 0;
  let hasEdgeLabel = false;
  let hasSmartEdge = false;

  for (const edge of recordEdges) {
    if (edge.hidden === true) {
      continue;
    }
    const style = isRecord(edge.style) ? edge.style : null;
    const strokeWidth = isFiniteNumber(style?.strokeWidth) ? style.strokeWidth : 2;
    if (strokeWidth > maxStrokeWidth) {
      maxStrokeWidth = strokeWidth;
    }

    const data = isRecord(edge.data) ? edge.data : null;
    if (data?.label ?? edge.label) {
      hasEdgeLabel = true;
    }
    const pathType = String(data?.pathType ?? edge.type ?? '').toLowerCase();
    if (pathType.includes('smart')) {
      hasSmartEdge = true;
    }

    const pointCollections = [
      data?.waypoints,
      data?.routingPoints,
      data?.bendPoints,
      data?.points,
    ];
    for (const collection of pointCollections) {
      if (!Array.isArray(collection)) {
        continue;
      }
      for (const item of collection) {
        const pt = readPointPair(item);
        if (!pt) {
          continue;
        }
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
  }

  if (recordEdges.length > 0) {
    const edgeMargin = Math.max(0, Math.ceil(maxStrokeWidth) + 4);
    const smartExtraY = hasSmartEdge ? 20 : 0;
    const labelExtraY = hasEdgeLabel ? 20 : 0;
    const labelExtraX = hasEdgeLabel ? 16 : 0;

    minX -= edgeMargin + labelExtraX;
    maxX += edgeMargin + labelExtraX;
    minY -= edgeMargin + smartExtraY + labelExtraY;
    maxY += edgeMargin + labelExtraY;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
  };
};

export const clampDiagramTopAlignZoom = (rawZoom: number): number => {
  if (!Number.isFinite(rawZoom) || rawZoom <= 0) {
    return MIN_DIAGRAM_TOP_ALIGN_ZOOM;
  }
  const scaled = rawZoom * 0.98 || rawZoom;
  return Math.max(
    MIN_DIAGRAM_TOP_ALIGN_ZOOM,
    Math.min(MAX_DIAGRAM_TOP_ALIGN_ZOOM, scaled),
  );
};

export const computeDiagramTopAlignedViewport = (
  input: DiagramTopViewportInput,
): DiagramTopViewport | null => {
  const { bounds, safeArea } = input;
  const requiredNumbers = [
    bounds.minX,
    bounds.minY,
    bounds.width,
    bounds.height,
    input.viewportWidth,
    input.viewportHeight,
    safeArea.top,
    safeArea.right,
    safeArea.bottom,
    safeArea.left,
  ];
  if (!requiredNumbers.every(Number.isFinite)) {
    return null;
  }
  if (
    bounds.width <= 0
    || bounds.height <= 0
    || input.viewportWidth <= 0
    || input.viewportHeight <= 0
    || safeArea.top < 0
    || safeArea.right < 0
    || safeArea.bottom < 0
    || safeArea.left < 0
  ) {
    return null;
  }

  const rawPadding = input.padding ?? 16;
  const padding = Number.isFinite(rawPadding) && rawPadding >= 0
    ? Math.min(rawPadding, 200)
    : 16;

  const safeHorizontalSpan = input.viewportWidth - safeArea.left - safeArea.right - padding * 2;
  const useFallbackSpan = safeHorizontalSpan <= 0;
  const availableWidth = useFallbackSpan
    ? Math.max(1, input.viewportWidth - padding * 2)
    : safeHorizontalSpan;
  const effectiveLeft = useFallbackSpan ? padding : safeArea.left + padding;

  const zoom = clampDiagramTopAlignZoom(availableWidth / bounds.width);
  const centeredX = Math.max(0, (availableWidth - bounds.width * zoom) / 2);

  return {
    x: effectiveLeft + centeredX - bounds.minX * zoom,
    y: safeArea.top + padding - bounds.minY * zoom,
    zoom,
  };
};

const resolveDiagramContainerElement = (diagramId: string): HTMLElement | null => {
  if (typeof document === 'undefined' || !diagramId) {
    return null;
  }
  const byId = document.getElementById(`diagram-${diagramId}`);
  if (byId) {
    const containerAncestor = byId.closest('.diagram-container');
    if (containerAncestor instanceof HTMLElement) {
      return containerAncestor;
    }
    const previewAncestor = byId.closest('.diagram-preview-container');
    if (previewAncestor instanceof HTMLElement) {
      return previewAncestor;
    }
    return byId;
  }
  const fallbackContainer = document.querySelector(
    '.diagram-container, .diagram-preview-container, .react-flow',
  );
  return fallbackContainer instanceof HTMLElement ? fallbackContainer : null;
};

const readElementViewportSize = (element: HTMLElement): { width: number; height: number } => {
  const rect = typeof element.getBoundingClientRect === 'function'
    ? element.getBoundingClientRect()
    : null;
  const width = element.clientWidth > 0 ? element.clientWidth : (rect?.width ?? 0);
  const height = element.clientHeight > 0 ? element.clientHeight : (rect?.height ?? 0);
  return { width, height };
};

export const applyDiagramBackToTopViewport = ({
  diagramId,
  readSnapshot,
  fallbackBackToTop,
  duration = 350,
}: {
  diagramId: string;
  readSnapshot?: () => SnapshotLike | null | undefined;
  fallbackBackToTop?: () => void;
  duration?: number;
}): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    fallbackBackToTop?.();
    return false;
  }

  const runtimeWindow = window as Window & {
    reactFlowInstance?: ReactFlowViewportInstanceLike;
  };
  const activeInstance = runtimeWindow.reactFlowInstance;
  const container = resolveDiagramContainerElement(diagramId);

  if (!activeInstance || typeof activeInstance.setViewport !== 'function' || !container) {
    fallbackBackToTop?.();
    return false;
  }

  const viewportElement = (
    container.querySelector('.react-flow__renderer')
    ?? container.querySelector('.react-flow')
    ?? container
  ) as HTMLElement;
  const { width: viewportWidth, height: viewportHeight } = readElementViewportSize(viewportElement);
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    fallbackBackToTop?.();
    return false;
  }

  const snapshot = readSnapshot?.();
  const liveNodes = activeInstance.getNodes?.() ?? [];
  const liveEdges = activeInstance.getEdges?.() ?? [];
  const snapshotNodes = snapshot?.nodes ?? [];
  const snapshotEdges = snapshot?.edges ?? [];

  const bounds = computeDiagramTopAlignedBounds(
    snapshotNodes,
    snapshotEdges.length > 0 ? snapshotEdges : liveEdges,
  ) ?? computeDiagramTopAlignedBounds(liveNodes, liveEdges);
  if (!bounds) {
    fallbackBackToTop?.();
    return false;
  }

  const rootStyle = getComputedStyle(document.documentElement);
  const layout = resolveDiagramTopViewportLayout({
    viewportWidth,
    leftSidebarOffset: rootStyle.getPropertyValue('--left-sidebar-offset'),
    rightSidebarOffset: rootStyle.getPropertyValue('--right-sidebar-offset'),
  });

  const targetViewport = computeDiagramTopAlignedViewport({
    bounds,
    viewportWidth,
    viewportHeight,
    safeArea: layout.safeArea,
    padding: layout.padding,
  });

  if (!targetViewport) {
    fallbackBackToTop?.();
    return false;
  }

  activeInstance.setViewport(
    targetViewport,
    duration > 0 ? { duration } : undefined,
  );
  return true;
};

export const clearDiagramViewportSessionStorage = (
  storage: Pick<Storage, 'key' | 'length' | 'removeItem'> | null | undefined,
  diagramId?: string,
): number => {
  if (!storage) {
    return 0;
  }
  const normalizedId = typeof diagramId === 'string' ? diagramId.trim() : '';
  const encodedPrefix = normalizedId
    ? `${VIEWPORT_SESSION_STORAGE_PREFIX}${encodeURIComponent(normalizedId)}`
    : VIEWPORT_SESSION_STORAGE_PREFIX;

  const keysToRemove: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(VIEWPORT_SESSION_STORAGE_PREFIX)) {
        continue;
      }
      if (!normalizedId || key === encodedPrefix || key.startsWith(`${encodedPrefix}:`) || key.startsWith(`${encodedPrefix}%3A`)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
  } catch {
    return 0;
  }
  return keysToRemove.length;
};

export const migrateStaleDesktopViewportSessionStorage = (
  storage: Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length' | 'removeItem'> | null | undefined,
): boolean => {
  if (!storage) {
    return false;
  }
  try {
    if (storage.getItem(TOP_FIT_SESSION_MIGRATION_KEY) === '1') {
      return false;
    }
    clearDiagramViewportSessionStorage(storage);
    storage.setItem(TOP_FIT_SESSION_MIGRATION_KEY, '1');
    return true;
  } catch {
    return false;
  }
};

export const bindDiagramTopControlInterceptor = ({
  diagramId,
  readSnapshot,
  duration = 0,
}: {
  diagramId: string;
  readSnapshot?: () => SnapshotLike | null | undefined;
  duration?: number;
}): (() => void) => {
  if (typeof window === 'undefined' || !diagramId) {
    return () => undefined;
  }

  let followUpTimer: ReturnType<typeof setTimeout> | null = null;
  let userInteracted = false;

  const clearFollowUp = () => {
    if (followUpTimer !== null) {
      clearTimeout(followUpTimer);
      followUpTimer = null;
    }
  };

  const handleUserGesture = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('.react-flow')) {
      userInteracted = true;
      clearFollowUp();
    }
  };

  const handleDiagramControlCapture = (event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }
    const detail = isRecord(event.detail) ? event.detail : null;
    if (!detail || detail.action !== 'top') {
      return;
    }
    const targetId = typeof detail.diagramId === 'string' ? detail.diagramId : undefined;
    if (targetId && targetId !== diagramId) {
      return;
    }

    // Preserve mobile narrow-screen reading fit while intercepting desktop 'top' fit
    const container = resolveDiagramContainerElement(diagramId);
    const viewportWidth = container
      ? readElementViewportSize(container).width
      : window.innerWidth;
    if (viewportWidth > 0 && viewportWidth <= MOBILE_READING_VIEW_MAX_WIDTH) {
      return;
    }

    event.stopImmediatePropagation();
    userInteracted = false;
    clearFollowUp();

    applyDiagramBackToTopViewport({
      diagramId,
      readSnapshot,
      duration,
    });

    // Follow-up refinement once ResizeObserver finishes measuring nodes after initial mount
    followUpTimer = setTimeout(() => {
      followUpTimer = null;
      if (userInteracted) {
        return;
      }
      applyDiagramBackToTopViewport({
        diagramId,
        readSnapshot,
        duration: 0,
      });
    }, 140);
  };

  window.addEventListener('diagramControl', handleDiagramControlCapture, true);
  for (const gesture of ['pointerdown', 'wheel', 'touchstart'] as const) {
    window.addEventListener(gesture, handleUserGesture, { capture: true, passive: true });
  }

  return () => {
    clearFollowUp();
    window.removeEventListener('diagramControl', handleDiagramControlCapture, true);
    for (const gesture of ['pointerdown', 'wheel', 'touchstart'] as const) {
      window.removeEventListener(gesture, handleUserGesture, true);
    }
  };
};

export const useDiagramTopControlInterceptor = (
  diagramId: string,
  readSnapshot?: () => SnapshotLike | null | undefined,
): void => {
  useEffect(() => bindDiagramTopControlInterceptor({
    diagramId,
    readSnapshot,
    duration: 0,
  }), [diagramId, readSnapshot]);
};
