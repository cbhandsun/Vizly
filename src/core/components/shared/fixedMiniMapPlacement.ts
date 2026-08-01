export interface ReservedBottomArea {
  left: number;
  right: number;
  top: number;
}

export interface FixedMiniMapBottomInput {
  baseBottom: number;
  absoluteLeft: number;
  width: number;
  viewportHeight: number;
  reservedArea: ReservedBottomArea | null;
  gap?: number;
}

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

/** Keeps the portalled minimap clear of bottom canvas controls such as page tabs. */
export const resolveFixedMiniMapBottom = ({
  baseBottom,
  absoluteLeft,
  width,
  viewportHeight,
  reservedArea,
  gap = 8,
}: FixedMiniMapBottomInput): number => {
  const safeBaseBottom = isFiniteNumber(baseBottom) ? Math.max(0, baseBottom) : 0;
  if (!reservedArea
    || !isFiniteNumber(absoluteLeft)
    || !isFiniteNumber(width)
    || width <= 0
    || !isFiniteNumber(viewportHeight)
    || !isFiniteNumber(reservedArea.left)
    || !isFiniteNumber(reservedArea.right)
    || !isFiniteNumber(reservedArea.top)) {
    return safeBaseBottom;
  }

  const minimapRight = absoluteLeft + width;
  const overlapsHorizontally = minimapRight > reservedArea.left
    && absoluteLeft < reservedArea.right;
  if (!overlapsHorizontally) return safeBaseBottom;

  const safeGap = isFiniteNumber(gap) ? Math.max(0, gap) : 0;
  const requiredBottom = Math.max(0, viewportHeight - reservedArea.top + safeGap);
  return Math.max(safeBaseBottom, requiredBottom);
};
