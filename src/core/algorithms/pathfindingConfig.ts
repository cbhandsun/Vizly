import type { PathfindingConfig } from './pathfindingTypes';
import { RoutingStrategySelector } from './RoutingStrategySelector';
import { VisibilityGraphCache } from './VisibilityGraphCache';

let globalPathfindingConfig: PathfindingConfig = {
  useVisibilityGraph: false,
  visibilityGraphMinObstacles: 6,
  enableSmartStrategy: true,
  strategySelector: new RoutingStrategySelector(),
  vgCacheManager: new VisibilityGraphCache({ maxSize: 10 }),
};

export const setPathfindingConfig = (config: Partial<PathfindingConfig>): void => {
  const next = { ...globalPathfindingConfig };
  if (typeof config.useVisibilityGraph === 'boolean') next.useVisibilityGraph = config.useVisibilityGraph;
  if (typeof config.visibilityGraphMinObstacles === 'number'
    && Number.isFinite(config.visibilityGraphMinObstacles)) {
    next.visibilityGraphMinObstacles = Math.min(
      100_000,
      Math.max(0, Math.floor(config.visibilityGraphMinObstacles)),
    );
  }
  if (config.visibilityGraphCache && typeof config.visibilityGraphCache === 'object') {
    next.visibilityGraphCache = config.visibilityGraphCache;
  }
  if (typeof config.enableSmartStrategy === 'boolean') next.enableSmartStrategy = config.enableSmartStrategy;
  if (config.strategySelector instanceof RoutingStrategySelector) next.strategySelector = config.strategySelector;
  if (config.vgCacheManager instanceof VisibilityGraphCache) next.vgCacheManager = config.vgCacheManager;
  if (typeof config.enableThetaStar === 'boolean') next.enableThetaStar = config.enableThetaStar;
  globalPathfindingConfig = next;
};

export const getPathfindingConfig = (): PathfindingConfig => ({ ...globalPathfindingConfig });
