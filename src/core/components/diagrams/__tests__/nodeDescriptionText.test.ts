import { describe, expect, it } from 'vitest';

import { normalizeNodeDescriptionForEditing } from '../nodeDescriptionText';

describe('normalizeNodeDescriptionForEditing', () => {
  it('converts existing rich descriptions to readable plain text', () => {
    expect(normalizeNodeDescriptionForEditing('<b>ASN</b><br/>Inbound &amp; receipt'))
      .toBe('ASN\nInbound & receipt');
  });

  it('handles empty, invalid, malformed, encoded, and oversized input safely', () => {
    expect(normalizeNodeDescriptionForEditing(null)).toBe('');
    expect(normalizeNodeDescriptionForEditing({ description: 'nope' })).toBe('');
    expect(normalizeNodeDescriptionForEditing('<script>alert(1)</script>')).toBe('alert(1)');
    expect(normalizeNodeDescriptionForEditing('&lt;img onerror=alert(1)&gt;'))
      .toBe('<img onerror=alert(1)>');
    expect(normalizeNodeDescriptionForEditing('a'.repeat(30_000))).toHaveLength(10_000);
  });
});
