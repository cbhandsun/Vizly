type DisplayWorkerChunk = Readonly<{
  fileName: string;
  facadeModuleId: string | null;
  imports: readonly string[];
  modules: Readonly<Record<string, Readonly<{ renderedLength: number }>>>;
}>;

const WORKER_ENTRY_SUFFIX = '/src/core/components/shared/baseReactFlowDisplayEdges.worker.ts';
const UI_RUNTIME_MODULE = /\/node_modules\/(?:react|react-dom|antd|@ant-design|@rc-component|rc-[^/]+)\//;
const normalizeModuleId = (id: string): string => id.replace(/\\/g, '/').split('?', 1)[0];

/** Checks emitted chunks: a pure source module can still share a chunk with UI code. */
export const assertDisplayWorkerChunkIsolation = (chunks: readonly DisplayWorkerChunk[]): void => {
  const entries = chunks.filter(chunk => (
    chunk.facadeModuleId !== null
    && normalizeModuleId(chunk.facadeModuleId).endsWith(WORKER_ENTRY_SUFFIX)
  ));
  if (entries.length !== 1) {
    throw new Error(`Display Worker isolation requires one emitted entry; found ${entries.length}`);
  }
  const chunksByName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  if (chunksByName.size !== chunks.length) {
    throw new Error('Display Worker isolation found duplicate chunk names');
  }
  const visited = new Set<string>();
  const pending = [entries[0].fileName];
  while (pending.length > 0) {
    const fileName = pending.pop();
    if (!fileName || visited.has(fileName)) continue;
    const chunk = chunksByName.get(fileName);
    if (!chunk) throw new Error(`Display Worker static import is missing: ${fileName}`);
    visited.add(fileName);
    for (const [id, metadata] of Object.entries(chunk.modules)) {
      if (metadata.renderedLength > 0 && UI_RUNTIME_MODULE.test(normalizeModuleId(id))) {
        throw new Error(`Display Worker imports UI runtime in ${fileName}: ${id}`);
      }
    }
    pending.push(...chunk.imports);
  }
};
