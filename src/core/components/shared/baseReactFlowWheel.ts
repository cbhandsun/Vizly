import type { ReactFlowInstance } from '@xyflow/react';

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
  pane: Pick<HTMLElement, 'getBoundingClientRect'>;
  rfInstance: Pick<ReactFlowInstance, 'getViewport' | 'setViewport'>;
}) => {
  return (ev: WheelEvent) => {
    if (preventScrolling) {
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
    }

    const viewport = rfInstance.getViewport();
    const rect = pane.getBoundingClientRect();
    const screenX = ev.clientX - rect.left;
    const screenY = ev.clientY - rect.top;
    const anchorWorldX = (screenX - viewport.x) / viewport.zoom;
    const anchorWorldY = (screenY - viewport.y) / viewport.zoom;
    const normalizedDelta = Math.max(-80, Math.min(80, ev.deltaY));
    const direction = -normalizedDelta;
    const zoomFactor = Math.exp(direction * (0.0025 * sensitivity));
    const targetZoom = Math.max(minZoom, Math.min(maxZoom, viewport.zoom * zoomFactor));
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
