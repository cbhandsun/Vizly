import type { ProTimelineViewMode } from '../../../hooks/useProTimelineEngine';
import {
  normalizeProTimelineZoom,
  PRO_TIMELINE_MAX_ZOOM,
  PRO_TIMELINE_MIN_ZOOM,
} from './proTimelineViewportInteraction';

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
  const safeCurrent = normalizeProTimelineZoom(current);
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  return normalizeProTimelineZoom(safeCurrent + safeDelta);
};

export type ProTimelineZoomControlState = {
  zoom: number;
  percentage: number;
  canZoomOut: boolean;
  canReset: boolean;
  canZoomIn: boolean;
};

export const getProTimelineZoomControlState = (value: unknown): ProTimelineZoomControlState => {
  const zoom = normalizeProTimelineZoom(value);
  return {
    zoom,
    percentage: Math.round(zoom * 100),
    canZoomOut: zoom > PRO_TIMELINE_MIN_ZOOM,
    canReset: zoom !== 1,
    canZoomIn: zoom < PRO_TIMELINE_MAX_ZOOM,
  };
};
