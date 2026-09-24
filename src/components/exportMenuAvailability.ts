export interface ExportMenuAvailability {
  fileExportDisabled: boolean;
  fileGroupLabelKey: 'export.fileGroup' | 'export.fileGroupEmpty';
}

export const resolveExportableNodeCount = (...counts: number[]): number =>
  counts.reduce((maximum, count) => {
    if (!Number.isFinite(count) || count <= 0) return maximum;
    return Math.max(maximum, Math.floor(count));
  }, 0);

export const resolveExportMenuAvailability = (
  nodeCount: number,
  isExporting: boolean,
): ExportMenuAvailability => {
  const hasExportableContent = Number.isFinite(nodeCount) && nodeCount > 0;

  return {
    fileExportDisabled: isExporting || !hasExportableContent,
    fileGroupLabelKey: hasExportableContent ? 'export.fileGroup' : 'export.fileGroupEmpty',
  };
};
