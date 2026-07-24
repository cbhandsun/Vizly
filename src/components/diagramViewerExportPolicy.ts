export type DiagramViewerExportFormat = 'pdf' | 'svg';

const EXPORT_FEATURES = {
  pdf: 'export-pdf',
  svg: 'export-hd-svg',
} as const;

const EXPORT_LABELS = {
  pdf: '超高清 PDF 导出',
  svg: '超高清矢量 SVG 导出',
} as const;

export const ensureDiagramViewerExportAllowed = (
  format: DiagramViewerExportFormat,
  hasFeature: (feature: typeof EXPORT_FEATURES[DiagramViewerExportFormat]) => boolean,
  showUpgradeModal: (label: string) => void,
): boolean => {
  if (hasFeature(EXPORT_FEATURES[format])) return true;
  showUpgradeModal(EXPORT_LABELS[format]);
  return false;
};
