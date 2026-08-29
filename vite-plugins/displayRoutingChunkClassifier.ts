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
const DISPLAY_ROUTE_ROOT_SUFFIX =
  '/src/core/components/diagrams/FlowchartDesigner.tsx';
const LIGHTWEIGHT_ROUTE_SUFFIXES = [
  '/src/pages/DiagramManagementPage.tsx',
  '/src/pages/DocsPreview.tsx',
  '/src/pages/StorageConfigPage.tsx',
  '/src/pages/Warehouse3DPage.tsx',
] as const;
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
 * modules statically reached by both the display worker and FlowchartDesigner
 * are shared. Starting from the concrete editor root avoids promoting modules
 * that are only reachable through unrelated lazy routes or optional dialogs.
 * Synchronous app-entry dependencies stay out so the routing chunk cannot
 * become a dependency of every route.
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
  const appInitialReach = walkModuleGraph(appEntryIds, getModuleInfo, false);
  const displayRouteRootIds = ids.filter(id => hasSuffix(id, DISPLAY_ROUTE_ROOT_SUFFIX));
  if (displayRouteRootIds.length !== 1) {
    throw new Error(
      `[vizly:display-routing-chunks] Expected exactly one display route root; found ${displayRouteRootIds.length}`,
    );
  }
  const displayRouteReach = walkModuleGraph(displayRouteRootIds, getModuleInfo, false);
  const lightweightRouteIds = ids.filter(id => (
    LIGHTWEIGHT_ROUTE_SUFFIXES.some(suffix => hasSuffix(id, suffix))
  ));
  const lightweightReach = walkModuleGraph(lightweightRouteIds, getModuleInfo, true);
  const sharedModuleIds = new Set<string>();
  const workerPrivateModuleIds = new Set<string>();
  for (const id of workerReach) {
    if (!displayRouteReach.has(id)) {
      workerPrivateModuleIds.add(id);
      continue;
    }
    if (
      getModuleInfo(id)
      && normalizeForMatch(id).includes('/src/core/')
      && !appInitialReach.has(id)
      && !lightweightReach.has(id)
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
