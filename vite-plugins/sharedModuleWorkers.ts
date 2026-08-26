import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const DISPLAY_WORKER_VIRTUAL_ID = 'virtual:vizly-display-worker-url';
const RESOLVED_DISPLAY_WORKER_VIRTUAL_ID = `\0${DISPLAY_WORKER_VIRTUAL_ID}`;

const DISPLAY_WORKER_CLIENT_SUFFIX = '/src/core/components/shared/baseReactFlowDisplayWorkerClient.ts';

const DISPLAY_WORKER_CONSTRUCTOR =
  "new Worker(new URL('./baseReactFlowDisplayEdges.worker.ts', import.meta.url),";

export type SharedModuleWorkersOptions = {
  displayWorker?: boolean;
};

const resolveSharedModuleWorkerOptions = (
  options: SharedModuleWorkersOptions = {},
) => ({
  displayWorker: options.displayWorker !== false,
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

  return null;
};

export const createSharedDisplayWorkerUrlModule = (referenceId: string): string => (
  `export default import.meta.ROLLUP_FILE_URL_${referenceId};`
);

/**
 * Emits the Canvas Routing Session Worker as a module entry in the main
 * production graph.
 *
 * The source constructors remain unchanged for `vite dev`, including the
 * native Worker behavior. Production uses an external module entry, allowing
 * the browser and Rolldown to share routing chunks instead of rebuilding them
 * in each realm.
 */
export const sharedModuleWorkersPlugin = (
  projectRoot: string,
  options: SharedModuleWorkersOptions = {},
): Plugin => {
  const resolvedOptions = resolveSharedModuleWorkerOptions(options);
  let displayWorkerReference: string | undefined;

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
    },
    resolveId(id) {
      if (id === DISPLAY_WORKER_VIRTUAL_ID) return RESOLVED_DISPLAY_WORKER_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_DISPLAY_WORKER_VIRTUAL_ID) {
        if (!displayWorkerReference) {
          throw new Error('[vizly:shared-module-workers] Display worker was not emitted');
        }
        return createSharedDisplayWorkerUrlModule(displayWorkerReference);
      }
      return null;
    },
    transform(code, id) {
      return transformSharedModuleWorkerConsumer(code, id, resolvedOptions);
    },
  };
};
