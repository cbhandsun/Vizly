import { useCallback } from 'react';
import { dispatchDiagramControl } from '../components/shared/diagramControl';
import type { DiagramExportEventDetail, DiagramExportEventName } from './diagramExportActions';
import { logDiagramExportEventDispatchFailure } from './diagramExportLogging';
import type { ReactFlowRenderSnapshot } from '../rendering/reactFlowScene';

type ExportActionName = 'exportDiagramToPNG' | 'exportDiagramToPDF' | 'exportDiagramToSVG' | 'exportDiagramToGIF';

export interface DiagramControlsOptions {
  getReactFlowSnapshot?: () => ReactFlowRenderSnapshot | null | undefined;
}

export const useDiagramControls = (
  diagramId: string,
  enableMainFlowAnimation: boolean = true,
  options: DiagramControlsOptions = {},
) => {
  const dispatchExportEvent = useCallback((name: DiagramExportEventName, detail: DiagramExportEventDetail) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (error) {
      logDiagramExportEventDispatchFailure('useDiagramControls', name, error);
    }
  }, []);

  const yieldToPaint = useCallback(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  }), []);

  const runExportAction = useCallback(async (actionName: ExportActionName) => {
    const actions = await import('./diagramExportActions');
    await actions[actionName]({
      diagramId,
      enableMainFlowAnimation,
      dispatchExportEvent,
      yieldToPaint,
      getReactFlowSnapshot: options.getReactFlowSnapshot,
    });
  }, [diagramId, dispatchExportEvent, enableMainFlowAnimation, options.getReactFlowSnapshot, yieldToPaint]);

  const handleFitDiagram = useCallback(() => {
    dispatchDiagramControl('fit', diagramId);
  }, [diagramId]);

  const handleBackToTop = useCallback(() => {
    dispatchDiagramControl('top', diagramId);
  }, [diagramId]);

  const handleToggleFullscreen = useCallback(() => {
    dispatchDiagramControl('fullscreen', diagramId);
  }, [diagramId]);

  const exportToPNG = useCallback(() => runExportAction('exportDiagramToPNG'), [runExportAction]);
  const exportToPDF = useCallback(() => runExportAction('exportDiagramToPDF'), [runExportAction]);
  const exportToSVG = useCallback(() => runExportAction('exportDiagramToSVG'), [runExportAction]);
  const exportToGIF = useCallback(() => runExportAction('exportDiagramToGIF'), [runExportAction]);

  return { handleFitDiagram, handleBackToTop, handleToggleFullscreen, exportToPNG, exportToPDF, exportToSVG, exportToGIF };
};
