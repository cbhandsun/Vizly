// Unified diagram control event dispatch
export type DiagramControlAction = 'top' | 'fit' | 'fullscreen' | 'toggleFlowDirection';

export const dispatchDiagramControl = (action: DiagramControlAction, diagramId?: string) => {
  try {
    window.dispatchEvent(new CustomEvent('diagramControl', {
      detail: { action, diagramId }
    }));
  } catch {}
};
