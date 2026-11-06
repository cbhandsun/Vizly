import type { Plugin } from 'vite';

/**
 * Route entry modules whose static-import closure the application loads as
 * soon as it starts on that route (see `src/app/appRouteLoaders.ts`). The
 * entry only requests these after `index.js` and its preloaded dependencies
 * have downloaded and executed, which serializes a second network wave behind
 * the first one. A tiny classic script (`startup-route-preload.v1.js`) reads
 * the build-generated list below and starts those downloads in parallel with
 * the entry, only for the route actually being opened.
 */
export const ROUTE_PRELOAD_ENTRIES: Readonly<Record<string, readonly RegExp[]>> = Object.freeze({
  diagram: [
    /\/src\/app\/AntdRouteShell\.tsx$/u,
    /\/src\/app\/DiagramViewerRoute\.tsx$/u,
    /\/@vizly\/core\/dist\/react\.js$/u,
  ],
  manage: [
    /\/src\/app\/AntdRouteShell\.tsx$/u,
    /\/src\/pages\/DiagramManagementPage(?:\/index)?\.tsx$/u,
  ],
});

export const ROUTE_PRELOAD_META_NAME = 'vizly-route-preloads';
const MAX_ROUTE_PRELOADS = 64;
const ASSET_FILE = /^assets\/[A-Za-z0-9_.-]+\.js$/u;

export type RoutePreloadChunk = Readonly<{
  type: 'chunk';
  fileName: string;
  isEntry: boolean;
  facadeModuleId: string | null;
  imports: readonly string[];
}>;

type BundleItem = RoutePreloadChunk | Readonly<{ type: 'asset'; fileName: string }>;

const staticClosure = (
  roots: readonly RoutePreloadChunk[],
  chunks: ReadonlyMap<string, RoutePreloadChunk>,
): Set<string> => {
  const seen = new Set<string>();
  const pending = roots.map(chunk => chunk.fileName);
  while (pending.length > 0) {
    const fileName = pending.pop()!;
    if (seen.has(fileName)) continue;
    const chunk = chunks.get(fileName);
    if (!chunk) continue;
    seen.add(fileName);
    pending.push(...chunk.imports);
  }
  return seen;
};

/**
 * Computes, per route, the JavaScript chunks the route will import that are
 * not already downloaded by the entry's own module preloads. Missing route
 * entries are ignored so a renamed page degrades to no hint, never to a wrong
 * one; the runtime prewarm remains the source of truth.
 */
export const computeRoutePreloads = (
  bundle: Readonly<Record<string, BundleItem>>,
  entries: Readonly<Record<string, readonly RegExp[]>> = ROUTE_PRELOAD_ENTRIES,
): Record<string, string[]> => {
  const chunks = new Map<string, RoutePreloadChunk>();
  for (const item of Object.values(bundle)) {
    if (item.type === 'chunk') chunks.set(item.fileName, item);
  }
  const entryChunks = [...chunks.values()].filter(chunk => chunk.isEntry);
  const alreadyLoaded = staticClosure(entryChunks, chunks);
  const result: Record<string, string[]> = {};
  for (const [route, patterns] of Object.entries(entries)) {
    const roots = patterns.flatMap(pattern => [...chunks.values()]
      .filter(chunk => typeof chunk.facadeModuleId === 'string'
        && pattern.test(chunk.facadeModuleId.replaceAll('\\', '/'))));
    const files = [...staticClosure(roots, chunks)]
      .filter(fileName => !alreadyLoaded.has(fileName) && ASSET_FILE.test(fileName))
      .sort();
    if (files.length > MAX_ROUTE_PRELOADS) throw new Error(`Too many route preloads for ${route}`);
    if (files.length > 0) result[route] = files.map(fileName => `/${fileName}`);
  }
  return result;
};

/** `route=/assets/a.js,/assets/b.js;route2=...` — asset names need no escaping. */
export const serializeRoutePreloads = (routes: Readonly<Record<string, readonly string[]>>): string => (
  Object.entries(routes)
    .filter(([route, files]) => /^[a-z0-9-]+$/u.test(route) && files.length > 0)
    .map(([route, files]) => `${route}=${files.join(',')}`)
    .join(';')
);

export const addRoutePreloadMeta = (html: string, content: string): string => {
  if (!content) return html;
  if (html.includes(`name="${ROUTE_PRELOAD_META_NAME}"`)) throw new Error('Route preload metadata already present');
  const tag = `<meta name="${ROUTE_PRELOAD_META_NAME}" content="${content}">`;
  const anchor = html.indexOf('<script src="/assets/startup-resource-guard.v1.js"></script>');
  if (anchor < 0) throw new Error('Expected one independent startup guard');
  return `${html.slice(0, anchor)}${tag}\n    ${html.slice(anchor)}`;
};

export const routeModulePreloads = (): Plugin => ({
  name: 'vizly-route-module-preloads',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html, context) => context.bundle
      ? addRoutePreloadMeta(html, serializeRoutePreloads(
        computeRoutePreloads(context.bundle as unknown as Record<string, BundleItem>),
      ))
      : html,
  },
});
