import type { Plugin } from 'vite';

export type ChunkGraphModuleInfo = {
  isEntry?: boolean;
  importedIds?: readonly string[];
  dynamicallyImportedIds?: readonly string[];
};

export type DisplayRoutingChunkGraphInput = {
  moduleIds: Iterable<string>;
  getModuleInfo: (id: string) => ChunkGraphModuleInfo | null | undefined;
  excludeSharedModule?: (id: string) => boolean;
};

export type DisplayRoutingChunkClassification = {
  displayWorkerEntryId: string;
  appEntryIds: readonly string[];
  sharedModuleIds: ReadonlySet<string>;
  workerPrivateModuleIds: ReadonlySet<string>;
};

const DISPLAY_WORKER_ENTRY_SUFFIX =
  '/src/core/components/shared/baseReactFlowDisplayEdges.worker.ts';
const NON_APP_WORKER_ENTRY_SUFFIXES = [DISPLAY_WORKER_ENTRY_SUFFIX] as const;

const normalizeForMatch = (id: string): string => (
  id.replace(/\\/g, '/').split('?', 1)[0]
);

const hasSuffix = (id: string, suffix: string): boolean => (
  normalizeForMatch(id).endsWith(suffix)
);

const walkModuleGraph = (
  roots: readonly string[],
  getModuleInfo: DisplayRoutingChunkGraphInput['getModuleInfo'],
  includeDynamicImports: boolean,
): Set<string> => {
  const visited = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const info = getModuleInfo(id);
    if (!info) continue;
    for (const child of info.importedIds ?? []) {
      if (typeof child === 'string' && child.length > 0) pending.push(child);
    }
    if (includeDynamicImports) {
      for (const child of info.dynamicallyImportedIds ?? []) {
        if (typeof child === 'string' && child.length > 0) pending.push(child);
      }
    }
  }
  return visited;
};

/**
 * Classifies the loaded Rollup graph by actual reachability. Only project-core
 * modules statically reached by the display worker and reached anywhere in the
 * client graph are shared. Worker dynamic imports stay outside the critical
 * worker closure, and worker-private repair stages remain in the worker entry.
 */
export const classifyDisplayRoutingChunkGraph = ({
  moduleIds,
  getModuleInfo,
  excludeSharedModule = () => false,
}: DisplayRoutingChunkGraphInput): DisplayRoutingChunkClassification => {
  const ids = [...moduleIds].filter((id): id is string => (
    typeof id === 'string' && id.length > 0
  ));
  const entryIds = ids.filter(id => getModuleInfo(id)?.isEntry === true);
  const workerEntries = entryIds.filter(id => hasSuffix(id, DISPLAY_WORKER_ENTRY_SUFFIX));
  if (workerEntries.length !== 1) {
    throw new Error(
      `[vizly:display-routing-chunks] Expected exactly one display worker entry; found ${workerEntries.length}`,
    );
  }
  const appEntryIds = entryIds.filter(id => (
    !NON_APP_WORKER_ENTRY_SUFFIXES.some(suffix => hasSuffix(id, suffix))
  ));
  if (appEntryIds.length === 0) {
    throw new Error('[vizly:display-routing-chunks] No non-worker application entry found');
  }

  const displayWorkerEntryId = workerEntries[0];
  const workerReach = walkModuleGraph([displayWorkerEntryId], getModuleInfo, false);
  const appReach = walkModuleGraph(appEntryIds, getModuleInfo, true);
  const sharedModuleIds = new Set<string>();
  const workerPrivateModuleIds = new Set<string>();
  for (const id of workerReach) {
    if (!appReach.has(id)) {
      workerPrivateModuleIds.add(id);
      continue;
    }
    if (
      getModuleInfo(id)
      && normalizeForMatch(id).includes('/src/core/')
      && !excludeSharedModule(id)
    ) {
      sharedModuleIds.add(id);
    }
  }
  return {
    displayWorkerEntryId,
    appEntryIds,
    sharedModuleIds,
    workerPrivateModuleIds,
  };
};

/** Build adapter whose predicate is populated after Rollup has loaded the graph. */
export const createDisplayRoutingChunkClassifier = (
  excludeSharedModule: (id: string) => boolean = () => false,
): {
  plugin: Plugin;
  matchesSharedModule: (id: string) => boolean;
} => {
  const activeSharedIds = new Set<string>();
  const plugin: Plugin = {
    name: 'vizly:display-routing-chunk-classifier',
    apply: 'build',
    buildEnd(error) {
      activeSharedIds.clear();
      if (error) return;
      const result = classifyDisplayRoutingChunkGraph({
        moduleIds: this.getModuleIds(),
        getModuleInfo: id => this.getModuleInfo(id),
        excludeSharedModule,
      });
      for (const id of result.sharedModuleIds) activeSharedIds.add(id);
    },
  };
  return {
    plugin,
    matchesSharedModule: id => activeSharedIds.has(id),
  };
};
