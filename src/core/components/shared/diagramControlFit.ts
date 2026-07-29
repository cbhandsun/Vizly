export const MIN_DIAGRAM_FULL_FIT_ZOOM = 0.32;
export const MAX_DIAGRAM_FULL_FIT_ZOOM = 1;
export const DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET = 60;
export const MAX_DIAGRAM_SIDEBAR_OFFSET = 800;

export interface DiagramFitSafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DiagramFitViewportInput {
  bounds: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  viewportWidth: number;
  viewportHeight: number;
  safeArea: DiagramFitSafeArea;
  padding?: number;
}

export interface DiagramFitViewport {
  x: number;
  y: number;
  zoom: number;
}

export const coerceDiagramSidebarOffset = (
  value: unknown,
  fallback = DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET,
): number => {
  const parsed = typeof value === 'number'
    ? value
    : (typeof value === 'string' && value.trim() ? Number.parseFloat(value) : Number.NaN);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, MAX_DIAGRAM_SIDEBAR_OFFSET);
};

export const clampDiagramFullFitZoom = (rawZoom: number): number => {
  if (!Number.isFinite(rawZoom) || rawZoom <= 0) {
    return MIN_DIAGRAM_FULL_FIT_ZOOM;
  }

  return Math.max(
    MIN_DIAGRAM_FULL_FIT_ZOOM,
    Math.min(MAX_DIAGRAM_FULL_FIT_ZOOM, rawZoom * 0.98),
  );
};

const isFiniteNonNegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

export const computeDiagramFitViewport = (
  input: DiagramFitViewportInput,
): DiagramFitViewport | null => {
  const { bounds, safeArea } = input;
  const values = [
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
  if (!values.every(Number.isFinite)) return null;
  if (
    bounds.width <= 0
    || bounds.height <= 0
    || input.viewportWidth <= 0
    || input.viewportHeight <= 0
    || !Object.values(safeArea).every(isFiniteNonNegative)
  ) {
    return null;
  }

  const padding = isFiniteNonNegative(input.padding ?? 16)
    ? Math.min(input.padding ?? 16, 200)
    : 16;
  const availableWidth = Math.max(
    1,
    input.viewportWidth - safeArea.left - safeArea.right - padding * 2,
  );
  const availableHeight = Math.max(
    1,
    input.viewportHeight - safeArea.top - safeArea.bottom - padding * 2,
  );
  const zoom = clampDiagramFullFitZoom(Math.min(
    availableWidth / bounds.width,
    availableHeight / bounds.height,
  ));
  const centeredX = Math.max(0, (availableWidth - bounds.width * zoom) / 2);
  const centeredY = Math.max(0, (availableHeight - bounds.height * zoom) / 2);

  return {
    x: safeArea.left + padding + centeredX - bounds.minX * zoom,
    y: safeArea.top + padding + centeredY - bounds.minY * zoom,
    zoom,
  };
};
