import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { minify, type Plugin } from 'vite';

const ELK_WORKER_VIRTUAL_ID = 'virtual:vizly-elk-engine-worker-url';
const RESOLVED_ELK_WORKER_VIRTUAL_ID = `\0${ELK_WORKER_VIRTUAL_ID}`;
const ELK_WORKER_DEV_URL = '/@vizly/elk-engine-worker.js';
const MAX_ELK_WORKER_BYTES = 1_500 * 1024;
const ELK_WORKER_MINIFY_OPTIONS = {
  compress: { toplevel: true },
  mangle: { toplevel: true },
} as const;

export const createElkWorkerUrlModule = (urlExpression: string): string => (
  `export default ${urlExpression};`
);

export const minifyElkWorkerSource = async (
  source: string,
  filename: string,
): Promise<string> => {
  // Rolldown accepts the Terser-compatible lowercase `toplevel` mangle key,
  // while its current public declaration exposes only the camel-case variant.
  const result = await minify(
    filename,
    source,
    ELK_WORKER_MINIFY_OPTIONS as NonNullable<Parameters<typeof minify>[2]>,
  );
  const minified = result.code.trim();
  if (!minified) {
    throw new Error('[vizly:elk-worker-asset] ELK minifier returned empty output');
  }
  const byteLength = Buffer.byteLength(minified, 'utf8');
  if (byteLength > MAX_ELK_WORKER_BYTES) {
    throw new Error(
      `[vizly:elk-worker-asset] Minified ELK worker is ${byteLength} bytes; maximum is ${MAX_ELK_WORKER_BYTES}`,
    );
  }
  return minified;
};

export const elkWorkerAssetPlugin = (projectRoot: string): Plugin => {
  const elkWorkerPath = resolve(projectRoot, 'node_modules/elkjs/lib/elk-worker.min.js');
  let buildAssetReference: string | undefined;
  let minifiedSourcePromise: Promise<string> | undefined;

  const loadMinifiedSource = (): Promise<string> => {
    minifiedSourcePromise ??= readFile(elkWorkerPath, 'utf8')
      .then((source) => minifyElkWorkerSource(source, elkWorkerPath));
    return minifiedSourcePromise;
  };

  return {
    name: 'vizly:elk-worker-asset',
    enforce: 'pre',
    async buildStart() {
      if (this.environment.config.command !== 'build') return;
      buildAssetReference = this.emitFile({
        type: 'asset',
        name: 'elk-engine-worker.js',
        source: await loadMinifiedSource(),
      });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== ELK_WORKER_DEV_URL) {
          next();
          return;
        }
        try {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(await loadMinifiedSource());
        } catch (error) {
          next(error instanceof Error ? error : new Error('Failed to prepare ELK worker asset'));
        }
      });
    },
    resolveId(id) {
      return id === ELK_WORKER_VIRTUAL_ID ? RESOLVED_ELK_WORKER_VIRTUAL_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ELK_WORKER_VIRTUAL_ID) return null;
      if (this.environment.config.command !== 'build') {
        return createElkWorkerUrlModule(JSON.stringify(ELK_WORKER_DEV_URL));
      }
      if (!buildAssetReference) {
        throw new Error('[vizly:elk-worker-asset] ELK build asset was not emitted');
      }
      return createElkWorkerUrlModule(`import.meta.ROLLUP_FILE_URL_${buildAssetReference}`);
    },
  };
};
