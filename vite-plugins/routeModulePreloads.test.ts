import { describe, expect, it } from 'vitest';
import {
  addRoutePreloadMeta,
  computeRoutePreloads,
  ROUTE_PRELOAD_META_NAME,
  serializeRoutePreloads,
  type RoutePreloadChunk,
} from './routeModulePreloads';

const chunk = (
  fileName: string,
  facadeModuleId: string | null,
  imports: readonly string[] = [],
  isEntry = false,
): RoutePreloadChunk => ({
  type: 'chunk',
  fileName,
  isEntry,
  facadeModuleId,
  imports,
});

describe('route module preloads plugin', () => {
  it('computes the non-entry static closure for diagram and manage routes', () => {
    const bundle = {
      'assets/index-Entry123.js': chunk(
        'assets/index-Entry123.js',
        '/repo/src/main.tsx',
        ['assets/runtime-Shared12.js'],
        true,
      ),
      'assets/runtime-Shared12.js': chunk('assets/runtime-Shared12.js', null),
      'assets/AntdRouteShell-Abc12345.js': chunk(
        'assets/AntdRouteShell-Abc12345.js',
        '/repo/src/app/AntdRouteShell.tsx',
        ['assets/antd-vendor-Def67890.js', 'assets/runtime-Shared12.js'],
      ),
      'assets/antd-vendor-Def67890.js': chunk('assets/antd-vendor-Def67890.js', null),
      'assets/DiagramViewerRoute-Ghi12345.js': chunk(
        'assets/DiagramViewerRoute-Ghi12345.js',
        '/repo/src/app/DiagramViewerRoute.tsx',
        ['assets/canvas-runtime-Jkl67890.js', 'assets/antd-vendor-Def67890.js'],
      ),
      'assets/canvas-runtime-Jkl67890.js': chunk('assets/canvas-runtime-Jkl67890.js', null),
      'assets/react-Mno12345.js': chunk(
        'assets/react-Mno12345.js',
        '/repo/node_modules/@vizly/core/dist/react.js',
        ['assets/canvas-runtime-Jkl67890.js'],
      ),
      'assets/DiagramManagementPage-Pqr12345.js': chunk(
        'assets/DiagramManagementPage-Pqr12345.js',
        '/repo/src/pages/DiagramManagementPage.tsx',
        ['assets/antd-vendor-Def67890.js'],
      ),
    };

    const preloads = computeRoutePreloads(bundle);
    expect(preloads).toEqual({
      diagram: [
        '/assets/AntdRouteShell-Abc12345.js',
        '/assets/DiagramViewerRoute-Ghi12345.js',
        '/assets/antd-vendor-Def67890.js',
        '/assets/canvas-runtime-Jkl67890.js',
        '/assets/react-Mno12345.js',
      ],
      manage: [
        '/assets/AntdRouteShell-Abc12345.js',
        '/assets/DiagramManagementPage-Pqr12345.js',
        '/assets/antd-vendor-Def67890.js',
      ],
    });
    expect(serializeRoutePreloads(preloads)).toBe(
      'diagram=/assets/AntdRouteShell-Abc12345.js,/assets/DiagramViewerRoute-Ghi12345.js,/assets/antd-vendor-Def67890.js,/assets/canvas-runtime-Jkl67890.js,/assets/react-Mno12345.js;'
      + 'manage=/assets/AntdRouteShell-Abc12345.js,/assets/DiagramManagementPage-Pqr12345.js,/assets/antd-vendor-Def67890.js',
    );
  });

  it('inserts route preload metadata before the independent startup guard', () => {
    const guard = '<script src="/assets/startup-resource-guard.v1.js"></script>';
    const html = `<html><head>${guard}</head><body></body></html>`;
    const out = addRoutePreloadMeta(html, 'diagram=/assets/canvas-runtime-Jkl67890.js');
    expect(out).toContain(`<meta name="${ROUTE_PRELOAD_META_NAME}" content="diagram=/assets/canvas-runtime-Jkl67890.js">`);
    expect(out.indexOf(`name="${ROUTE_PRELOAD_META_NAME}"`)).toBeLessThan(out.indexOf(guard));
  });
});
