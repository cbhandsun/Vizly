import { useEffect, useState } from 'react';
import { resolveCanvasViewportReadiness } from './canvasViewportReadiness';

export const useCanvasViewportReadiness = (
  diagramId: string,
  readSnapshot: () => unknown,
  readBridge: () => unknown,
): boolean => {
  const [readyDiagram, setReadyDiagram] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let frame: number | undefined;
    const check = () => {
      frame = undefined;
      if (disposed) return;
      const status = resolveCanvasViewportReadiness(readSnapshot(), readBridge());
      setReadyDiagram(status === 'ready' ? diagramId : null);
      if (status === 'waiting') frame = window.requestAnimationFrame(check);
    };
    const schedule = () => {
      if (!disposed && frame === undefined) frame = window.requestAnimationFrame(check);
    };
    // Loading and node insertion/removal can occur without changing toolbar
    // props. Keep watching those commits after the initial frame probe settles.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      disposed = true;
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [diagramId, readBridge, readSnapshot]);
  return readyDiagram === diagramId;
};
