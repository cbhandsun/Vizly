import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createSharedDisplayWorkerUrlModule,
  sharedModuleWorkersPlugin,
  transformSharedModuleWorkerConsumer,
} from '../../../../vite-plugins/sharedModuleWorkers';
import {
  matchesAppSafeLoggingModule,
  matchesDisplayRoutingNeutralModule,
  matchesFlowchartDesignerStartupModule,
  matchesFlowchartDesignerMicroModule,
  matchesFlowchartRuntimeModule,
  productionChunkFileNames,
} from '../../../../vite-plugins/buildChunkGroups';
import { minifyLocaleJsonAsset } from '../../../../vite-plugins/minifyLocaleAssets';
import {
  classifyDisplayRoutingChunkGraph,
  createDisplayRoutingChunkClassifier,
  type ChunkGraphModuleInfo,
} from '../../../../vite-plugins/displayRoutingChunkClassifier';

const displayWorkerId = 'C:\\repo\\src\\core\\components\\shared\\baseReactFlowDisplayEdges.worker.ts';
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
    const appRoute = 'C:/repo/src/core/components/diagrams/FlowchartDesigner.tsx';
    const appOnly = 'C:/repo/src/core/appOnly.ts';
    const initialShared = 'C:/repo/src/core/routing/initialShared.ts';
    const lightweightShared = 'C:/repo/src/core/routing/lightweightShared.ts';
    const lightweightRoute = 'C:/repo/src/pages/DiagramManagementPage.tsx';
    const missing = 'C:/repo/src/core/routing/missing.ts';
    const vendor = 'C:/repo/node_modules/vendor/index.js';
    const graph = new Map<string, ChunkGraphModuleInfo | null>([
      [displayWorkerId, {
        isEntry: true,
        importedIds: [shared, initialShared, lightweightShared, workerPrivate, safeLog, missing, vendor],
        dynamicallyImportedIds: [workerDynamic],
      }],
      [appEntryId, {
        isEntry: true,
        importedIds: [appOnly, initialShared],
        dynamicallyImportedIds: [appRoute, lightweightRoute],
      }],
      [appRoute, { importedIds: [shared, safeLog, missing, vendor] }],
      [lightweightRoute, { importedIds: [lightweightShared] }],
      [shared, { importedIds: [sharedCycle] }],
      [sharedCycle, { importedIds: [shared] }],
      [workerPrivate, {}],
      [workerDynamic, {}],
      [safeLog, {}],
      [appOnly, {}],
      [initialShared, {}],
      [lightweightShared, {}],
      [missing, null],
      [vendor, {}],
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
    expect(result.sharedModuleIds).not.toContain(initialShared);
    expect(result.sharedModuleIds).not.toContain(lightweightShared);
    expect(result.workerPrivateModuleIds).not.toContain(workerDynamic);
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
    ]))).toThrow('No non-worker application entry found');
  });

  it('clears and rebuilds its active shared set across builds and build failures', () => {
    const classifier = createDisplayRoutingChunkClassifier();
    const firstShared = 'C:/repo/src/core/routing/firstShared.ts';
    const secondShared = 'C:/repo/src/core/routing/secondShared.ts';
    const lazyRoute = 'C:/repo/src/core/components/diagrams/FlowchartDesigner.tsx';
    const graphFor = (shared: string) => new Map<string, ChunkGraphModuleInfo | null>([
      [displayWorkerId, { isEntry: true, importedIds: [shared] }],
      [appEntryId, { isEntry: true, dynamicallyImportedIds: [lazyRoute] }],
      [lazyRoute, { importedIds: [shared] }],
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
  it('keeps diagnostic routing chunk names while compacting ordinary lazy chunks', () => {
    expect(productionChunkFileNames({ name: 'baseReactFlowDisplayEdges.worker' }))
      .toBe('assets/[name]-[hash].js');
    expect(productionChunkFileNames({ name: 'display-routing-shared' }))
      .toBe('assets/[name]-[hash].js');
    expect(productionChunkFileNames({ name: 'FlowchartDesigner' }))
      .toBe('assets/c-[hash].js');
  });

  it.each([
    'consoleCleanup.ts',
    'logSecurity.ts',
    'uiStorageLogging.ts',
  ])('keeps the shared logger %s in a feature-neutral chunk', (fileName) => {
    const id = `C:/repo/src/core/utils/${fileName}`;
    expect(matchesAppSafeLoggingModule(id)).toBe(true);
  });

  it('keeps shared diagram configuration out of the heavy routing chunk', () => {
    for (const id of [
      'C:\\repo\\src\\core\\config\\DiagramConfig.ts?worker_file',
      'C:/repo/src/core/config/DiagramConfigBoundary.ts',
      'C:/repo/src/core/config/DiagramConfigDefaults.ts',
      'C:/repo/src/core/config/DiagramConfigManager.ts',
      'C:/repo/src/core/routing/routingVersion.ts',
      'C:/repo/src/core/routing/utils/handleUtils.ts',
      'C:/repo/src/core/types/flow.ts',
      'C:/repo/src/core/utils/boundedResponse.ts',
      'C:/repo/src/core/components/shared/baseReactFlowAbsolutePositions.ts',
      'C:/repo/src/core/components/shared/baseReactFlowLayoutEdgeRoutingData.ts',
      'C:/repo/src/core/strategies/layoutLogging.ts',
    ]) {
      expect(matchesDisplayRoutingNeutralModule(id)).toBe(true);
    }
    expect(matchesDisplayRoutingNeutralModule(
      'C:/repo/src/core/components/shared/baseReactFlowDisplayEdges.ts',
    )).toBe(false);
  });

  it('co-loads only the curated synchronous flowchart runtime modules', () => {
    expect(matchesFlowchartRuntimeModule(
      'C:\\repo\\src\\core\\components\\diagrams\\ShapePreview.tsx',
    )).toBe(true);
    expect(matchesFlowchartRuntimeModule(
      'C:/repo/src/core/utils/flowchartClipboard.ts',
    )).toBe(true);
    expect(matchesFlowchartRuntimeModule(
      'C:/repo/src/core/components/custom-nodes/FlowchartNode.tsx',
    )).toBe(false);
    expect(matchesFlowchartRuntimeModule(
      'C:/repo/src/core/utils/__tests__/flowchartClipboard.test.ts',
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

  it('leaves unrelated modules untouched', () => {
    expect(transformSharedModuleWorkerConsumer('export const value = 1;', '/src/value.ts')).toBeNull();
  });

  it('can keep the display worker on Vite native bundling', () => {
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
  });

  it('keeps measured repair inside the display worker implementation', () => {
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

    expect(hookSource).not.toContain(
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

  it('starts the display worker from the canvas lifecycle instead of module evaluation', () => {
    const clientSource = readFileSync(resolve(
      process.cwd(),
      'src/core/components/shared/baseReactFlowDisplayWorkerClient.ts',
    ), 'utf8');

    expect(clientSource).not.toContain('eagerDisplayWorkerRef');
    expect(clientSource).toContain(
      'prewarmBaseReactFlowDisplayWorker =',
    );
  });

  it('recognizes only the measured diagram editor startup set', () => {
    expect(matchesFlowchartDesignerStartupModule(
      'C:/repo/src/core/components/diagrams/NodeTemplatePanel.tsx',
    )).toBe(true);
    expect(matchesFlowchartDesignerStartupModule(
      'C:/repo/src/pages/DiagramManagementPage.tsx',
    )).toBe(false);
  });

  it('recognizes the bounded diagram micro-module set', () => {
    expect(matchesFlowchartDesignerMicroModule(
      'C:/repo/src/core/components/diagrams/commentPageScope.ts',
    )).toBe(true);
    expect(matchesFlowchartDesignerMicroModule(
      'C:/repo/src/core/components/diagrams/pageCanvasMetadata.ts',
    )).toBe(true);
    expect(matchesFlowchartDesignerMicroModule(
      'C:/repo/src/core/components/diagrams/FlowchartDesigner.tsx',
    )).toBe(false);
    expect(matchesFlowchartDesignerMicroModule(
      'C:/repo/src/core/utils/boundedResponse.ts',
    )).toBe(false);
  });

  it('minifies emitted locale JSON without touching unrelated assets', () => {
    expect(minifyLocaleJsonAsset('assets/zh-hash.json', '{\n  "a": 1\n}'))
      .toBe('{"a":1}');
    const unrelated = new Uint8Array([1, 2, 3]);
    expect(minifyLocaleJsonAsset('assets/route-hash.json', unrelated)).toBe(unrelated);
  });

  it.each([
    ['', 'Invalid locale JSON'],
    ['[]', 'Locale root must be an object'],
    ['{"broken":', 'Invalid locale JSON'],
  ])('rejects malformed locale asset input %j', (source, message) => {
    expect(() => minifyLocaleJsonAsset('assets/en-hash.json', source)).toThrow(message);
  });

  it('rejects an oversized emitted locale asset', () => {
    const oversized = `{"value":"${'x'.repeat(2 * 1024 * 1024)}"}`;
    expect(() => minifyLocaleJsonAsset('assets/zh-hash.json', oversized))
      .toThrow('Locale asset exceeds 2 MiB');
  });

  it('keeps diagram hooks on the Canvas Routing Session without a legacy coordinator', () => {
    const layoutHookSource = readFileSync(resolve(
      process.cwd(),
      'src/core/components/diagrams/hooks/useLayoutRoutingTransaction.ts',
    ), 'utf8');
    const systemSyncSource = readFileSync(resolve(
      process.cwd(),
      'src/core/components/diagrams/hooks/useDesignerSystemSync.ts',
    ), 'utf8');
    const initialLoadSource = readFileSync(resolve(
      process.cwd(),
      'src/core/components/diagrams/hooks/useDesignerInitialDiagramLoad.ts',
    ), 'utf8');
    const autoRoutingSource = readFileSync(resolve(
      process.cwd(),
      'src/core/components/diagrams/hooks/useAutoRouting.ts',
    ), 'utf8');

    expect(layoutHookSource).toContain("import('../../shared/baseReactFlowLayoutRoutingTransaction')");
    expect(layoutHookSource).not.toContain("from '../../shared/baseReactFlowLayoutRoutingTransaction'");
    for (const source of [layoutHookSource, systemSyncSource, initialLoadSource, autoRoutingSource]) {
      expect(source).not.toContain('edgeRoutingCoordinatorRuntime');
      expect(source).not.toContain('EdgeRoutingCoordinator');
    }
  });

  it('loads only the active locale on the initial application path', () => {
    const i18nSource = readFileSync(resolve(process.cwd(), 'src/i18n.ts'), 'utf8');
    const mainSource = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');

    expect(i18nSource).toContain("import enLocaleUrl from './locales/en.json?url'");
    expect(i18nSource).toContain("import zhLocaleUrl from './locales/zh.json?url'");
    expect(i18nSource).not.toContain("import en from './locales/en.json'");
    expect(i18nSource).not.toContain("import zh from './locales/zh.json'");
    expect(i18nSource).not.toContain("import('./locales/en.json')");
    expect(i18nSource).not.toContain("import('./locales/zh.json')");
    expect(i18nSource).toContain('loadLocaleResource(enLocaleUrl)');
    expect(i18nSource).toContain('loadLocaleResource(zhLocaleUrl)');
    expect(i18nSource).toContain('fallbackLng: false');
    expect(i18nSource).toContain('export const i18nReady: Promise<void>');
    expect(mainSource).toContain("import { i18nReady } from './i18n'");
    expect(mainSource).toContain('void i18nReady.then(() =>');
  });

  it('keeps theme presets behind the asynchronous preset loader', () => {
    const themeIndexSource = readFileSync(resolve(process.cwd(), 'src/core/themes/index.ts'), 'utf8');
    const presetLoaderSource = readFileSync(
      resolve(process.cwd(), 'src/core/themes/ThemePresetLoader.ts'),
      'utf8',
    );

    expect(themeIndexSource).not.toContain("from './presets/");
    expect(presetLoaderSource).toContain("import('./presets/LightTheme')");
    expect(presetLoaderSource).toContain("import('./presets/DarkTheme')");
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
  });

  it('is restricted to production builds', () => {
    const plugin = sharedModuleWorkersPlugin('C:/repo');

    expect(plugin.name).toBe('vizly:shared-module-workers');
    expect(plugin.apply).toBe('build');
    expect(plugin.enforce).toBe('pre');
  });
});
