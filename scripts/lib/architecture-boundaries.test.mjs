import { describe, expect, it } from 'vitest';

import {
  compareArchitectureBoundaryBaseline,
  findForbiddenArchitectureEdges,
  findForbiddenPublicApiImports,
  findRestrictedNamedImportViolations,
  findRuntimeImportCycles,
  resolveProjectImport,
} from './architecture-boundaries.mjs';

describe('architecture boundaries', () => {
  const sourceFiles = new Set([
    'src/core/domain/model.ts',
    'src/core/feature.ts',
    'src/services/remote.ts',
    'src/components/widget/index.tsx',
  ]);

  it('resolves aliases, relative modules, and index modules without escaping to packages', () => {
    expect(resolveProjectImport({
      fromFile: 'src/core/feature.ts',
      specifier: '@/services/remote',
      sourceFiles,
    })).toBe('src/services/remote.ts');
    expect(resolveProjectImport({
      fromFile: 'src/core/feature.ts',
      specifier: './domain/model',
      sourceFiles,
    })).toBe('src/core/domain/model.ts');
    expect(resolveProjectImport({
      fromFile: 'src/core/feature.ts',
      specifier: '@/components/widget',
      sourceFiles,
    })).toBe('src/components/widget/index.tsx');
    expect(resolveProjectImport({
      fromFile: 'src/core/feature.ts',
      specifier: 'react',
      sourceFiles,
    })).toBeNull();
  });

  it('reports only forbidden project edges and deduplicates repeated imports', () => {
    const violations = findForbiddenArchitectureEdges({
      sourceFiles,
      fileImports: new Map([
        ['src/core/feature.ts', [
          '@/services/remote',
          '@/services/remote',
          './domain/model',
          '@/components/widget',
        ]],
      ]),
      policies: [{
        fromPrefix: 'src/core/',
        forbiddenTargetPrefixes: ['src/services/', 'src/components/'],
      }],
    });

    expect(violations).toEqual([
      'src/core/feature.ts -> src/components/widget/index.tsx',
      'src/core/feature.ts -> src/services/remote.ts',
    ]);
  });

  it('supports internal core layering policies', () => {
    const internalSourceFiles = new Set([
      'src/core/algorithms/path.ts',
      'src/core/components/Diagram.tsx',
      'src/core/types/routing.ts',
    ]);

    expect(findForbiddenArchitectureEdges({
      sourceFiles: internalSourceFiles,
      fileImports: new Map([
        ['src/core/algorithms/path.ts', [
          '@/core/types/routing',
          '@/core/components/Diagram',
        ]],
      ]),
      policies: [{
        fromPrefix: 'src/core/algorithms/',
        forbiddenTargetPrefixes: ['src/core/components/'],
      }],
    })).toEqual([
      'src/core/algorithms/path.ts -> src/core/components/Diagram.tsx',
    ]);
  });

  it('detects both new debt and stale baseline entries', () => {
    expect(compareArchitectureBoundaryBaseline(
      ['existing', 'new-edge'],
      ['existing', 'removed-edge'],
    )).toEqual({
      additions: ['new-edge'],
      removals: ['removed-edge'],
    });
  });

  it('reports runtime cycles but leaves directed acyclic paths alone', () => {
    expect(findRuntimeImportCycles(new Map([
      ['src/a.ts', ['src/b.ts']],
      ['src/b.ts', ['src/c.ts']],
      ['src/c.ts', ['src/a.ts']],
      ['src/leaf.ts', ['src/a.ts']],
      ['src/acyclic.ts', ['src/leaf.ts']],
    ]))).toEqual([['src/a.ts', 'src/b.ts', 'src/c.ts']]);
  });

  it('keeps the public core entry point free of eager UI and plugin imports', () => {
    expect(findForbiddenPublicApiImports({
      importGraph: new Map([
        ['src/core/index.ts', [
          'src/core/services/PluginRegistry.ts',
          'src/core/components/diagrams/FlowchartDesigner.tsx',
          'src/core/plugins/builtInPlugins.ts',
          'src/core/plugins/FlowchartPlugin.tsx',
        ]],
      ]),
      entryFile: 'src/core/index.ts',
      forbiddenTargetPrefixes: ['src/core/components/', 'src/core/plugins/'],
      allowedTargets: ['src/core/plugins/builtInPlugins.ts'],
    })).toEqual([
      'src/core/components/diagrams/FlowchartDesigner.tsx',
      'src/core/plugins/FlowchartPlugin.tsx',
    ]);
  });

  it('restricts commit-capability imports to their declared production owner', () => {
    expect(findRestrictedNamedImportViolations({
      imports: [{
        fromFile: 'src/core/components/custom-edges/Standalone.tsx',
        targetFile: 'src/core/routing/displayRoutingRenderAuthority.ts',
        names: ['createDisplayRoutingRenderAuthority', 'readDisplayRoutingRenderSessionContract'],
      }, {
        fromFile: 'src/core/components/shared/useBaseReactFlowDisplayRenderAuthority.ts',
        targetFile: 'src/core/routing/displayRoutingRenderAuthority.ts',
        names: ['createDisplayRoutingRenderAuthority'],
      }],
      policies: [{
        targetFile: 'src/core/routing/displayRoutingRenderAuthority.ts',
        restrictedNames: ['createDisplayRoutingRenderAuthority'],
        allowedImporters: [
          'src/core/components/shared/useBaseReactFlowDisplayRenderAuthority.ts',
        ],
      }],
    })).toEqual([
      'src/core/components/custom-edges/Standalone.tsx -> src/core/routing/displayRoutingRenderAuthority.ts [createDisplayRoutingRenderAuthority]',
    ]);
  });
});
