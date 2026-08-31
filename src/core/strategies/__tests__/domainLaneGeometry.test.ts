// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import wms from '../../../data/standardized/WmsProcessFlowStandardData.json';
import { DomainDagreLayoutStrategy } from '../DomainDagreLayoutStrategy';
import { LayoutType } from '../../types/layout';
import * as semantic from '../domainDagreSemanticLaneFlow';
import { projectBaseReactFlowDisplayWorkerInput } from '../../components/shared/baseReactFlowDisplayWorkerProjection';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true, value: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
  });
});

describe('semantic lane geometry independent of routing', () => {
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
