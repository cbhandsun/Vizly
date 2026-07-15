import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createSharedDisplayWorkerUrlModule,
  createSharedPathfindingWorkerConstructorModule,
  sharedModuleWorkersPlugin,
  transformSharedModuleWorkerConsumer,
} from '../../../../vite-plugins/sharedModuleWorkers';
import {
  matchesAppSafeLoggingModule,
  matchesThemePresetModule,
} from '../../../../vite-plugins/buildChunkGroups';
import {
  classifyDisplayRoutingChunkGraph,
  createDisplayRoutingChunkClassifier,
  type ChunkGraphModuleInfo,
} from '../../../../vite-plugins/displayRoutingChunkClassifier';

const displayWorkerId = 'C:\\repo\\src\\core\\components\\shared\\baseReactFlowDisplayEdges.worker.ts';
const pathfindingWorkerId = 'C:/repo/src/core/workers/pathfinding.worker.ts';
const appEntryId = 'C:/repo/src/main.tsx';

const classifyGraph = (
  graph: Map<string, ChunkGraphModuleInfo | null>,
  excludeSharedModule?: (id: string) => boolean,
) => classifyDisplayRoutingChunkGraph({
  moduleIds: graph.keys(),
  getModuleInfo: id => graph.get(id),
  excludeSharedModule,
});

describe('display routing chunk classifier', () => {
  it('shares the worker/app intersection while keeping private and dynamic worker modules out', () => {
    const shared = 'C:/repo/src/core/routing/shared.ts';
    const sharedCycle = 'C:/repo/src/core/routing/sharedCycle.ts';
    const workerPrivate = 'C:/repo/src/core/routing/workerPrivate.ts';
    const workerDynamic = 'C:/repo/src/core/routing/workerDynamic.ts';
    const safeLog = 'C:/repo/src/core/utils/logSecurity.ts';
    const appRoute = 'C:/repo/src/routes/DiagramRoute.tsx';
    const appOnly = 'C:/repo/src/core/appOnly.ts';
    const missing = 'C:/repo/src/core/routing/missing.ts';
    const vendor = 'C:/repo/node_modules/vendor/index.js';
    const pathfindingOnly = 'C:/repo/src/core/workers/pathfindingOnly.ts';
    const graph = new Map<string, ChunkGraphModuleInfo | null>([
      [displayWorkerId, {
        isEntry: true,
        importedIds: [shared, workerPrivate, safeLog, missing, vendor],
        dynamicallyImportedIds: [workerDynamic],
      }],
      [pathfindingWorkerId, { isEntry: true, importedIds: [workerPrivate, pathfindingOnly] }],
      [appEntryId, { isEntry: true, importedIds: [appOnly], dynamicallyImportedIds: [appRoute] }],
      [appRoute, { importedIds: [shared, safeLog, missing, vendor] }],
      [shared, { importedIds: [sharedCycle] }],
      [sharedCycle, { importedIds: [shared] }],
      [workerPrivate, {}],
      [workerDynamic, {}],
      [safeLog, {}],
      [appOnly, {}],
      [missing, null],
      [vendor, {}],
      [pathfindingOnly, {}],
    ]);

    const result = classifyGraph(graph, id => id === safeLog);

    expect(result.displayWorkerEntryId).toBe(displayWorkerId);
    expect(result.appEntryIds).toEqual([appEntryId]);
    expect([...result.sharedModuleIds].sort()).toEqual([shared, sharedCycle].sort());
    expect(result.workerPrivateModuleIds).toContain(displayWorkerId);
    expect(result.workerPrivateModuleIds).toContain(workerPrivate);
    expect(result.sharedModuleIds).not.toContain(safeLog);
    expect(result.sharedModuleIds).not.toContain(vendor);
    expect(result.sharedModuleIds).not.toContain(missing);
    expect(result.sharedModuleIds).not.toContain(workerDynamic);
    expect(result.workerPrivateModuleIds).not.toContain(workerDynamic);
    expect(result.sharedModuleIds).not.toContain(pathfindingOnly);
  });

  it('fails closed for missing, duplicate, or worker-only entry graphs', () => {
    expect(() => classifyGraph(new Map([
      [appEntryId, { isEntry: true }],
    ]))).toThrow('Expected exactly one display worker entry; found 0');

    const duplicateWorkerId = 'C:/duplicate/src/core/components/shared/baseReactFlowDisplayEdges.worker.ts';
    expect(() => classifyGraph(new Map([
      [displayWorkerId, { isEntry: true }],
      [duplicateWorkerId, { isEntry: true }],
      [appEntryId, { isEntry: true }],
    ]))).toThrow('Expected exactly one display worker entry; found 2');

    expect(() => classifyGraph(new Map([
      [displayWorkerId, { isEntry: true }],
      [pathfindingWorkerId, { isEntry: true }],
    ]))).toThrow('No non-worker application entry found');
  });

  it('clears and rebuilds its active shared set across builds and build failures', () => {
    const classifier = createDisplayRoutingChunkClassifier();
    const firstShared = 'C:/repo/src/core/routing/firstShared.ts';
    const secondShared = 'C:/repo/src/core/routing/secondShared.ts';
    const graphFor = (shared: string) => new Map<string, ChunkGraphModuleInfo | null>([
      [displayWorkerId, { isEntry: true, importedIds: [shared] }],
      [appEntryId, { isEntry: true, importedIds: [shared] }],
      [shared, {}],
    ]);
    const runBuildEnd = (
      graph: Map<string, ChunkGraphModuleInfo | null>,
      error?: Error,
    ) => {
      const hook = classifier.plugin.buildEnd;
      if (typeof hook !== 'function') throw new Error('buildEnd hook missing');
      type BuildEndGraphHook = (
        this: {
          getModuleIds: () => IterableIterator<string>;
          getModuleInfo: (id: string) => ChunkGraphModuleInfo | null;
        },
        buildError?: Error,
      ) => void;
      const graphHook = hook as unknown as BuildEndGraphHook;
      graphHook.call({
        getModuleIds: () => graph.keys(),
        getModuleInfo: (id: string) => graph.get(id) ?? null,
      }, error);
    };

    expect(classifier.plugin.name).toBe('vizly:display-routing-chunk-classifier');
    expect(classifier.plugin.apply).toBe('build');
    expect(classifier.matchesSharedModule(firstShared)).toBe(false);
    runBuildEnd(graphFor(firstShared));
    expect(classifier.matchesSharedModule(firstShared)).toBe(true);
    runBuildEnd(graphFor(secondShared));
    expect(classifier.matchesSharedModule(firstShared)).toBe(false);
    expect(classifier.matchesSharedModule(secondShared)).toBe(true);
    runBuildEnd(graphFor(secondShared), new Error('build failed'));
    expect(classifier.matchesSharedModule(secondShared)).toBe(false);
  });
});

describe('sharedModuleWorkers Vite plugin', () => {
  it.each([
    'consoleCleanup.ts',
    'logSecurity.ts',
    'uiStorageLogging.ts',
  ])('keeps the shared logger %s in a feature-neutral chunk', (fileName) => {
    const id = `C:/repo/src/core/utils/${fileName}`;
    expect(matchesAppSafeLoggingModule(id)).toBe(true);
  });

  it('groups only core theme preset modules', () => {
    expect(matchesThemePresetModule(
      'C:\\repo\\src\\core\\themes\\presets\\DarkTheme.ts',
    )).toBe(true);
    expect(matchesThemePresetModule(
      'C:/repo/src/core/themes/EnhancedThemeManager.ts',
    )).toBe(false);
  });

  it('rewrites the production display worker to an emitted module URL', () => {
    const source = `
const worker = new Worker(new URL('./baseReactFlowDisplayEdges.worker.ts', import.meta.url), {
  type: 'module',
});
`;

    const result = transformSharedModuleWorkerConsumer(
      source,
      'C:\\repo\\src\\core\\components\\shared\\baseReactFlowDisplayWorkerClient.ts',
    );

    expect(result?.code).toContain(
      "import displayWorkerUrl from 'virtual:vizly-display-worker-url';",
    );
    expect(result?.code).toContain("new Worker(displayWorkerUrl, {\n  type: 'module'");
    expect(result?.code).not.toContain('baseReactFlowDisplayEdges.worker.ts');
  });

  it.each([
    'C:/repo/src/core/workers/WorkerPool.ts',
    'C:/repo/src/core/workers/PathfindingWorkerPool.ts',
  ])('rewrites the inline pathfinding worker used by %s', (id) => {
    const result = transformSharedModuleWorkerConsumer(
      "import PathfindingWorker from './pathfinding.worker?worker&inline';",
      id,
    );

    expect(result?.code).toBe(
      "import PathfindingWorker from 'virtual:vizly-pathfinding-worker-constructor';",
    );
  });

  it('leaves unrelated modules untouched', () => {
    expect(transformSharedModuleWorkerConsumer('export const value = 1;', '/src/value.ts')).toBeNull();
  });

  it('can keep the display worker on Vite native bundling without changing pathfinding', () => {
    const displaySource = `
const worker = new Worker(new URL('./baseReactFlowDisplayEdges.worker.ts', import.meta.url), {
  type: 'module',
});
`;
    expect(transformSharedModuleWorkerConsumer(
      displaySource,
      'C:/repo/src/core/components/shared/baseReactFlowDisplayWorkerClient.ts',
      { displayWorker: false },
    )).toBeNull();

    expect(transformSharedModuleWorkerConsumer(
      "import PathfindingWorker from './pathfinding.worker?worker&inline';",
      'C:/repo/src/core/workers/WorkerPool.ts',
      { displayWorker: false },
    )?.code).toContain('virtual:vizly-pathfinding-worker-constructor');
  });

  it('keeps measured repair inside the display worker repair protocol', () => {
    const hookPath = resolve(
      process.cwd(),
      'src/core/components/shared/useBaseReactFlowDisplayRouting.ts',
    );
    const workerPath = resolve(
      process.cwd(),
      'src/core/components/shared/baseReactFlowDisplayEdges.worker.ts',
    );
    const hookSource = readFileSync(hookPath, 'utf8');
    const workerSource = readFileSync(workerPath, 'utf8');

    expect(hookSource).toContain(
      'repairBaseReactFlowDisplayEdgesInWorker',
    );
    expect(hookSource).not.toContain('baseReactFlowDisplayMeasuredRepair');
    expect(hookSource).not.toContain(
      "from './baseReactFlowDisplayEdges';",
    );
    expect(workerSource).toContain(
      "from './baseReactFlowDisplayMeasuredRepair';",
    );
    expect(workerSource).toContain("request.operation === 'repair'");
  });

  it('fails closed when a guarded worker source changes or is duplicated', () => {
    const displayId = '/repo/src/core/components/shared/baseReactFlowDisplayWorkerClient.ts';
    const constructor =
      "new Worker(new URL('./baseReactFlowDisplayEdges.worker.ts', import.meta.url),";

    expect(() => transformSharedModuleWorkerConsumer('export {};', displayId)).toThrow(
      'Expected exactly one display-worker constructor; found 0',
    );
    expect(() => transformSharedModuleWorkerConsumer(
      `${constructor}\n${constructor}`,
      displayId,
    )).toThrow('Expected exactly one display-worker constructor; found multiple');
  });

  it('emits content-addressed module-worker adapters', () => {
    expect(createSharedDisplayWorkerUrlModule('displayRef')).toBe(
      'export default import.meta.ROLLUP_FILE_URL_displayRef;',
    );

    const constructorModule = createSharedPathfindingWorkerConstructorModule('pathRef');
    expect(constructorModule).toContain('import.meta.ROLLUP_FILE_URL_pathRef');
    expect(constructorModule).toContain('class PathfindingWorker extends Worker');
    expect(constructorModule).toContain("type: 'module'");
  });

  it('is restricted to production builds', () => {
    const plugin = sharedModuleWorkersPlugin('C:/repo');

    expect(plugin.name).toBe('vizly:shared-module-workers');
    expect(plugin.apply).toBe('build');
    expect(plugin.enforce).toBe('pre');
  });
});
