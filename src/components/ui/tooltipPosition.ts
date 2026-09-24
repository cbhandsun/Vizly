export interface TooltipPosition {
  x: number;
  y: number;
}

const DEFAULT_TOOLTIP_WIDTH = 250;
const MAX_TOOLTIP_DELAY_MS = 5000;

export const normalizeTooltipDelay = (delay: number | undefined): number => {
  if (!Number.isFinite(delay)) return 0;
  return Math.min(MAX_TOOLTIP_DELAY_MS, Math.max(0, Math.floor(delay ?? 0)));
};

export const calculateTooltipPosition = (
  rect: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>,
  viewportWidth: number,
  estimatedWidth = DEFAULT_TOOLTIP_WIDTH
): TooltipPosition => {
  let x = rect.right + 10;
  let y = rect.top;

  if (x + estimatedWidth > viewportWidth) {
    const leftAttempt = rect.left - estimatedWidth - 10;
    if (leftAttempt > 0) {
      x = leftAttempt;
    } else {
      x = Math.min(rect.left, Math.max(0, viewportWidth - estimatedWidth));
      y = rect.bottom + 10;
    }
  }

  return { x: Math.max(0, x), y: Math.max(0, y) };
};
