import type { Node as ReactFlowNode } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LayoutType } from '../../types/layout';
import DomainVerticalLayoutStrategy from '../DomainVerticalLayoutStrategy';
import { runEdgeRoutingPipeline } from '../shared/edgeRoutingPipeline';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      font: '',
      measureText: (text: string) => ({ width: String(text ?? '').length * 8 }),
    }),
  });
});

vi.mock('../shared/edgeRoutingPipeline', () => ({
  runEdgeRoutingPipeline: vi.fn(async (_nodes, edges) => edges),
}));

const businessNode = (
  id: string,
  domain: string,
  subDomain: string,
): ReactFlowNode => ({
  id,
  type: 'default',
  position: { x: 0, y: 0 },
  measured: { width: 160, height: 72 },
  style: { width: 160, height: 72 },
  data: {
    id,
    label: id,
    description: id,
    domain,
    subDomain,
  },
});

describe('DomainVerticalLayoutStrategy', () => {
  beforeEach(() => {
    vi.mocked(runEdgeRoutingPipeline).mockClear();
  });

  it('preserves explicit domain order through the final dagre restack', async () => {
    const result = await new DomainVerticalLayoutStrategy().calculateLayout(
      [
        businessNode('a-node', 'A-domain', 'A-sub'),
        businessNode('b-node', 'B-domain', 'B-sub'),
      ],
      [],
      {
        type: LayoutType.VERTICAL,
        nodeLayout: LayoutType.DAGRE,
        direction: 'TB',
        generateDomainGroups: true,
        generateSubDomainGroups: true,
        domainOrder: ['B-domain', 'A-domain'],
        subDomainOrder: {
          'B-domain': ['B-sub'],
          'A-domain': ['A-sub'],
        },
        padding: { top: 80, right: 40, bottom: 40, left: 40 },
      } as any,
    );
    const domains = result.nodes
      .filter(node => node.type === 'titleGroup')
      .sort((left, right) => left.position.y - right.position.y);

    expect(domains.map(domain => (domain.data as any).domain)).toEqual([
      'B-domain',
      'A-domain',
    ]);
    expect(domains[1].position.y).toBeGreaterThan(
      domains[0].position.y + Number(domains[0].measured?.height ?? 0),
    );
  }, 15_000);

  it.each(['phase1', 'phase2'] as const)(
    'stops after %s without mutating options or entering edge routing',
    async stopAfterPhase => {
      const options = {
        type: LayoutType.VERTICAL,
        nodeLayout: LayoutType.HORIZONTAL,
        direction: 'TB',
        generateDomainGroups: true,
        generateSubDomainGroups: true,
        stopAfterPhase: ` ${stopAfterPhase.toUpperCase()} `,
        padding: { top: 80, right: 40, bottom: 40, left: 40 },
      } as any;
      const before = structuredClone(options);

      const result = await new DomainVerticalLayoutStrategy().calculateLayout(
        [businessNode('node', 'domain', 'sub')],
        [],
        options,
      );

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(options).toEqual(before);
      expect(options.__stopAfterPhase).toBeUndefined();
      expect(runEdgeRoutingPipeline).not.toHaveBeenCalled();
    },
    15_000,
  );
});
