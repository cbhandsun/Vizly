import { describe, expect, it } from 'vitest';
import {
  aStarOnGraph,
  addPointToGraph,
  buildVisibilityGraph,
  findPathOnVisibilityGraph,
  getGraphStats,
  isVisible,
} from '../visibilityGraph';
import { QuadTree } from '../SpatialIndex';

describe('visibilityGraph routing implementation', () => {
  it('checks visibility against raw obstacles and spatial indexes', () => {
    const obstacle = { x: 40, y: -10, width: 20, height: 20 };
    const tree = new QuadTree({ x: -100, y: -100, width: 200, height: 200 });
    tree.insert(obstacle);

    expect(isVisible({ x: 0, y: 0 }, { x: 100, y: 0 }, [obstacle], 0)).toBe(false);
    expect(isVisible({ x: 0, y: 30 }, { x: 100, y: 30 }, [obstacle], 0)).toBe(true);
    expect(isVisible({ x: 0, y: 0 }, { x: 100, y: 0 }, tree, 0)).toBe(false);
  });

  it('builds graph vertices from corners and midpoints with dynamic padding', () => {
    const graph = buildVisibilityGraph([
      { x: 10, y: 10, width: 20, height: 20, padding: 5 } as never,
    ], { useCornerPoints: true, useEdgeMidpoints: true, obstacleOffset: 20 });

    expect(graph.vertices).toHaveLength(8);
    expect(graph.vertices).toContainEqual({ x: 5, y: 5 });
    expect(graph.vertices).toContainEqual({ x: 20, y: 5 });
    expect(graph.vertexToObstacle.size).toBe(8);
  });

  it('adds visible points and finds graph paths with penalties', () => {
    const graph = {
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 }],
      edges: new Map([[0, [1, 2]], [1, [0, 2]], [2, [0, 1]]]),
      edgeCosts: new Map([['0-1', 10], ['1-0', 10], ['0-2', 20], ['2-0', 20], ['2-1', 20], ['1-2', 20]]),
      vertexToObstacle: new Map(),
    };

    expect(aStarOnGraph(graph, 0, 1)).toEqual([0, 1]);
    expect(aStarOnGraph(graph, 0, 1, [{ start: { x: 50, y: -10 }, end: { x: 50, y: 10 } }])).toEqual([0, 2, 1]);
    expect(aStarOnGraph(graph, -1, 1)).toBeNull();

    const newIndex = addPointToGraph(graph, { x: 0, y: 50 }, [], 0);
    expect(newIndex).toBe(3);
    expect(graph.edges.get(3)?.length).toBeGreaterThan(0);
  });

  it('finds direct and obstacle-avoiding paths and reports stats', () => {
    expect(findPathOnVisibilityGraph({ x: 0, y: 0 }, { x: 10, y: 0 }, [])).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);

    const path = findPathOnVisibilityGraph(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [{ x: 40, y: -10, width: 20, height: 20 }],
      undefined,
      { obstacleOffset: 5 },
    );

    expect(path).not.toBeNull();
    expect(path?.[0]).toEqual({ x: 0, y: 0 });
    expect(path?.[path.length - 1]).toEqual({ x: 100, y: 0 });

    const stats = getGraphStats({
      vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      edges: new Map([[0, [1]], [1, [0]]]),
      edgeCosts: new Map(),
      vertexToObstacle: new Map(),
    });
    expect(stats).toEqual({ vertexCount: 2, edgeCount: 1, avgDegree: 1, maxDegree: 1 });
    expect(getGraphStats({ vertices: [], edges: new Map(), edgeCosts: new Map(), vertexToObstacle: new Map() }))
      .toEqual({ vertexCount: 0, edgeCount: 0, avgDegree: 0, maxDegree: 0 });
  });
});
