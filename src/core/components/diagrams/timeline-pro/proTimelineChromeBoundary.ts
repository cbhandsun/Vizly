import type { ProTimelineViewMode } from '../../../hooks/useProTimelineEngine';

const VIEW_MODES = new Set<ProTimelineViewMode>(['day', 'week', 'month', 'quarter']);

export const coerceProTimelineViewMode = (
  value: unknown,
  fallback: ProTimelineViewMode,
): ProTimelineViewMode => (
  typeof value === 'string' && VIEW_MODES.has(value as ProTimelineViewMode)
    ? value as ProTimelineViewMode
    : fallback
);

export const stepProTimelineZoom = (current: number, delta: number): number => {
  const safeCurrent = Number.isFinite(current) ? current : 1;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  return Math.min(5, Math.max(0.15, safeCurrent + safeDelta));
};
