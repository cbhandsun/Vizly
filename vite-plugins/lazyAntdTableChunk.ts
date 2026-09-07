import type { Plugin } from 'vite';

const normalizeModuleId = (id: string): string => id.replace(/\\/g, '/').split('?', 1)[0];
const TABLE_MODULE = /\/node_modules\/(?:antd\/es\/table|@rc-component\/table)\//;

/** Tooltip needs this tiny context even when no table is mounted. */
export const matchesLazyAntdTableModule = (id: string): boolean => {
  const normalized = normalizeModuleId(id);
  return TABLE_MODULE.test(normalized)
    && !normalized.endsWith('/antd/es/table/TableMeasureRowContext.js');
};

export const lazyAntdTableChunkGroup = {
  name: 'vendor-antd-table',
  test: matchesLazyAntdTableModule,
  priority: 85,
  minSize: 0,
  entriesAware: false,
  includeDependenciesRecursively: false,
} as const;

type TableIsolationChunk = Readonly<{
  fileName: string;
  facadeModuleId: string | null;
  imports: readonly string[];
  modules: Readonly<Record<string, Readonly<{ renderedLength: number }>>>;
}>;

const EDITOR_ENTRY_SUFFIXES = [
  '/src/main.tsx',
  '/src/core/components/diagrams/FlowchartDesigner.tsx',
  '/src/core/components/diagrams/AdvancedFlowchartCanvasShell.tsx',
];

/** Inspect emitted imports so a shared context cannot pull the table back in. */
export const assertLazyAntdTableIsolation = (chunks: readonly TableIsolationChunk[]): void => {
  const byName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  if (byName.size !== chunks.length) throw new Error('Lazy table isolation found duplicate chunk names');
  const roots = EDITOR_ENTRY_SUFFIXES.map(suffix => {
    const matches = chunks.filter(chunk => (
      (chunk.facadeModuleId !== null && normalizeModuleId(chunk.facadeModuleId).endsWith(suffix))
      || Object.keys(chunk.modules).some(id => normalizeModuleId(id).endsWith(suffix))
    ));
    if (matches.length !== 1) throw new Error(`Lazy table isolation requires one entry for ${suffix}`);
    return matches[0].fileName;
  });
  const pending = [...roots];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const fileName = pending.pop();
    if (!fileName || visited.has(fileName)) continue;
    const chunk = byName.get(fileName);
    if (!chunk) throw new Error(`Lazy table isolation is missing static import: ${fileName}`);
    visited.add(fileName);
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (module.renderedLength > 0 && matchesLazyAntdTableModule(id)) {
        throw new Error(`Editor startup imports table implementation in ${fileName}: ${id}`);
      }
    }
    pending.push(...chunk.imports);
  }
};

export const lazyAntdTableIsolationPlugin = (): Plugin => ({
  name: 'vizly:lazy-antd-table-isolation',
  apply: 'build',
  generateBundle(_options, bundle) {
    assertLazyAntdTableIsolation(Object.values(bundle).filter(chunk => chunk.type === 'chunk'));
  },
});
