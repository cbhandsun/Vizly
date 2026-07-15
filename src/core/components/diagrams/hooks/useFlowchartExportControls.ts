import { useCallback } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { useDiagramControls } from '../../../hooks/useDiagramControls';

export const useFlowchartExportControls = (
  diagramId: string,
  reactFlowInstance: ReactFlowInstance<any, any> | null | undefined,
) => {
  const getReactFlowSnapshot = useCallback(() => {
    if (!reactFlowInstance) return null;
    return {
      nodes: reactFlowInstance.getNodes(),
      edges: reactFlowInstance.getEdges(),
      viewport: reactFlowInstance.getViewport(),
    };
  }, [reactFlowInstance]);

  return {
    ...useDiagramControls(diagramId, false, { getReactFlowSnapshot }),
    getReactFlowSnapshot,
  };
};
