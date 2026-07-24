import type { UnifiedRoutingConfig } from '../../types/routing';
import { AStarPathfinder } from './AStarPathfinder';
import { GridBuilder } from './GridBuilder';
import { TrunkCalculator } from './TrunkCalculator';
import { VisibilityGraphRouter } from './VisibilityGraphRouter';
import { PathPostProcessor } from '../postprocessing/PathPostProcessor';
import { BusDetector } from '../preprocessing/BusDetector';
import { ObstacleAnalyzer } from '../preprocessing/ObstacleAnalyzer';
import { PortSelector } from '../preprocessing/PortSelector';

export interface WorkerRoutingModules {
  gridBuilder: GridBuilder;
  astar: AStarPathfinder;
  analyzer: ObstacleAnalyzer;
  postProcessor: PathPostProcessor;
  trunkCalculator: TrunkCalculator;
  vgRouter: VisibilityGraphRouter;
  busDetector: BusDetector;
  portSelector: PortSelector;
}

interface WorkerRoutingModuleCache {
  config: UnifiedRoutingConfig;
  signature: string | null;
  modules: WorkerRoutingModules;
}

let moduleCache: WorkerRoutingModuleCache | null = null;

const configSignature = (config: UnifiedRoutingConfig): string | null => {
  try {
    return JSON.stringify(config);
  } catch {
    return null;
  }
};

const createModules = (config: UnifiedRoutingConfig): WorkerRoutingModules => ({
  gridBuilder: new GridBuilder(config),
  astar: new AStarPathfinder(config),
  analyzer: new ObstacleAnalyzer(),
  postProcessor: new PathPostProcessor(config),
  trunkCalculator: new TrunkCalculator(),
  vgRouter: new VisibilityGraphRouter(config),
  busDetector: new BusDetector(config),
  portSelector: new PortSelector(config),
});

export const getWorkerRoutingModules = (config: UnifiedRoutingConfig): WorkerRoutingModules => {
  const signature = configSignature(config);
  const canReuse = !!moduleCache
    && moduleCache.config === config
    && signature !== null
    && moduleCache.signature === signature;
  if (canReuse && moduleCache) return moduleCache.modules;

  const modules = createModules(config);
  moduleCache = { config, signature, modules };
  return modules;
};

export const resetWorkerRoutingModuleCacheForTests = (): void => {
  moduleCache = null;
};
