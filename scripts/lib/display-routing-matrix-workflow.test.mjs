import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/display-routing-matrix.yml', 'utf8');
const requiredCi = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('display routing matrix workflow', () => {
  it('gates topology editing in required CI after clearing saved-mode filters', () => {
    const topology = requiredCi.indexOf("$env:DISPLAY_ROUTING_MATRIX_CASE = 'topology-edit-cycle'");
    expect(topology).toBeGreaterThan(0);
    for (const name of ['DISPLAY_ROUTING_MATRIX_SAVED_RELOAD', 'DISPLAY_ROUTING_MATRIX_PRESET']) {
      const cleared = requiredCi.indexOf(`Remove-Item Env:${name}`);
      expect(cleared).toBeGreaterThanOrEqual(0);
      expect(cleared).toBeLessThan(topology);
    }
    expect(requiredCi.slice(topology)).toMatch(/topology-edit-cycle'\s+npm run verify:display-routing-matrix\s+if \(\$LASTEXITCODE -ne 0\)/);
    expect(requiredCi.match(/topology-edit-cycle/g)).toHaveLength(1);
    expect(requiredCi.slice(topology)).toContain('Stop-Process -Id $savedPreview.Id');
  });
  it('runs every canonical preset through one continuous 16-layout sequence', () => {
    for (const presetId of [
      'logistics-architecture-v1',
      'wms-demand-allocation-strategy-v2',
      'wms-process-flow-v1',
      'tms-architecture-v1',
    ]) expect(workflow).toContain(`- ${presetId}`);
    expect(workflow).toContain('DISPLAY_ROUTING_MATRIX_CASE: domain-compound-elk-tb');
    expect(workflow).toContain('DISPLAY_ROUTING_MATRIX_WARM_CASES: >-');
    expect(workflow.match(/domain-[a-z-]+|tree-[a-z-]+/g)).toHaveLength(16);
    expect(workflow).toContain('npm run verify:display-routing-matrix');
  });

  it('uses one immutable production build and always stops each preview', () => {
    expect(workflow).toContain('needs: build');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('actions/download-artifact@v4');
    expect(workflow).toContain("'--strictPort'");
    expect(workflow).toContain('if: ${{ always() }}');
    expect(workflow).toContain('Stop-Process -Id ([int]$env:ROUTING_MATRIX_PREVIEW_PID)');
    expect(workflow).not.toContain('continue-on-error');
  });
});
