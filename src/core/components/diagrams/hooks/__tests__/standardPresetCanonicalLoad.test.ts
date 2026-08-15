import { describe, expect, it } from 'vitest';

import { resolveCanonicalStandardPresetId } from '../standardPresetCanonicalLoad';

describe('resolveCanonicalStandardPresetId', () => {
  it.each([
    '?canonicalPreset=logistics-architecture-v1',
    '?precompiledCapture=logistics-architecture-v1',
    '?precompiledRegenerate=logistics-architecture-v1',
  ])('accepts a single matching canonical control (%s)', (search) => {
    expect(resolveCanonicalStandardPresetId({
      search,
      hash: '#/?diagram=logistics-architecture-v1',
    })).toBe('logistics-architecture-v1');
  });

  it('supports a direct query route when no hash diagram exists', () => {
    expect(resolveCanonicalStandardPresetId({
      search: '?diagram=wms-process-flow-v1&canonicalPreset=wms-process-flow-v1',
      hash: '',
    })).toBe('wms-process-flow-v1');
  });

  it.each([
    { search: '', hash: '#/?diagram=logistics-architecture-v1' },
    {
      search: '?canonicalPreset=wms-process-flow-v1',
      hash: '#/?diagram=logistics-architecture-v1',
    },
    {
      search: '?canonicalPreset=logistics-architecture-v1&canonicalPreset=logistics-architecture-v1',
      hash: '#/?diagram=logistics-architecture-v1',
    },
    {
      search: '?canonicalPreset=../../logistics',
      hash: '#/?diagram=../../logistics',
    },
    {
      search: `?canonicalPreset=${'a'.repeat(121)}`,
      hash: `#/?diagram=${'a'.repeat(121)}`,
    },
    { search: null, hash: '#/?diagram=logistics-architecture-v1' },
    { search: '?canonicalPreset=logistics-architecture-v1', hash: null },
  ])('rejects absent, mismatched, duplicate, malformed, or oversized input', (location) => {
    expect(resolveCanonicalStandardPresetId(location)).toBeNull();
  });
});
