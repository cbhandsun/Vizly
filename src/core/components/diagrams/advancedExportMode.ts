import type { ExportOptions } from '../../utils/imageExporter';

export interface AdvancedExportCapabilities {
  pixelRatio: boolean;
  background: boolean;
  metadata: boolean;
  clipboard: boolean;
}

const ADVANCED_EXPORT_CAPABILITIES = {
  png: { pixelRatio: true, background: true, metadata: true, clipboard: true },
  jpg: { pixelRatio: true, background: false, metadata: true, clipboard: false },
  svg: { pixelRatio: false, background: true, metadata: true, clipboard: false },
  pdf: { pixelRatio: true, background: false, metadata: false, clipboard: false },
  json: { pixelRatio: false, background: false, metadata: false, clipboard: false },
} satisfies Record<ExportOptions['format'], AdvancedExportCapabilities>;

export const getAdvancedExportCapabilities = (
  format: ExportOptions['format'],
): AdvancedExportCapabilities => ADVANCED_EXPORT_CAPABILITIES[format];

export const isSceneBasedAdvancedExportFormat = (format: ExportOptions['format']): boolean => (
  format === 'png' || format === 'svg'
);
