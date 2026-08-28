import { describe, expect, it } from 'vitest';

import {
  publishBaseReactFlowPrecompiledCommittedRoute,
  resolveBaseReactFlowPrecompiledCapturePresetId,
  resolveBaseReactFlowPrecompiledLayoutRegeneration,
  resolveBaseReactFlowPrecompiledLayoutRegenerationFromWindow,
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

  it('accepts one exact layout regeneration identity', () => {
    const input = {
      search: '?precompiledLayoutRegenerate=wms-process-flow-v1&precompiledLayoutVariant=domain-compound-elk-lr',
      hash: '#/?diagram=wms-process-flow-v1',
    };
    expect(resolveBaseReactFlowPrecompiledLayoutRegeneration(input)).toEqual({
      presetId: 'wms-process-flow-v1',
      variantId: 'domain-compound-elk-lr',
    });
    expect(resolveBaseReactFlowPrecompiledRegenerationPresetId(input)).toBeNull();
  });

  it.each([
    '?precompiledLayoutRegenerate=wms-process-flow-v1',
    '?precompiledLayoutVariant=domain-compound-elk-lr',
    '?precompiledLayoutRegenerate=wms-process-flow-v1&precompiledLayoutVariant=../../lr',
    '?precompiledLayoutRegenerate=wms-process-flow-v1&precompiledLayoutRegenerate=wms-process-flow-v1&precompiledLayoutVariant=domain-compound-elk-lr',
  ])('rejects incomplete, malformed, or duplicate layout regeneration input', (search) => {
    expect(resolveBaseReactFlowPrecompiledLayoutRegeneration({
      search,
      hash: '#/?diagram=wms-process-flow-v1',
    })).toBeNull();
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

  it('publishes a layout capture only for the exact active variant', () => {
    window.history.replaceState(
      null,
      '',
      '/?precompiledLayoutRegenerate=wms-process-flow-v1&precompiledLayoutVariant=domain-compound-elk-lr#/?diagram=wms-process-flow-v1',
    );
    expect(resolveBaseReactFlowPrecompiledLayoutRegenerationFromWindow()).toEqual({
      presetId: 'wms-process-flow-v1',
      variantId: 'domain-compound-elk-lr',
    });
    const capture = {
      presetId: 'wms-process-flow-v1',
      variantId: 'domain-compound-elk-lr',
      provenance: 'fresh-full-route' as const,
      inputSignature: '123',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      sourceEdges: [{ id: 'edge', source: 'a', target: 'b' }],
      displayPatches: [{ id: 'edge', source: 'a', target: 'b', data: { computedPath: [] } }],
    };
    expect(publishBaseReactFlowPrecompiledCommittedRoute(capture)).toBe(true);
    expect(publishBaseReactFlowPrecompiledCommittedRoute({
      ...capture,
      variantId: 'domain-compound-elk-tb',
    })).toBe(false);
    expect(publishBaseReactFlowPrecompiledCommittedRoute({
      ...capture,
      variantId: undefined,
    })).toBe(false);
  });
});
