import { describe, expect, it } from 'vitest';

import { resolveBaseReactFlowPrecompiledCapturePresetId } from '../baseReactFlowPrecompiledCaptureMode';

describe('baseReactFlowPrecompiledCaptureMode', () => {
  it('accepts one matching bounded preset identity', () => {
    expect(resolveBaseReactFlowPrecompiledCapturePresetId({
      search: '?precompiledCapture=wms-process-flow-v1',
      hash: '#/?diagram=wms-process-flow-v1',
    })).toBe('wms-process-flow-v1');
  });

  it.each([
    { search: '', hash: '#/?diagram=wms-process-flow-v1' },
    {
      search: '?precompiledCapture=wms-process-flow-v1',
      hash: '#/?diagram=logistics-architecture-v1',
    },
    {
      search: '?precompiledCapture=wms-process-flow-v1&precompiledCapture=wms-process-flow-v1',
      hash: '#/?diagram=wms-process-flow-v1',
    },
    {
      search: '?precompiledCapture=../../wms',
      hash: '#/?diagram=../../wms',
    },
    {
      search: `?precompiledCapture=${'a'.repeat(121)}`,
      hash: `#/?diagram=${'a'.repeat(121)}`,
    },
    {
      search: `?precompiledCapture=${'a'.repeat(2_049)}`,
      hash: '#/?diagram=wms-process-flow-v1',
    },
    { search: null, hash: '#/?diagram=wms-process-flow-v1' },
    { search: '?precompiledCapture=wms-process-flow-v1', hash: null },
  ])('rejects absent, mismatched, duplicate, malformed, or oversized input', (input) => {
    expect(resolveBaseReactFlowPrecompiledCapturePresetId(input)).toBeNull();
  });
});
