/** Stable public facade for pathfinding configuration, grid construction, and search. */
export { isPathBlocked } from './pathfindingCollision';
export {
  generateSimplePath,
  generateSmartCShapePath,
} from './pathfindingSimplePaths';
export type {
  LineObstacle,
  PathfindingConfig,
  PathfindingGrid,
  Point,
  Rectangle,
} from './pathfindingTypes';
export {
  getPathfindingConfig,
  setPathfindingConfig,
} from './pathfindingConfig';
export { buildPathfindingGrid } from './pathfindingGrid';
export { findPath } from './pathfindingSearch';
