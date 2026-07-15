import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const DISPLAY_WORKER_VIRTUAL_ID = 'virtual:vizly-display-worker-url';
const PATHFINDING_WORKER_VIRTUAL_ID = 'virtual:vizly-pathfinding-worker-constructor';
const RESOLVED_DISPLAY_WORKER_VIRTUAL_ID = `\0${DISPLAY_WORKER_VIRTUAL_ID}`;
const RESOLVED_PATHFINDING_WORKER_VIRTUAL_ID = `\0${PATHFINDING_WORKER_VIRTUAL_ID}`;

const DISPLAY_WORKER_CLIENT_SUFFIX = '/src/core/components/shared/baseReactFlowDisplayWorkerClient.ts';
const PATHFINDING_WORKER_CONSUMER_SUFFIXES = [
  '/src/core/workers/WorkerPool.ts',
  '/src/core/workers/PathfindingWorkerPool.ts',
] as const;

const DISPLAY_WORKER_CONSTRUCTOR =
  "new Worker(new URL('./baseReactFlowDisplayEdges.worker.ts', import.meta.url),";
const PATHFINDING_INLINE_IMPORT =
  "import PathfindingWorker from './pathfinding.worker?worker&inline';";

export type SharedModuleWorkersOptions = {
  displayWorker?: boolean;
  pathfindingWorker?: boolean;
};

const resolveSharedModuleWorkerOptions = (
  options: SharedModuleWorkersOptions = {},
) => ({
  displayWorker: options.displayWorker !== false,
  pathfindingWorker: options.pathfindingWorker !== false,
});

const normalizeModuleId = (id: string) => id.replace(/\\/g, '/');

const replaceExactlyOnce = (
  code: string,
  needle: string,
  replacement: string,
  label: string,
): string => {
  const firstIndex = code.indexOf(needle);
  const secondIndex = firstIndex < 0 ? -1 : code.indexOf(needle, firstIndex + needle.length);
  if (firstIndex < 0 || secondIndex >= 0) {
    throw new Error(
      `[vizly:shared-module-workers] Expected exactly one ${label}; found ${
        firstIndex < 0 ? 0 : 'multiple'
      }`,
    );
  }
  return `${code.slice(0, firstIndex)}${replacement}${code.slice(firstIndex + needle.length)}`;
};

/**
 * Production workers normally run in a separate Vite worker build. That makes
 * Rolldown emit a second copy of every routing module also used by the client.
 * This transform keeps development on Vite's native worker path, while the
 * production plugin emits the worker as another entry in the client build so
 * both realms can import the same content-addressed chunks.
 */
export const transformSharedModuleWorkerConsumer = (
  code: string,
  id: string,
  options: SharedModuleWorkersOptions = {},
): { code: string; map: null } | null => {
  const normalizedId = normalizeModuleId(id);
  const resolvedOptions = resolveSharedModuleWorkerOptions(options);
  if (resolvedOptions.displayWorker && normalizedId.endsWith(DISPLAY_WORKER_CLIENT_SUFFIX)) {
    const transformed = replaceExactlyOnce(
      code,
      DISPLAY_WORKER_CONSTRUCTOR,
      'new Worker(displayWorkerUrl,',
      'display-worker constructor',
    );
    return {
      code: `import displayWorkerUrl from '${DISPLAY_WORKER_VIRTUAL_ID}';\n${transformed}`,
      map: null,
    };
  }

  if (
    resolvedOptions.pathfindingWorker
    && PATHFINDING_WORKER_CONSUMER_SUFFIXES.some(suffix => normalizedId.endsWith(suffix))
  ) {
    return {
      code: replaceExactlyOnce(
        code,
        PATHFINDING_INLINE_IMPORT,
        `import PathfindingWorker from '${PATHFINDING_WORKER_VIRTUAL_ID}';`,
        'inline pathfinding-worker import',
      ),
      map: null,
    };
  }

  return null;
};

export const createSharedDisplayWorkerUrlModule = (referenceId: string): string => (
  `export default import.meta.ROLLUP_FILE_URL_${referenceId};`
);

export const createSharedPathfindingWorkerConstructorModule = (referenceId: string): string => `
const workerUrl = import.meta.ROLLUP_FILE_URL_${referenceId};

export default class PathfindingWorker extends Worker {
  constructor(options = {}) {
    super(workerUrl, { ...options, type: 'module' });
  }
}
`;

/**
 * Emits routing workers as module entries in the main production graph.
 *
 * The source constructors remain unchanged for `vite dev`, including the
 * inline pathfinding-worker behavior. Only production uses external module
 * entries, allowing the browser and Rolldown to share routing chunks instead
 * of embedding or rebuilding them in each worker environment.
 */
export const sharedModuleWorkersPlugin = (
  projectRoot: string,
  options: SharedModuleWorkersOptions = {},
): Plugin => {
  const resolvedOptions = resolveSharedModuleWorkerOptions(options);
  let displayWorkerReference: string | undefined;
  let pathfindingWorkerReference: string | undefined;

  return {
    name: 'vizly:shared-module-workers',
    apply: 'build',
    enforce: 'pre',
    buildStart() {
      if (resolvedOptions.displayWorker) {
        displayWorkerReference = this.emitFile({
          type: 'chunk',
          id: resolve(
            projectRoot,
            'src/core/components/shared/baseReactFlowDisplayEdges.worker.ts',
          ),
          name: 'baseReactFlowDisplayEdges.worker',
        });
      }
      if (resolvedOptions.pathfindingWorker) {
        pathfindingWorkerReference = this.emitFile({
          type: 'chunk',
          id: resolve(projectRoot, 'src/core/workers/pathfinding.worker.ts'),
          name: 'pathfinding.worker',
        });
      }
    },
    resolveId(id) {
      if (id === DISPLAY_WORKER_VIRTUAL_ID) return RESOLVED_DISPLAY_WORKER_VIRTUAL_ID;
      if (id === PATHFINDING_WORKER_VIRTUAL_ID) return RESOLVED_PATHFINDING_WORKER_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_DISPLAY_WORKER_VIRTUAL_ID) {
        if (!displayWorkerReference) {
          throw new Error('[vizly:shared-module-workers] Display worker was not emitted');
        }
        return createSharedDisplayWorkerUrlModule(displayWorkerReference);
      }
      if (id === RESOLVED_PATHFINDING_WORKER_VIRTUAL_ID) {
        if (!pathfindingWorkerReference) {
          throw new Error('[vizly:shared-module-workers] Pathfinding worker was not emitted');
        }
        return createSharedPathfindingWorkerConstructorModule(pathfindingWorkerReference);
      }
      return null;
    },
    transform(code, id) {
      return transformSharedModuleWorkerConsumer(code, id, resolvedOptions);
    },
  };
};
