import type { RoutingStrategySelector } from './RoutingStrategySelector';
import type { VisibilityGraphCache } from './VisibilityGraphCache';
import type { VisibilityGraph } from './visibilityGraph';

export interface PathfindingConfig {
    useVisibilityGraph?: boolean;
    visibilityGraphMinObstacles?: number;
    visibilityGraphCache?: VisibilityGraph;
    enableSmartStrategy?: boolean;
    strategySelector?: RoutingStrategySelector;
    vgCacheManager?: VisibilityGraphCache;
    enableThetaStar?: boolean;
}

export interface Point {
    x: number;
    y: number;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LineObstacle {
    start: Point;
    end: Point;
}

export interface PathfindingGrid {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cols: number;
    rows: number;
    size: number;
    data: Int32Array;
    maxIndex: number;
}
