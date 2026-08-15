export type TerminalGeometryPoint = { x: number; y: number };
export type TerminalGeometryRect = { x: number; y: number; width: number; height: number };
export type TerminalGeometrySide = 'top' | 'bottom' | 'left' | 'right';

const axisOf = (
  first: TerminalGeometryPoint,
  second: TerminalGeometryPoint,
): 'h' | 'v' | null => {
  if (Math.abs(first.y - second.y) <= 0.5 && Math.abs(first.x - second.x) > 0.5) return 'h';
  if (Math.abs(first.x - second.x) <= 0.5 && Math.abs(first.y - second.y) > 0.5) return 'v';
  return null;
};

/** Infers the terminal side solely from finalized path and node geometry. */
export const inferTerminalGeometrySide = (
  path: TerminalGeometryPoint[],
  role: 'source' | 'target',
  rect: TerminalGeometryRect,
): TerminalGeometrySide | null => {
  if (path.length < 2) return null;
  const oriented = role === 'source' ? path : [...path].reverse();
  const [terminal, adjacent, next] = oriented;
  if (!terminal || !adjacent) return null;
  const candidates = (['top', 'bottom', 'left', 'right'] as const)
    .map((side) => {
      const horizontalSide = side === 'left' || side === 'right';
      const onBoundary = side === 'top'
        ? Math.abs(terminal.y - rect.y) <= 3
          && terminal.x >= rect.x - 3 && terminal.x <= rect.x + rect.width + 3
        : side === 'bottom'
          ? Math.abs(terminal.y - (rect.y + rect.height)) <= 3
            && terminal.x >= rect.x - 3 && terminal.x <= rect.x + rect.width + 3
          : side === 'left'
            ? Math.abs(terminal.x - rect.x) <= 3
              && terminal.y >= rect.y - 3 && terminal.y <= rect.y + rect.height + 3
            : Math.abs(terminal.x - (rect.x + rect.width)) <= 3
              && terminal.y >= rect.y - 3 && terminal.y <= rect.y + rect.height + 3;
      if (!onBoundary) return null;
      const expectedAxis = horizontalSide ? 'h' : 'v';
      const firstAxis = axisOf(terminal, adjacent);
      const outward = (point: TerminalGeometryPoint): boolean => (
        side === 'left'
          ? point.x < terminal.x - 1
          : side === 'right'
            ? point.x > terminal.x + 1
            : side === 'top'
              ? point.y < terminal.y - 1
              : point.y > terminal.y + 1
      );
      if (firstAxis === expectedAxis && outward(adjacent)) return { side, score: 0 };
      if (!next || !firstAxis || firstAxis === expectedAxis) return null;
      const adjacentStaysOnBoundary = side === 'top'
        ? Math.abs(adjacent.y - rect.y) <= 3
        : side === 'bottom'
          ? Math.abs(adjacent.y - (rect.y + rect.height)) <= 3
          : side === 'left'
            ? Math.abs(adjacent.x - rect.x) <= 3
            : Math.abs(adjacent.x - (rect.x + rect.width)) <= 3;
      if (!adjacentStaysOnBoundary || axisOf(adjacent, next) !== expectedAxis) return null;
      return outward(next) ? { side, score: 1 } : null;
    })
    .filter((candidate): candidate is { side: TerminalGeometrySide; score: number } => Boolean(candidate))
    .sort((first, second) => first.score - second.score);
  return candidates[0]?.side ?? null;
};
