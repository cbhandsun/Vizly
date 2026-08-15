import { describe, expect, it } from 'vitest';

import {
  resolveBaseReactFlowPrecompiledCapturePresetId,
  resolveBaseReactFlowPrecompiledRegenerationPresetId,
} from '../baseReactFlowPrecompiledCaptureMode';

describe('baseReactFlowPrecompiledCaptureMode', () => {
  it('accepts one matching bounded preset identity', () => {
    expect(resolveBaseReactFlowPrecompiledCapturePresetId({
      search: '?precompiledCapture=wms-process-flow-v1',
      hash: '#/?diagram=wms-process-flow-v1',
    })).toBe('wms-process-flow-v1');
    expect(resolveBaseReactFlowPrecompiledRegenerationPresetId({
      search: '?precompiledRegenerate=wms-process-flow-v1',
      hash: '#/?diagram=wms-process-flow-v1',
    })).toBe('wms-process-flow-v1');
  });

  it('keeps ordinary capture separate from cache-free regeneration', () => {
    const input = {
      search: '?precompiledCapture=wms-process-flow-v1',
      hash: '#/?diagram=wms-process-flow-v1',
    };
    expect(resolveBaseReactFlowPrecompiledCapturePresetId(input)).toBe('wms-process-flow-v1');
    expect(resolveBaseReactFlowPrecompiledRegenerationPresetId(input)).toBeNull();
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
