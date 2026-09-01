import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/display-routing-matrix.yml', 'utf8');

describe('display routing matrix workflow', () => {
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
