import { describe, expect, it } from 'vitest';

import {
  renderPrecompiledRouteLoaders,
  renderPrecompiledRouteManifest,
} from './precompiled-display-route-render.mjs';

describe('precompiled display route loader rendering', () => {
  it('emits bounded data-asset loading instead of executable JSON chunks', () => {
    const source = renderPrecompiledRouteLoaders([{
      artifactFile: 'route-123.json',
      geometryDigest: 'geometry-v1:test',
      inputGeometryDigest: 'geometry-v1:test',
      inputSignature: '123',
      presetId: 'preset',
      sourceHash: 'source-v1:test',
      variantId: 'initial',
    }]);

    expect(source).toContain("new URL(\n  './precompiledRoutes/route-123.json',\n  import.meta.url,\n)");
    expect(source).toContain('loadBaseReactFlowPrecompiledRouteAsset(generatedPrecompiledRouteAsset0)');
    expect(source).not.toContain("import('./precompiledRoutes/route-123.json')");
  });

  it('buckets colliding signatures and prefetches only the initial preset variant', () => {
    const entries = [
      {
        artifactFile: 'route-123-initial.json',
        inputGeometryDigest: 'geometry-v1:initial',
        inputSignature: '123',
        presetId: 'preset',
        sourceHash: 'source-v1:initial',
        variantId: 'initial',
      },
      {
        artifactFile: 'route-123-layout.json',
        inputGeometryDigest: 'geometry-v1:layout',
        inputSignature: '123',
        presetId: 'preset',
        sourceHash: 'source-v1:layout',
        variantId: 'domain-compound-elk-lr',
      },
    ];

    const source = renderPrecompiledRouteLoaders(entries);
    const registrySource = source.slice(
      source.indexOf('GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_LOADERS'),
      source.indexOf('/**\n * Preset ids only'),
    );
    const prefetchSource = source.slice(
      source.indexOf('GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_PREFETCH_LOADERS'),
    );

    expect(registrySource).toContain(
      '"123": [generatedPrecompiledRouteDescriptor0, generatedPrecompiledRouteDescriptor1]',
    );
    expect(source).toContain('variantId: "initial"');
    expect(source).toContain('variantId: "domain-compound-elk-lr"');
    expect(prefetchSource).toContain('"preset": generatedPrecompiledRouteDescriptor0');
    expect(prefetchSource).not.toContain('generatedPrecompiledRouteDescriptor1');

    const manifest = JSON.parse(renderPrecompiledRouteManifest({
      schema: 'manifest-v3',
      routingVersion: '15',
      identitySourceHash: 'identity-hash',
      routingSourceHash: 'routing-hash',
      entries,
    }));
    expect(manifest.entries.map(entry => entry.variantId)).toEqual([
      'initial',
      'domain-compound-elk-lr',
    ]);
  });
});
