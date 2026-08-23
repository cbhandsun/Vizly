import { describe, expect, it } from 'vitest';

import {
  publishBaseReactFlowPrecompiledCommittedRoute,
  resolveBaseReactFlowPrecompiledCapturePresetId,
  resolveBaseReactFlowPrecompiledRegenerationPresetId,
  resolveBaseReactFlowPrecompiledRegenerationPresetIdFromWindow,
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

  it('publishes a clone only for the explicit matching localhost regeneration route', () => {
    window.history.replaceState(
      null,
      '',
      '/?precompiledRegenerate=wms-process-flow-v1#/?diagram=wms-process-flow-v1',
    );
    expect(resolveBaseReactFlowPrecompiledRegenerationPresetIdFromWindow())
      .toBe('wms-process-flow-v1');
    const capture = {
      presetId: 'wms-process-flow-v1',
      inputSignature: '123',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      sourceEdges: [{ id: 'edge', source: 'a', target: 'b' }],
      displayPatches: [{ id: 'edge', source: 'a', target: 'b', data: { computedPath: [] } }],
    };
    expect(publishBaseReactFlowPrecompiledCommittedRoute(capture)).toBe(true);
    const published = (window as Window & {
      __vizlyPrecompiledCommittedRoute?: typeof capture;
    }).__vizlyPrecompiledCommittedRoute;
    expect(published).toEqual(capture);
    expect(published).not.toBe(capture);

    expect(publishBaseReactFlowPrecompiledCommittedRoute({
      ...capture,
      presetId: 'logistics-architecture-v1',
    })).toBe(false);
  });
});
