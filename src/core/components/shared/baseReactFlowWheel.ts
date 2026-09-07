import type { ReactFlowInstance } from '@xyflow/react';
import { resolveDiagramInteractiveZoom } from './diagramInteractiveZoom';

export const createBaseReactFlowWheelHandler = ({
  preventScrolling,
  minZoom,
  maxZoom,
  sensitivity,
  pane,
  rfInstance,
}: {
  preventScrolling: boolean;
  minZoom: number;
  maxZoom: number;
  sensitivity: number;
  pane: { getBoundingClientRect: () => Pick<DOMRect, 'left' | 'top'> };
  rfInstance: Pick<ReactFlowInstance, 'getViewport' | 'setViewport'>;
}) => {
  return (ev: Event | Pick<WheelEvent, 'clientX' | 'clientY' | 'deltaY' | 'cancelable' | 'preventDefault' | 'stopPropagation'>) => {
    if (!('clientX' in ev) || typeof ev.clientX !== 'number'
      || !('clientY' in ev) || typeof ev.clientY !== 'number'
      || !('deltaY' in ev) || typeof ev.deltaY !== 'number') return;
    if (preventScrolling) {
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
    }

    const viewport = rfInstance.getViewport();
    if (![viewport.x, viewport.y, viewport.zoom, ev.clientX, ev.clientY, ev.deltaY, sensitivity].every(Number.isFinite)
      || viewport.zoom <= 0 || sensitivity <= 0) return;
    const rect = pane.getBoundingClientRect();
    const screenX = ev.clientX - rect.left;
    const screenY = ev.clientY - rect.top;
    const anchorWorldX = (screenX - viewport.x) / viewport.zoom;
    const anchorWorldY = (screenY - viewport.y) / viewport.zoom;
    const normalizedDelta = Math.max(-80, Math.min(80, ev.deltaY));
    const direction = -normalizedDelta;
    const zoomFactor = Math.exp(direction * (0.0025 * sensitivity));
    const targetZoom = resolveDiagramInteractiveZoom(viewport.zoom, viewport.zoom * zoomFactor, minZoom, maxZoom);
    if (targetZoom === null) return;
    const targetX = screenX - anchorWorldX * targetZoom;
    const targetY = screenY - anchorWorldY * targetZoom;
    rfInstance.setViewport({ x: targetX, y: targetY, zoom: targetZoom });
  };
};

export const bindBaseReactFlowWheelHandler = ({
  pane,
  wheelHandler,
  onPassiveBindFailure,
}: {
  pane: Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>;
  wheelHandler: EventListener;
  onPassiveBindFailure?: (error: unknown) => void;
}) => {
  try {
    pane.addEventListener('wheel', wheelHandler, { passive: false });
  } catch (error) {
    onPassiveBindFailure?.(error);
    pane.addEventListener('wheel', wheelHandler);
  }

  return () => pane.removeEventListener('wheel', wheelHandler);
};
