import { describe, expect, it } from 'vitest';

import { renderPrecompiledRouteLoaders } from './precompiled-display-route-render.mjs';

describe('precompiled display route loader rendering', () => {
  it('emits bounded data-asset loading instead of executable JSON chunks', () => {
    const source = renderPrecompiledRouteLoaders([{
      artifactFile: 'route-123.json',
      geometryDigest: 'geometry-v1:test',
      inputGeometryDigest: 'geometry-v1:test',
      inputSignature: '123',
      presetId: 'preset',
      sourceHash: 'source-v1:test',
    }]);

    expect(source).toContain("new URL(\n  './precompiledRoutes/route-123.json',\n  import.meta.url,\n)");
    expect(source).toContain('loadBaseReactFlowPrecompiledRouteAsset(generatedPrecompiledRouteAsset0)');
    expect(source).not.toContain("import('./precompiledRoutes/route-123.json')");
  });
});
