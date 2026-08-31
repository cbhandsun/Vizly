import type { Edge, Node } from '@xyflow/react';

/** Anonymous geometry from a compound layout: a downstream box blocks the
 * direct return from the exterior ring to a shared destination's bottom port. */
export const outerCorridorGraph = (): { nodes: Node[]; edges: Edge[] } => {
  const rectangles: Array<[string, number, number, number, number]> = [
    ['a', 826.5, 254, 259, 118], ['b', 413, 492, 282, 118],
    ['c', 1217, 492, 282, 118], ['d', 815, 492, 282, 96],
    ['e', 619, 730, 243, 118], ['f', 192, 730, 298, 118],
    ['g', 1233, 730, 250, 118], ['h', 1111, 1204, 296, 118],
    ['i', 818.5, 1678, 211, 118], ['j', 1149.5, 1678, 219, 73],
    ['k', 1488.5, 1723, 210, 73],
  ];
  const routes: Array<[string, string, Array<[number, number]>]> = [
    ['a', 'd', [[956, 372], [956, 492]]],
    ['a', 'c', [[956, 372], [956, 432], [1358, 432], [1358, 492]]],
    ['a', 'h', [[956, 372], [956, 420], [1519, 420], [1519, 1156], [1259, 1156], [1259, 1204]]],
    ['a', 'b', [[956, 372], [956, 432], [554, 432], [554, 492]]],
    ['c', 'e', [[1358, 610], [1358, 670], [740.5, 670], [740.5, 730]]],
    ['c', 'i', [[1358, 610], [1358, 721], [924, 721], [924, 1678]]],
    ['c', 'j', [[1358, 610], [1358, 658], [1503, 658], [1503, 1630], [1291, 1630], [1291, 1678]]],
    ['c', 'h', [[1358, 610], [1358, 658], [1492, 658], [1492, 907], [1259, 907], [1259, 1204]]],
    ['c', 'g', [[1358, 610], [1358, 730]]],
    ['k', 'a', [[1593.5, 1723], [1593.5, 206], [956, 206], [956, 254]]],
    ['h', 'j', [[1291, 1322], [1291, 1678]]],
    ['b', 'e', [[554, 610], [554, 670], [740.5, 670], [740.5, 730]]],
    ['b', 'h', [[554, 610], [554, 1808], [1078, 1808], [1078, 907], [1259, 907], [1259, 1204]]],
    ['b', 'f', [[554, 610], [554, 670], [341, 670], [341, 730]]],
  ];
  return {
    nodes: rectangles.map(([id, x, y, width, height]) => ({
      id, position: { x, y }, width, height, measured: { width, height }, data: {},
    })),
    edges: routes.map(([source, target, points]) => ({
      id: `${source}-${target}`, source, target,
      sourceHandle: source === 'k' ? 'top' : 'bottom', targetHandle: 'top',
      data: { computedPath: points.map(([x, y]) => ({ x, y })) },
    })),
  };
};
