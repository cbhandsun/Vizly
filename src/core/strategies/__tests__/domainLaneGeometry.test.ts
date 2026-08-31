// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import wms from '../../../data/standardized/WmsProcessFlowStandardData.json';
import { DomainDagreLayoutStrategy } from '../DomainDagreLayoutStrategy';
import { LayoutType } from '../../types/layout';
import * as semantic from '../domainDagreSemanticLaneFlow';
import { projectBaseReactFlowDisplayWorkerInput } from '../../components/shared/baseReactFlowDisplayWorkerProjection';
import * as laneHelpers from '../DomainDagreLayoutHelpers';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true, value: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
  });
});

describe('semantic lane geometry independent of routing', () => {
  it.each(['TB', 'BT', 'LR', 'RL'] as const)('keeps unequal peer sizes inside their lane after reordering in %s', direction => {
    const horizontal = direction === 'LR' || direction === 'RL';
    const cross = horizontal ? 'y' : 'x';
    const leaf = (id: string, crossPosition: number, size: number): Node => ({
      id, type: 'custom', position: horizontal ? { x: 0, y: crossPosition } : { x: crossPosition, y: 0 },
      width: horizontal ? 96 : size, height: horizontal ? size : 96,
      data: { domain: 'domain', subDomain: 'sub' },
    });
    const nodes: Node[] = [
      { id: 'domain', type: 'titleGroup', position: { x: 0, y: 0 }, data: { domain: 'domain' } },
      { id: 'sub', type: 'subGroup', position: { x: 0, y: 0 }, data: { domain: 'domain' } },
      leaf('wide', 0, 300), leaf('narrow', 500, 50), leaf('left', 0, 50), leaf('right', 500, 50),
    ];
    const before = structuredClone(nodes);
    const spy = vi.spyOn(laneHelpers, 'layoutWithDagre').mockImplementation(leaves => leaves.map(node => {
      const flowPosition = ['wide', 'narrow'].includes(node.id) ? 0 : 300;
      return { id: node.id, ...(horizontal ? { x: flowPosition, y: 0 } : { x: 0, y: flowPosition }) };
    }));
    try {
      const result = semantic.alignDomainDagreLaneFlow(nodes, [
        { id: 'a', source: 'wide', target: 'right' }, { id: 'b', source: 'narrow', target: 'left' },
      ], { direction, nodeToSubGroup: new Map(nodes.slice(2).map(node => [node.id, 'sub'])) });
      const group = result.find(node => node.id === 'sub');
      if (!group) throw new Error('Missing lane');
      const groupSize = laneHelpers.getNodeDimensions(group);
      for (const node of result.filter(node => node.type === 'custom')) {
        const size = laneHelpers.getNodeDimensions(node);
        expect(node.position[cross]).toBeGreaterThanOrEqual(group.position[cross]);
        expect(node.position[cross] + (horizontal ? size.height : size.width))
          .toBeLessThanOrEqual(group.position[cross] + (horizontal ? groupSize.height : groupSize.width));
      }
      expect(result.find(node => node.id === 'narrow')?.position[cross])
        .toBeLessThan(result.find(node => node.id === 'wide')?.position[cross] ?? -Infinity);
      expect(nodes).toEqual(before);
    } finally { spy.mockRestore(); }
  });

  it('keeps measured business geometry while placing the WMS workflow', async () => {
    const nodes: Node[] = wms.nodes.map(node => ({ id: node.id, type: 'custom', position: { x: 0, y: 0 },
      data: { ...node, subDomain: node.domain }, width: 240, height: 96, measured: { width: 240, height: 96 } }));
    const align = semantic.alignDomainDagreLaneFlow;
    let expected: Node[] = [];
    const spy = vi.spyOn(semantic, 'alignDomainDagreLaneFlow').mockImplementation((...args) => {
      const output = align(...args);
      expected = structuredClone(output);
      return output;
    });
    try {
      const result = await new DomainDagreLayoutStrategy().calculateLayout(nodes, wms.edges, {
        type: LayoutType.DAGRE, direction: 'TB', nodeLayout: LayoutType.DAGRE,
        domainPlacement: 'ordered-lanes', edgeRoutingQuality: 'interactive',
        spacing: { horizontal: 120, vertical: 120 }, generateDomainGroups: true, generateSubDomainGroups: true,
      });
      expect(result.nodes.filter(node => node.type === 'custom')).toHaveLength(nodes.length);
      expect(spy).toHaveBeenCalledOnce();
      const projected = projectBaseReactFlowDisplayWorkerInput(result);
      const actual = new Map(projected.nodes.map(node => [node.id, node]));
      for (const node of expected) {
        expect(actual.get(node.id)?.positionAbsolute).toEqual(node.position);
      }
    } finally {
      spy.mockRestore();
    }
  });
});
