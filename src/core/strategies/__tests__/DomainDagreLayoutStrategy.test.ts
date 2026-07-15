import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { LayoutType } from '../../types/layout';
import DomainDagreLayoutStrategy from '../DomainDagreLayoutStrategy';
import demandAllocation from '../../../data/standardized/DeamndAllocation.json';
import logisticsStandardData from '../../../data/standardized/LogisticsStandardData.json';
import systemsInteractionStandardData from '../../../data/standardized/SystemsInteractionStandardData.json';
import transportDrivenStandardData from '../../../data/standardized/TransportDrivenStandardData.json';
import wmsProcessFlowStandardData from '../../../data/standardized/WmsProcessFlowStandardData.json';
import { standardDataToCanvas } from '../../components/diagrams/designerUtils';
import {
    computeBaseReactFlowDisplayEdgeEpoch,
    createBaseReactFlowDisplayEdges,
} from '../../components/shared/baseReactFlowDisplayEdges';
import { detectLocalDoglegRisks } from '../../algorithms/localDoglegQuality';

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

    it('respects standard data group visibility options before laying out system interaction diagrams', async () => {
        const canvas = await standardDataToCanvas(systemsInteractionStandardData as any);
        const expectedSubDomains = new Set((systemsInteractionStandardData as any).layout.subDomainWhitelist);

        const domainGroups = canvas.nodes.filter(
            node => String(node.type) === 'titleGroup'
        );
        const visibleSubGroups = canvas.nodes.filter(
            node => String(node.type) === 'subGroup' && !(node.data as any)?.hidden
        );
        const hiddenGroups = canvas.nodes.filter(
            node => ['titleGroup', 'subGroup'].includes(String(node.type || '')) && (node.data as any)?.hidden
        );
        const hiddenGroupIds = new Set(hiddenGroups.map(node => node.id));
        const visibleNodesParentedToHiddenGroups = canvas.nodes.filter(
            node => !(node as any).hidden && node.parentId && hiddenGroupIds.has(String(node.parentId))
        );

        expect(domainGroups).toHaveLength(0);
        expect(hiddenGroups).toHaveLength(0);
        expect(visibleNodesParentedToHiddenGroups).toEqual([]);
        expect(new Set(visibleSubGroups.map(node => String((node.data as any)?.subDomain || '')))).toEqual(expectedSubDomains);
        expect(canvas.edges).toHaveLength((systemsInteractionStandardData as any).edges.length);
    }, 15_000);

    it('keeps large standard conversions layout-compatible in interactive edge-routing mode', async () => {
        const canvas = await standardDataToCanvas(wmsProcessFlowStandardData as any, undefined, {
            edgeRoutingQuality: 'interactive',
        });

        const hiddenGroups = canvas.nodes.filter(
            node => ['titleGroup', 'subGroup'].includes(String(node.type || '')) && (node.data as any)?.hidden
        );
        const interactiveEdges = canvas.edges.filter(edge => (edge.data as any)?.algorithm === 'domain-dagre-interactive');
        const fanOutSources = new Set(['order-input', 'allocation', 'task-generate', 'task-group', 'operation']);
        const fanOutEdges = canvas.edges.filter(edge => fanOutSources.has(edge.source));
        const sharedTrunkFanOutEdges = fanOutEdges.filter(edge => (edge.data as any)?.sharedTrunkSynthesized === true);

        expect(canvas.nodes.length).toBeGreaterThanOrEqual((wmsProcessFlowStandardData as any).nodes.length);
        expect(canvas.edges).toHaveLength((wmsProcessFlowStandardData as any).edges.length);
        expect(hiddenGroups).toHaveLength(0);
        expect(interactiveEdges).toHaveLength(canvas.edges.length);
        expect(canvas.edges.every(edge => (edge.data as any)?.trunkPolishVersion === 2)).toBe(true);
        expect(sharedTrunkFanOutEdges.length).toBeGreaterThan(0);
        expect(canvas.edges.every(edge => Array.isArray((edge.data as any)?.computedPath))).toBe(true);
        expect(canvas.edges.every(edge => (edge.data as any)?.layoutPathLocked === true)).toBe(true);
    }, 15_000);

    it('keeps reverse systems-interaction feedback off the forward target trunk in interactive mode', async () => {
        const canvas = await standardDataToCanvas(systemsInteractionStandardData as any, undefined, {
            edgeRoutingQuality: 'interactive',
        });
        const feedback = canvas.edges.find(edge => edge.id === 'edge-tms-execution-wms-outbound');
        const path = pathFor(canvas.edges, 'edge-tms-execution-wms-outbound');

        expect(feedback).toBeTruthy();
        expect(path.length).toBeGreaterThanOrEqual(2);
        expect(path[1].y).toBeLessThan(path[0].y);
    }, 15_000);

    it('keeps WMS quota fan-out on the vertical process axis in horizontal subdomain dagre', async () => {
        const canvas = await standardDataToCanvas(demandAllocation as any);
        const presetLayout = (demandAllocation as any).layout;

        const result = await new DomainDagreLayoutStrategy().calculateLayout(canvas.nodes, canvas.edges, {
            type: LayoutType.DAGRE,
            direction: 'TB',
            nodeLayout: 'dagre',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'LR',
            subDomainNodeDirection: 'TB',
            domainOrder: presetLayout.domainOrder,
            subDomainOrder: presetLayout.subDomainOrder,
        } as any);

        const fixQuota = result.nodes.find(n => n.id === 'fix-quota')!;
        const outgoing = result.edges.filter(e => e.source === 'fix-quota');
        expect(fixQuota).toBeTruthy();
        expect(outgoing.map(e => e.id).sort()).toEqual(['e10', 'e16']);

        for (const edge of outgoing) {
            const path = ((edge.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;
            expect(edge.sourceHandle).toBe('bottom');
            expect((edge.data as any)?.layoutPathLocked).toBe(true);
            expect((edge.data as any)?.runtimeHandleLock).toMatchObject({ source: true, target: true });
            expect(path.length).toBeGreaterThanOrEqual(2);

            const sourceAbs = absolutePositionOf(fixQuota, result.nodes);
            const sourceSize = sizeOf(fixQuota);
            const sourceBottomY = sourceAbs.y + sourceSize.height;
            const first = path[0];
            const second = path[1];

            expect(first.x).toBeGreaterThanOrEqual(sourceAbs.x - 1);
            expect(first.x).toBeLessThanOrEqual(sourceAbs.x + sourceSize.width + 1);
            expect(first.y).toBeGreaterThanOrEqual(sourceBottomY);
            expect(Math.abs(second.x - first.x)).toBeLessThanOrEqual(2);
            expect(second.y).toBeGreaterThan(first.y + 24);
        }

        const poolAEdge = result.edges.find(e => e.id === 'e5')!;
        const poolAPath = ((poolAEdge.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;
        expect(detectLocalDoglegRisks(poolAPath)).toEqual([]);
    }, 15_000);

    it('keeps WMS quota fan-out entering lower resource nodes from the top', async () => {
        const canvas = await standardDataToCanvas(demandAllocation as any);
        const presetLayout = (demandAllocation as any).layout;

        const result = await new DomainDagreLayoutStrategy().calculateLayout(canvas.nodes, canvas.edges, {
            type: LayoutType.DAGRE,
            direction: 'TB',
            nodeLayout: 'dagre',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'LR',
            subDomainNodeDirection: 'TB',
            domainOrder: presetLayout.domainOrder,
            subDomainOrder: presetLayout.subDomainOrder,
        } as any);

        for (const edgeId of ['e10', 'e16']) {
            const edge = result.edges.find(e => e.id === edgeId)!;
            const target = result.nodes.find(n => n.id === edge.target)!;
            const targetAbs = absolutePositionOf(target, result.nodes);
            const targetSize = sizeOf(target);
            const path = ((edge.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;
            const beforeEnd = path[path.length - 2];
            const end = path[path.length - 1];

            expect(edge.sourceHandle).toBe('bottom');
            expect(edge.targetHandle).toBe('top');
            expect(path.length).toBeGreaterThanOrEqual(2);
            expect(end.x).toBeGreaterThanOrEqual(targetAbs.x - 1);
            expect(end.x).toBeLessThanOrEqual(targetAbs.x + targetSize.width + 1);
            expect(end.y).toBeCloseTo(targetAbs.y - 1, 1);
            expect(beforeEnd.x).toBeCloseTo(end.x, 1);
            expect(beforeEnd.y).toBeLessThan(end.y);
        }
    }, 15_000);

    it('separates Logistics TMS support and yard lanes after dagre routing', async () => {
        const canvas = await standardDataToCanvas(logisticsStandardData as any);
        const presetLayout = (logisticsStandardData as any).layout;

        const result = await new DomainDagreLayoutStrategy().calculateLayout(canvas.nodes, canvas.edges, {
            type: LayoutType.DAGRE,
            direction: 'TB',
            nodeLayout: 'dagre',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'LR',
            subDomainNodeDirection: 'TB',
            domainOrder: presetLayout.domainOrder,
            subDomainOrder: presetLayout.subDomainOrder,
        } as any);

        const tmsBms = pathFor(result.edges, 'edge-tms-bms');
        const tmsYms = pathFor(result.edges, 'edge-tms-yms');
        const tmsVisibility = pathFor(result.edges, 'edge-tms-visibility');
        const wmsVisibility = pathFor(result.edges, 'edge-wms-visibility');

        expect(maxParallelOverlap(tmsBms, tmsYms)).toBeLessThan(24);
        expect(maxParallelOverlap(tmsVisibility, wmsVisibility)).toBeLessThan(96);
    }, 15_000);

    it('keeps Logistics explicit hub lanes displayable after standard conversion', async () => {
        const canvas = await standardDataToCanvas(logisticsStandardData as any);
        const displayEdges = createBaseReactFlowDisplayEdges({
            edges: canvas.edges,
            nodes: canvas.nodes,
            enableSmartEdges: true,
            smartEdgePadding: 20,
            isLargeGraph: false,
            displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
                nodes: canvas.nodes,
                edges: canvas.edges,
            }),
        });
        const displayById = new Map(displayEdges.map(edge => [edge.id, edge]));

        for (const edgeId of ['edge-loms-customs', 'edge-loms-visibility', 'edge-tms-bms', 'edge-wms-visibility']) {
            const edge = canvas.edges.find(item => item.id === edgeId);
            expect(edge, edgeId).toBeTruthy();
            expect(pathFor(canvas.edges, edgeId).length, edgeId).toBeGreaterThanOrEqual(2);
            expect((edge?.data as any)?.layoutPathLocked, edgeId).toBe(true);
            expect(displayById.get(edgeId)?.type, edgeId).toBe('stablePath');
        }

        const displayTmsBms = pathFor(displayEdges, 'edge-tms-bms');
        expect(axisOf(displayTmsBms[displayTmsBms.length - 2], displayTmsBms[displayTmsBms.length - 1])).toBe('v');
        expect(nonOrthogonalSegments(displayEdges)).toEqual([]);
        expect(shortEndpointStubs(displayEdges, 48)).toEqual([]);
        expect(unrelatedStrictCrossings(displayEdges)).toEqual([]);
    }, 15_000);

    it('separates opposite-role Transport hub lanes after dagre routing', async () => {
        const canvas = await standardDataToCanvas(transportDrivenStandardData as any);
        const presetLayout = (transportDrivenStandardData as any).layout;

        const result = await new DomainDagreLayoutStrategy().calculateLayout(canvas.nodes, canvas.edges, {
            type: LayoutType.DAGRE,
            direction: 'TB',
            nodeLayout: 'dagre',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'LR',
            subDomainNodeDirection: 'TB',
            domainOrder: presetLayout.domainOrder,
            subDomainOrder: presetLayout.subDomainOrder,
        } as any);

        const inbound = pathFor(result.edges, 'edge-oms-wms-inbound');
        const status = pathFor(result.edges, 'edge-wms-oms-status');
        const masterDataTms = pathFor(result.edges, 'edge-master-data-tms');
        const masterDataOms = pathFor(result.edges, 'edge-master-data-oms');
        const tmsOmsStatus = pathFor(result.edges, 'edge-tms-oms-status');
        const tmsExecution = pathFor(result.edges, 'edge-tms-planning-execution');
        const masterDataWms = pathFor(result.edges, 'edge-master-data-wms');
        const wmsExecution = pathFor(result.edges, 'edge-wms-inbound-outbound');

        expect(maxParallelOverlap(inbound, status)).toBeLessThan(24);
        expect(maxParallelOverlap(masterDataTms, tmsExecution)).toBeLessThan(24);
        expect(maxParallelOverlap(masterDataWms, wmsExecution)).toBeLessThan(24);
        expect(maxParallelOverlap(masterDataOms, tmsOmsStatus)).toBeLessThan(96);
    }, 15_000);

    it('keeps Transport opposite-role repaired lanes displayable after standard conversion', async () => {
        const canvas = await standardDataToCanvas(transportDrivenStandardData as any);
        const inbound = pathFor(canvas.edges, 'edge-oms-wms-inbound');
        const status = pathFor(canvas.edges, 'edge-wms-oms-status');
        const masterDataTms = pathFor(canvas.edges, 'edge-master-data-tms');
        const masterDataOms = pathFor(canvas.edges, 'edge-master-data-oms');
        const tmsOmsStatus = pathFor(canvas.edges, 'edge-tms-oms-status');
        const tmsExecution = pathFor(canvas.edges, 'edge-tms-planning-execution');
        const masterDataWms = pathFor(canvas.edges, 'edge-master-data-wms');
        const wmsExecution = pathFor(canvas.edges, 'edge-wms-inbound-outbound');

        expect(inbound.length).toBeGreaterThanOrEqual(2);
        expect(status.length).toBeGreaterThanOrEqual(2);
        expect(maxParallelOverlap(inbound, status)).toBeLessThan(24);
        expect(maxParallelOverlap(masterDataTms, tmsExecution)).toBeLessThan(24);
        expect(maxParallelOverlap(masterDataWms, wmsExecution)).toBeLessThan(24);
        expect(maxParallelOverlap(masterDataOms, tmsOmsStatus)).toBeLessThan(96);
        expect(masterDataWms[1].x).toBeCloseTo(masterDataWms[0].x, 1);
        expect(masterDataWms[1].y).toBeGreaterThan(masterDataWms[0].y);

        expect((canvas.edges.find(edge => edge.id === 'edge-oms-wms-inbound')?.data as any)).toEqual(expect.objectContaining({
            layoutPathLocked: true,
        }));

        const displayEdges = createBaseReactFlowDisplayEdges({
            edges: canvas.edges,
            nodes: canvas.nodes,
            enableSmartEdges: true,
            smartEdgePadding: 20,
            isLargeGraph: false,
            displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
                nodes: canvas.nodes,
                edges: canvas.edges,
            }),
        });
        const displayById = new Map(displayEdges.map(edge => [edge.id, edge]));

        expect(displayById.get('edge-oms-wms-inbound')?.type).toBe('stablePath');
        expect(displayById.get('edge-wms-oms-status')?.type).toBe('stablePath');
        expect(pathFor(canvas.edges, 'edge-master-data-tms').length).toBeGreaterThanOrEqual(2);
    }, 15_000);
});

function pathFor(edges: Edge[], edgeId: string): Array<{ x: number; y: number }> {
    const edge = edges.find(e => e.id === edgeId);
    return (((edge?.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>);
}

function maxParallelOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): number {
    let maxOverlap = 0;
    for (let i = 0; i < a.length - 1; i++) {
        for (let j = 0; j < b.length - 1; j++) {
            maxOverlap = Math.max(maxOverlap, segmentOverlap(a[i], a[i + 1], b[j], b[j + 1]));
        }
    }
    return maxOverlap;
}

function axisOf(
    a: { x: number; y: number },
    b: { x: number; y: number },
): 'h' | 'v' | null {
    if (Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 1) return 'h';
    if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) > 1) return 'v';
    return null;
}

function shortEndpointStubs(edges: Edge[], minLength: number): Array<{ edgeId: string; first: number; last: number }> {
    return edges.flatMap(edge => {
        const path = pathFor(edges, edge.id || '');
        if (path.length < 2) return [];
        const first = segmentLength(path[0], path[1]);
        const last = segmentLength(path[path.length - 2], path[path.length - 1]);
        return first < minLength || last < minLength ? [{ edgeId: edge.id || '', first, last }] : [];
    });
}

function nonOrthogonalSegments(edges: Edge[]): Array<{ edgeId: string; segment: number }> {
    return edges.flatMap(edge => {
        const path = pathFor(edges, edge.id || '');
        const issues: Array<{ edgeId: string; segment: number }> = [];
        for (let i = 0; i < path.length - 1; i++) {
            if (!axisOf(path[i], path[i + 1])) {
                issues.push({ edgeId: edge.id || '', segment: i });
            }
        }
        return issues;
    });
}

function unrelatedStrictCrossings(
    edges: Edge[],
): Array<{ edgeIds: [string, string]; point: { x: number; y: number } }> {
    const crossings: Array<{ edgeIds: [string, string]; point: { x: number; y: number } }> = [];
    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            const first = edges[i];
            const second = edges[j];
            if (first.source === second.source || first.target === second.target) continue;

            const firstPath = pathFor(edges, first.id || '');
            const secondPath = pathFor(edges, second.id || '');
            for (let a = 0; a < firstPath.length - 1; a++) {
                for (let b = 0; b < secondPath.length - 1; b++) {
                    const point = strictCrossingPoint(firstPath[a], firstPath[a + 1], secondPath[b], secondPath[b + 1]);
                    if (point) crossings.push({ edgeIds: [first.id || '', second.id || ''], point });
                }
            }
        }
    }
    return crossings;
}

function strictCrossingPoint(
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number },
): { x: number; y: number } | null {
    const aAxis = axisOf(a1, a2);
    const bAxis = axisOf(b1, b2);
    if (!aAxis || !bAxis || aAxis === bAxis) return null;

    const h1 = aAxis === 'h' ? a1 : b1;
    const h2 = aAxis === 'h' ? a2 : b2;
    const v1 = aAxis === 'v' ? a1 : b1;
    const v2 = aAxis === 'v' ? a2 : b2;
    const x = v1.x;
    const y = h1.y;
    if (
        x > Math.min(h1.x, h2.x) + 1
        && x < Math.max(h1.x, h2.x) - 1
        && y > Math.min(v1.y, v2.y) + 1
        && y < Math.max(v1.y, v2.y) - 1
    ) {
        return { x, y };
    }
    return null;
}

function segmentLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function segmentOverlap(
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number }
): number {
    const aVertical = Math.abs(a1.x - a2.x) < 1;
    const bVertical = Math.abs(b1.x - b2.x) < 1;
    if (aVertical !== bVertical) return 0;
    if (aVertical) {
        if (Math.abs(a1.x - b1.x) > 1) return 0;
        return Math.max(0, Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y))
            - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)));
    }
    if (Math.abs(a1.y - b1.y) > 1) return 0;
    return Math.max(0, Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x))
        - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)));
}
