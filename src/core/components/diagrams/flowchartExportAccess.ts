import type { DiagramExportFormat } from '../../types/diagram-components';

export const runPermittedFlowchartExport = async (
  format: DiagramExportFormat,
  permissionCheck: ((format: DiagramExportFormat) => boolean) | undefined,
  exportAction: () => Promise<void>,
): Promise<boolean> => {
  if (permissionCheck?.(format) === false) return false;
  await exportAction();
  return true;
};
