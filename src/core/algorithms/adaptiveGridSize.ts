const DEFAULT_GRID_SIZE = 10;
const MAX_GRID_SIZE = 40;

/** Selects a bounded routing grid size from route distance and configured precision. */
export const calculateAdaptiveGridSize = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  configuredGridSize: number,
): number => {
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY);
  let adaptive = Number.isFinite(configuredGridSize) && configuredGridSize > 0
    ? configuredGridSize
    : DEFAULT_GRID_SIZE;

  if (distance < 400) return DEFAULT_GRID_SIZE;
  if (distance > 2000) adaptive = Math.max(adaptive, 30);
  else if (distance > 1000) adaptive = Math.max(adaptive, 20);
  else if (distance > 500) adaptive = Math.max(adaptive, 15);

  return Math.min(MAX_GRID_SIZE, adaptive);
};
