import type { ExportOptions } from '../../utils/imageExporter';

export const isSceneBasedAdvancedExportFormat = (format: ExportOptions['format']): boolean => (
  format === 'png' || format === 'svg'
);
