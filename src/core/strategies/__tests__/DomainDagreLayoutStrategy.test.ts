import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { LayoutType } from '../../types/layout';
import DomainDagreLayoutStrategy from '../DomainDagreLayoutStrategy';

vi.hoisted(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        writable: true,
        value: () => ({
            font: '',
            measureText: (text: string) => ({ width: String(text || '').length * 8 }),
        }),
    });
});

const makeNode = (id: string, domain: string, subDomain: string): ReactFlowNode => ({
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    style: { width: 180, height: 72 },
    measured: { width: 180, height: 72 } as any,
    data: {
        id,
        label: id,
        description: id,
        domain,
        subDomain,
    },
});

const sizeOf = (node: ReactFlowNode) => ({
    width: Number((node as any).style?.width ?? (node as any).measured?.width ?? 0),
    height: Number((node as any).style?.height ?? (node as any).measured?.height ?? 0),
});

const absolutePositionOf = (node: ReactFlowNode, nodes: ReactFlowNode[]) => {
    const byId = new Map(nodes.map(n => [n.id, n] as const));
    let x = Number((node.position as any)?.x ?? 0);
    let y = Number((node.position as any)?.y ?? 0);
    let current = node;
    let depth = 0;
    while (current.parentId && depth < 10) {
        const parent = byId.get(current.parentId);
        if (!parent) break;
        x += Number((parent.position as any)?.x ?? 0);
        y += Number((parent.position as any)?.y ?? 0);
        current = parent;
        depth++;
    }
    return { x, y };
};

describe('DomainDagreLayoutStrategy', () => {
    it('keeps subdomains horizontal in every domain while laying out nodes inside subdomains with dagre', async () => {
        const nodes: ReactFlowNode[] = [
            makeNode('d1-a-node', 'first-domain', 'inbound'),
            makeNode('d1-b-node', 'first-domain', 'storage'),
            makeNode('d2-a-node', 'second-domain', 'pick'),
            makeNode('d2-b-node', 'second-domain', 'pack'),
        ];
        const edges: Edge[] = [];

        const result = await new DomainDagreLayoutStrategy().calculateLayout(nodes, edges, {
            type: LayoutType.DAGRE,
            direction: 'TB',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'LR',
            subDomainNodeDirection: 'TB',
            domainOrder: ['first-domain', 'second-domain'],
            subDomainOrder: {
                'first-domain': ['inbound', 'storage'],
                'second-domain': ['pick', 'pack'],
            },
        } as any);

        for (const domainKey of ['first-domain', 'second-domain']) {
            const domain = result.nodes.find(n => String(n.type) === 'titleGroup' && (n.data as any).domain === domainKey);
            expect(domain).toBeTruthy();

            const subGroups = result.nodes
                .filter(n => String(n.type) === 'subGroup' && (n.data as any).domain === domainKey)
                .sort((a, b) => a.position.x - b.position.x);

            expect(subGroups).toHaveLength(2);
            expect(Math.abs(subGroups[0].position.y - subGroups[1].position.y)).toBeLessThanOrEqual(1);
            expect(subGroups[1].position.x).toBeGreaterThan(subGroups[0].position.x + sizeOf(subGroups[0]).width);

            const rightEdge = Math.max(...subGroups.map(sg => sg.position.x + sizeOf(sg).width));
            expect(sizeOf(domain!).width).toBeGreaterThan(rightEdge);
        }
    });

    it('honors explicit handles when computing routed paths across horizontal subdomains', async () => {
        const nodes: ReactFlowNode[] = [
            makeNode('calc-theory-ratio', '策略计算', '数据准备'),
            makeNode('sort-demand', '策略计算', '初分逻辑'),
            makeNode('check-limit', '策略计算', '初分逻辑'),
        ];
        const edges: Edge[] = [
            {
                id: 'e3',
                source: 'calc-theory-ratio',
                target: 'sort-demand',
                sourceHandle: 'right',
                targetHandle: 'left',
                type: 'advanced-smart-step',
            },
            {
                id: 'e4',
                source: 'sort-demand',
                target: 'check-limit',
                type: 'advanced-smart-step',
            },
        ];

        const result = await new DomainDagreLayoutStrategy().calculateLayout(nodes, edges, {
            type: LayoutType.DAGRE,
            direction: 'TB',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'LR',
            subDomainNodeDirection: 'TB',
            domainOrder: ['策略计算'],
            subDomainOrder: {
                '策略计算': ['数据准备', '初分逻辑'],
            },
        } as any);

        const routed = result.edges.find(e => e.id === 'e3')!;
        const source = result.nodes.find(n => n.id === 'calc-theory-ratio')!;
        const target = result.nodes.find(n => n.id === 'sort-demand')!;
        const sourceAbs = absolutePositionOf(source, result.nodes);
        const targetAbs = absolutePositionOf(target, result.nodes);
        const sourceSize = sizeOf(source);
        const _targetSize = sizeOf(target);
        const computedPath = ((routed.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

        expect(routed.sourceHandle).toBe('right');
        expect(routed.targetHandle).toBe('left');
        expect(computedPath.length).toBeGreaterThanOrEqual(2);
        expect(Math.abs(computedPath[0].x - (sourceAbs.x + sourceSize.width + 1))).toBeLessThanOrEqual(1);
        expect(Math.abs(computedPath[computedPath.length - 1].x - (targetAbs.x - 1))).toBeLessThanOrEqual(1);
    });
});
