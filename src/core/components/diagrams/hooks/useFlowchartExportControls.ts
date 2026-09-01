import { useCallback } from 'react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useDiagramControls } from '../../../hooks/useDiagramControls';
import type { DiagramExportFormat } from '../../../types/diagram-components';
import { enrichSnapshotWithRenderedNodeStyles } from '../../../rendering/reactFlowDomSnapshotStyles';
import { runPermittedFlowchartExport } from '../flowchartExportAccess';

export const useFlowchartExportControls = (
  diagramId: string,
  reactFlowInstance: ReactFlowInstance<Node, Edge> | null | undefined,
  permissionCheck?: (format: DiagramExportFormat) => boolean,
) => {
  const getReactFlowSnapshot = useCallback(() => {
    if (!reactFlowInstance) return null;
    return enrichSnapshotWithRenderedNodeStyles({
      nodes: reactFlowInstance.getNodes(),
      edges: reactFlowInstance.getEdges(),
      viewport: reactFlowInstance.getViewport(),
    }, typeof document === 'undefined'
      ? undefined
      : document.getElementById(`diagram-${diagramId}`) ?? document);
  }, [diagramId, reactFlowInstance]);

  const controls = useDiagramControls(diagramId, false, { getReactFlowSnapshot });
  const exportToSVG = useCallback(() => runPermittedFlowchartExport(
    'svg', permissionCheck, controls.exportToSVG,
  ), [controls.exportToSVG, permissionCheck]);
  const exportToPDF = useCallback(() => runPermittedFlowchartExport(
    'pdf', permissionCheck, controls.exportToPDF,
  ), [controls.exportToPDF, permissionCheck]);

  return {
    ...controls,
    exportToSVG,
    exportToPDF,
    getReactFlowSnapshot,
  };
};
