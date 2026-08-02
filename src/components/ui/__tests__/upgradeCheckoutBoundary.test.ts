import { describe, expect, it } from 'vitest';

import { normalizeUpgradeCheckoutError } from '../upgradeCheckoutBoundary';

describe('normalizeUpgradeCheckoutError', () => {
  it('normalizes a bounded ordinary error', () => {
    expect(normalizeUpgradeCheckoutError(new Error('  Gateway\n unavailable  '), 'Fallback'))
      .toBe('Gateway  unavailable');
  });

  it('uses the fallback for empty and non-string inputs', () => {
    expect(normalizeUpgradeCheckoutError('', 'Fallback')).toBe('Fallback');
    expect(normalizeUpgradeCheckoutError(null, 'Fallback')).toBe('Fallback');
    expect(normalizeUpgradeCheckoutError({ message: 'hidden' }, 'Fallback')).toBe('Fallback');
  });

  it('redacts secrets and limits extreme messages', () => {
    expect(normalizeUpgradeCheckoutError(
      new Error('Authorization: Bearer super-secret-token'),
      'Fallback',
    )).not.toContain('super-secret-token');
    expect(normalizeUpgradeCheckoutError(new Error('x'.repeat(2_000)), 'Fallback'))
      .toHaveLength(500);
  });
});
