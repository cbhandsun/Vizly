import { describe, expect, it, vi } from 'vitest';

import { ensureDiagramViewerExportAllowed } from '../diagramViewerExportPolicy';

describe('diagramViewerExportPolicy', () => {
  it('allows an entitled export without opening the upgrade modal', () => {
    const hasFeature = vi.fn(() => true);
    const showUpgradeModal = vi.fn();

    expect(ensureDiagramViewerExportAllowed('pdf', hasFeature, showUpgradeModal)).toBe(true);
    expect(hasFeature).toHaveBeenCalledWith('export-pdf');
    expect(showUpgradeModal).not.toHaveBeenCalled();
  });

  it('blocks an unavailable export and identifies the requested capability', () => {
    const hasFeature = vi.fn(() => false);
    const showUpgradeModal = vi.fn();

    expect(ensureDiagramViewerExportAllowed('svg', hasFeature, showUpgradeModal)).toBe(false);
    expect(hasFeature).toHaveBeenCalledWith('export-hd-svg');
    expect(showUpgradeModal).toHaveBeenCalledWith('超高清矢量 SVG 导出');
  });
});
