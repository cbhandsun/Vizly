// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { baseReactFlowDisplayHardQualityIsClean } from '../baseReactFlowDisplayQualityGates';

describe('baseReactFlowDisplayEdges worker declared-axis boundary', () => {
  it('enforces declared terminal axes on both sides of the former 24-edge boundary', () => {
    const buildGraph = (edgeCount: number, wrongTerminalAxis: boolean) => {
      const nodes: Node[] = [];
      const edges: Edge[] = [];
      for (let index = 0; index < edgeCount; index += 1) {
        const y = index * 120;
        nodes.push(
          {
            id: `source-${index}`,
            position: { x: 0, y },
            measured: { width: 100, height: 60 },
            data: {},
          },
          {
            id: `target-${index}`,
            position: { x: 300, y },
            measured: { width: 100, height: 60 },
            data: {},
          },
        );
        const centerY = y + 30;
        edges.push({
          id: `edge-${index}`,
          source: `source-${index}`,
          target: `target-${index}`,
          sourceHandle: 'right',
          targetHandle: 'left',
          data: {
            computedPath: wrongTerminalAxis && index === edgeCount - 1
              ? [
                { x: 100, y: centerY },
                { x: 100, y: centerY + 48 },
                { x: 300, y: centerY + 48 },
                { x: 300, y: centerY },
              ]
              : [
                { x: 100, y: centerY },
                { x: 300, y: centerY },
              ],
          },
        });
      }
      return { nodes, edges };
    };

    for (const edgeCount of [24, 25]) {
      const clean = buildGraph(edgeCount, false);
      const wrong = buildGraph(edgeCount, true);
      expect(baseReactFlowDisplayHardQualityIsClean(clean.edges, clean.nodes)).toBe(true);
      expect(baseReactFlowDisplayHardQualityIsClean(wrong.edges, wrong.nodes)).toBe(false);
    }
  });
});
