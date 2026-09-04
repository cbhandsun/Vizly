import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveRoutingPerformanceSampleCount } from './routing-performance-sample-count.mjs';

const workflow = readFileSync('.github/workflows/routing-performance.yml', 'utf8');
const occurrences = value => workflow.split(value).length - 1;

describe('routing performance workflow', () => {
  it('runs statistically usable main samples and independent scheduled or manual 30-sample jobs', () => {
    expect(workflow).toContain('push:');
    expect(workflow).toContain("- cron: '0 9 * * 1'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('default: 30');
    expect(occurrences('node scripts/resolve-routing-performance-sample-count.mjs')).toBe(3);
    expect(resolveRoutingPerformanceSampleCount({ eventName: 'push' })).toBe(10);
    expect(resolveRoutingPerformanceSampleCount({ eventName: 'schedule' })).toBe(30);
    expect(resolveRoutingPerformanceSampleCount({
      eventName: 'workflow_dispatch',
      requestedSampleCount: '42',
    })).toBe(42);
  });

  it.each(['0', '101', '1.5', 'not-a-number'])(
    'rejects invalid requested sample count %s',
    requestedSampleCount => expect(() => resolveRoutingPerformanceSampleCount({
      eventName: 'workflow_dispatch',
      requestedSampleCount,
    })).toThrow('integer from 1 to 100'),
  );

  it('uses isolated production builds and the bounded benchmark entry points', () => {
    expect(occurrences('npm run build')).toBe(3);
    expect(occurrences("-WindowStyle Hidden -PassThru")).toBe(3);
    expect(occurrences("'--strictPort'")).toBe(3);
    expect(workflow).toContain('DISPLAY_ROUTING_COLD_SAMPLE_COUNT');
    expect(workflow).toContain('npm run benchmark:display-routing-cold');
    expect(workflow).toContain('DISPLAY_ROUTING_SAMPLE_COUNT');
    expect(workflow).toContain('npm run benchmark:display-routing-browser');
    expect(workflow).toContain("'scripts/lib/routing-performance-*'");
    expect(workflow).toContain('Run independent interaction-paint samples');
    expect(workflow).toContain(
      'node scripts/verify-display-routing-browser.mjs --interaction-only',
    );
  });

  it('always stops its own preview process and retains every isolated report', () => {
    expect(occurrences('Stop-Process -Id ([int]$env:ROUTING_PREVIEW_PID)')).toBe(3);
    expect(occurrences('if: ${{ always() }}')).toBe(6);
    expect(workflow).toContain('cold-routing.txt');
    expect(workflow).toContain('incremental-routing.txt');
    expect(workflow).toContain('interaction-paint.txt');
    expect(occurrences('retention-days: 30')).toBe(3);
  });
});
