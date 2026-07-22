import { describe, expect, it, vi } from 'vitest';

import { runPermittedFlowchartExport } from '../flowchartExportAccess';

describe('flowchartExportAccess', () => {
  it('executes an export after permission is granted', async () => {
    const permissionCheck = vi.fn(() => true);
    const exportAction = vi.fn(async () => undefined);

    await expect(runPermittedFlowchartExport('pdf', permissionCheck, exportAction)).resolves.toBe(true);
    expect(permissionCheck).toHaveBeenCalledWith('pdf');
    expect(exportAction).toHaveBeenCalledTimes(1);
  });

  it('does not execute an export after permission is denied', async () => {
    const exportAction = vi.fn(async () => undefined);

    await expect(runPermittedFlowchartExport('svg', () => false, exportAction)).resolves.toBe(false);
    expect(exportAction).not.toHaveBeenCalled();
  });
});
