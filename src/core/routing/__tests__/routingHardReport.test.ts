import { describe, expect, it } from 'vitest';

import {
  cloneRoutingHardReport,
  computeDisplayRoutingHardReportDigest,
  isDisplayRoutingHardReportDigest,
} from '../routingHardReport';
import { TEST_ROUTING_HARD_REPORT } from './displayRoutingRenderAuthorityTestFixture';

describe('routing hard-report boundary', () => {
  it('copies and deeply freezes the bounded aggregate report', () => {
    const source = {
      ...TEST_ROUTING_HARD_REPORT,
      quality: { ...TEST_ROUTING_HARD_REPORT.quality },
      minimumClearanceViolationEdgeIds: ['edge-a'],
    };
    const report = cloneRoutingHardReport(source);
    if (!report) throw new Error('expected hard report');

    source.quality.totalLength = 999;
    source.minimumClearanceViolationEdgeIds.push('edge-b');
    expect(report.quality.totalLength).toBe(100);
    expect(report.minimumClearanceViolationEdgeIds).toEqual(['edge-a']);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.quality)).toBe(true);
    expect(Object.isFrozen(report.minimumClearanceViolationEdgeIds)).toBe(true);
    expect(isDisplayRoutingHardReportDigest(
      computeDisplayRoutingHardReportDigest(report),
    )).toBe(true);
  });

  it.each([
    null,
    {},
    { ...TEST_ROUTING_HARD_REPORT, hardClean: 'true' },
    { ...TEST_ROUTING_HARD_REPORT, obstacleHits: -1 },
    {
      ...TEST_ROUTING_HARD_REPORT,
      quality: { ...TEST_ROUTING_HARD_REPORT.quality, totalLength: Number.NaN },
    },
    {
      ...TEST_ROUTING_HARD_REPORT,
      minimumClearanceViolationEdgeIds: ['x'.repeat(501)],
    },
    {
      ...TEST_ROUTING_HARD_REPORT,
      minimumClearanceViolationEdgeIds: Array.from({ length: 301 }, (_, index) => `e-${index}`),
    },
  ])('rejects malformed, non-finite, negative, or oversized input: %j', value => {
    expect(cloneRoutingHardReport(value)).toBeNull();
  });

  it('does not accept a malformed digest', () => {
    expect(isDisplayRoutingHardReportDigest('hard-report-v1:short')).toBe(false);
    expect(isDisplayRoutingHardReportDigest(null)).toBe(false);
  });
});
