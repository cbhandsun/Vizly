import { describe, expect, it } from 'vitest';

import {
  collectStaticJsAssetPaths,
  parseViteModuleEntry,
  readStaticJsImports,
} from './bundle-static-import-graph.mjs';

describe('bundle static import graph', () => {
  it('reads the Vite module entry regardless of attribute order', () => {
    expect(parseViteModuleEntry('<script crossorigin src="/assets/index-a.js" type="module"></script>'))
      .toBe('assets/index-a.js');
    expect(parseViteModuleEntry("<script type='module' src='assets/index-b.js?v=1'></script>"))
      .toBe('assets/index-b.js');
  });

  it('separates static imports from dynamic imports', () => {
    expect(readStaticJsImports([
      'import{a as b}from"./shared.js";',
      'import "./side-effect.js";',
      'const lazy=()=>import("./lazy.js");',
    ].join(''))).toEqual(['./shared.js', './side-effect.js']);
  });

  it('walks cycles once and excludes lazy chunks', () => {
    const sources = new Map([
      ['assets/index.js', 'import"./a.js";const load=()=>import("./lazy.js")'],
      ['assets/a.js', 'import"./nested/b.js";'],
      ['assets/nested/b.js', 'import"../a.js";'],
      ['assets/lazy.js', ''],
    ]);
    expect(new Set(collectStaticJsAssetPaths('assets/index.js', sources))).toEqual(new Set([
      'assets/index.js', 'assets/a.js', 'assets/nested/b.js',
    ]));
  });

  it.each([
    ['', 'Invalid Vite entry HTML'],
    ['<script src="/assets/index.js"></script>', 'Vite module entry was not found'],
    ['<script type="module" src="/outside.js"></script>', 'Unsafe bundle asset path'],
  ])('rejects malformed entry HTML', (html, message) => {
    expect(() => parseViteModuleEntry(html)).toThrow(message);
  });

  it('rejects missing and escaping imports', () => {
    expect(() => collectStaticJsAssetPaths('assets/index.js', new Map([
      ['assets/index.js', 'import"./missing.js"'],
    ]))).toThrow('Missing static bundle asset');
    expect(() => collectStaticJsAssetPaths('assets/index.js', new Map([
      ['assets/index.js', 'import"../../escape.js"'],
    ]))).toThrow('Unsafe bundle asset path');
  });
});
