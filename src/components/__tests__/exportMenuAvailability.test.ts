import { describe, expect, it } from 'vitest';

import {
  resolveExportableNodeCount,
  resolveExportMenuAvailability,
} from '../exportMenuAvailability';

describe('resolveExportableNodeCount', () => {
  it('uses the bridge count when the surrounding React Flow store is empty', () => {
    expect(resolveExportableNodeCount(0, 3)).toBe(3);
  });

  it('normalizes invalid and fractional counts', () => {
    expect(resolveExportableNodeCount(Number.NaN, Number.POSITIVE_INFINITY, -1, 2.9)).toBe(2);
  });
});

describe('resolveExportMenuAvailability', () => {
  it('disables file exports and explains the empty-canvas state', () => {
    expect(resolveExportMenuAvailability(0, false)).toEqual({
      fileExportDisabled: true,
      fileGroupLabelKey: 'export.fileGroupEmpty',
    });
  });

  it('enables file exports when the canvas contains nodes', () => {
    expect(resolveExportMenuAvailability(1, false)).toEqual({
      fileExportDisabled: false,
      fileGroupLabelKey: 'export.fileGroup',
    });
  });

  it('keeps exports disabled during an active export and for invalid counts', () => {
    expect(resolveExportMenuAvailability(4, true).fileExportDisabled).toBe(true);
    expect(resolveExportMenuAvailability(Number.NaN, false).fileExportDisabled).toBe(true);
    expect(resolveExportMenuAvailability(Number.POSITIVE_INFINITY, false).fileExportDisabled).toBe(true);
    expect(resolveExportMenuAvailability(-1, false).fileExportDisabled).toBe(true);
  });
});
