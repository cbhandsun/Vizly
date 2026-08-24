import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectPrecompiledDisplayRoutingSourceEntries,
  hashPrecompiledDisplayRoutingSourceEntries,
} from './precompiled-display-route-source-set.mjs';

describe('precompiled display routing source set', () => {
  it('is order-independent but changes with implementation content and paths', () => {
    const first = { path: 'src/core/routing/a.ts', source: 'export const a = 1;\n' };
    const second = { path: 'src/core/strategies/b.ts', source: 'export const b = 2;\n' };
    const baseline = hashPrecompiledDisplayRoutingSourceEntries([first, second]);

    expect(hashPrecompiledDisplayRoutingSourceEntries([second, first])).toBe(baseline);
    expect(hashPrecompiledDisplayRoutingSourceEntries([
      first,
      { ...second, source: 'export const b = 3;\n' },
    ])).not.toBe(baseline);
    expect(hashPrecompiledDisplayRoutingSourceEntries([
      first,
      { ...second, path: 'src/core/strategies/c.ts' },
    ])).not.toBe(baseline);
  });

  it('frames LF, CRLF, and legacy CR source with the same normalized length', () => {
    const entry = { path: 'src/core/routing/a.ts', source: 'first\nsecond\n' };
    const baseline = hashPrecompiledDisplayRoutingSourceEntries([entry]);

    expect(hashPrecompiledDisplayRoutingSourceEntries([{
      ...entry,
      source: 'first\r\nsecond\r\n',
    }])).toBe(baseline);
    expect(hashPrecompiledDisplayRoutingSourceEntries([{
      ...entry,
      source: 'first\rsecond\r',
    }])).toBe(baseline);
  });

  it('rejects empty, duplicate, and unsafe entries', () => {
    expect(() => hashPrecompiledDisplayRoutingSourceEntries([])).toThrow(TypeError);
    expect(() => hashPrecompiledDisplayRoutingSourceEntries([
      { path: 'src/core/routing/a.ts', source: 'a' },
      { path: 'src/core/routing/a.ts', source: 'b' },
    ])).toThrow(TypeError);
    expect(() => hashPrecompiledDisplayRoutingSourceEntries([
      { path: '../outside.ts', source: 'a' },
    ])).toThrow(TypeError);
  });

  it('covers the runtime route lifecycle entry points and excludes tests', async () => {
    const entries = await collectPrecompiledDisplayRoutingSourceEntries(resolve(process.cwd()));
    const paths = entries.map(entry => entry.path);

    expect(paths).toContain('src/core/components/shared/useBaseReactFlowDisplayRouting.ts');
    expect(paths).toContain('src/core/components/shared/baseReactFlowDisplayEdges.worker.ts');
    expect(paths).toContain('src/components/diagramViewerFlowchartLoader.tsx');
    expect(paths.some(path => path.includes('/__tests__/'))).toBe(false);
    expect(paths.some(path => path.includes('/generated/'))).toBe(false);
  });
});
