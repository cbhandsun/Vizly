import {
  GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_PREFETCH_LOADERS,
  type GeneratedBaseReactFlowPrecompiledRouteDescriptor,
} from './generated/baseReactFlowPrecompiledRouteLoaders';

const MAX_PRECOMPILED_ROUTE_PREFETCH_ENTRIES = 8;
const MAX_PRESET_ID_LENGTH = 200;

export type BaseReactFlowPrecompiledRoutePrefetchRegistry = Readonly<Record<
  string,
  GeneratedBaseReactFlowPrecompiledRouteDescriptor
>>;

type BaseReactFlowPrecompiledRoutePrefetchCache = Map<string, Promise<boolean>>;

const precompiledRoutePrefetchCache: BaseReactFlowPrecompiledRoutePrefetchCache = new Map();

const isSafePresetId = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= MAX_PRESET_ID_LENGTH
);

const readOwnPrefetchDescriptor = (
  registry: BaseReactFlowPrecompiledRoutePrefetchRegistry,
  presetId: string,
): GeneratedBaseReactFlowPrecompiledRouteDescriptor | null => (
  Object.prototype.hasOwnProperty.call(registry, presetId)
    ? registry[presetId] ?? null
    : null
);

const rememberPrefetch = (
  cache: BaseReactFlowPrecompiledRoutePrefetchCache,
  presetId: string,
  promise: Promise<boolean>,
): void => {
  if (cache.has(presetId)) cache.delete(presetId);
  cache.set(presetId, promise);
  while (cache.size > MAX_PRECOMPILED_ROUTE_PREFETCH_ENTRIES) {
    const oldestPresetId = cache.keys().next().value;
    if (typeof oldestPresetId !== 'string') break;
    cache.delete(oldestPresetId);
  }
};

export const prefetchBaseReactFlowPrecompiledRouteFromRegistry = (
  presetId: unknown,
  registry: BaseReactFlowPrecompiledRoutePrefetchRegistry,
  cache: BaseReactFlowPrecompiledRoutePrefetchCache = new Map(),
): Promise<boolean> => {
  if (!isSafePresetId(presetId)) return Promise.resolve(false);
  const descriptor = readOwnPrefetchDescriptor(registry, presetId);
  if (!descriptor || descriptor.presetId !== presetId) return Promise.resolve(false);
  const cached = cache.get(presetId);
  if (cached) return cached;
  const promise = Promise.resolve()
    .then(() => descriptor.load())
    .then(
      () => true,
      () => {
        cache.delete(presetId);
        return false;
      },
    );
  rememberPrefetch(cache, presetId, promise);
  return promise;
};

/**
 * Starts downloading a known static route artifact. This does not validate or
 * accept the artifact; the measured-geometry lookup and Worker hard gate remain
 * the only path to a visible route.
 */
export const prefetchBaseReactFlowPrecompiledRoute = (
  presetId: unknown,
): Promise<boolean> => prefetchBaseReactFlowPrecompiledRouteFromRegistry(
  presetId,
  GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_PREFETCH_LOADERS,
  precompiledRoutePrefetchCache,
);
