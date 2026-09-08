// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { assertPaintedCrossingCoverage } from '../../components/shared/__tests__/baseReactFlowDisplayQualityGateAssertions';
import { calculateEdgePathQualityScore } from '../shared/edgeStrictCrossingGuard';
import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { LayoutType } from '../../types/layout';
import type { StandardDiagramData } from '../../models/DiagramModels';
import DomainDagreLayoutStrategy from '../DomainDagreLayoutStrategy';
import { reorderDomainDagrePortAnchors } from '../domainDagrePortAnchorOrdering';
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
import { countUnrelatedObstacleHits } from '../shared/edgeWaypointCandidateRepair';
import { findDisplayGeometricCrossingHits } from '../../components/shared/baseReactFlowDisplayGeometry';
import { isReadableOrthogonalCrossing } from '../../routing/orthogonalCrossingPolicy';
import { withDisplayAbsolutePositions } from '../../components/shared/baseReactFlowDisplayEdgeCore';
import { getExactDisplayHardReport } from '../../components/shared/baseReactFlowDisplayWorkerResponse';
import { prepareLayeredLayoutEdges } from '../../components/diagrams/hooks/layeredLayoutEdgePreparation';
import { clearBaseReactFlowLayoutEdgeRoutingData } from '../../components/shared/baseReactFlowLayoutEdgeRoutingData';
import { seedBaseReactFlowStagedLayoutEdges } from '../../components/shared/baseReactFlowLayoutRoutingTransaction';
import { projectBaseReactFlowDisplayWorkerInput } from '../../components/shared/baseReactFlowDisplayWorkerProjection';
import { createBaseReactFlowDisplayEdgePatches } from '../../components/shared/baseReactFlowDisplayRoutingTransaction';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../../components/shared/baseReactFlowDisplayEdges.worker';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../../components/shared/baseReactFlowDisplayInputIdentity';
import { createDisplayRoutingIdentity } from '../../routing/routingSessionIdentity';

type PathPoint = { x: number; y: number };

const fixtureData = (value: unknown): StandardDiagramData => value as StandardDiagramData;
const computedPathOf = (edge: Edge | undefined): PathPoint[] => {
    const path = edge?.data?.computedPath;
    return Array.isArray(path) ? path as PathPoint[] : [];
};

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
    measured: { width: 180, height: 72 },
    data: {
        id,
        label: id,
        description: id,
        domain,
        subDomain,
    },
});

const sizeOf = (node: ReactFlowNode) => ({
    width: Number(node.style?.width ?? node.measured?.width ?? 0),
    height: Number(node.style?.height ?? node.measured?.height ?? 0),
});

const absolutePositionOf = (node: ReactFlowNode, nodes: ReactFlowNode[]) => {
    const byId = new Map(nodes.map(n => [n.id, n] as const));
    let x = Number(node.position.x ?? 0);
    let y = Number(node.position.y ?? 0);
    let current = node;
    let depth = 0;
    while (current.parentId && depth < 10) {
        const parent = byId.get(current.parentId);
        if (!parent) break;
        x += Number(parent.position.x ?? 0);
        y += Number(parent.position.y ?? 0);
        current = parent;
        depth++;
    }
    return { x, y };
};

describe('DomainDagreLayoutStrategy', () => {
    it.each(['TB', 'LR'] as const)('preserves external component geometry during automatic %s direct and subgroup packing', async direction => {
        for (const grouped of [false, true]) {
            const group = grouped ? 'contents' : '';
            const process = ['start', 'middle', 'end', 'external-in', 'external-out'].map(id => makeNode(id, 'domain-a', group));
            const cards = Array.from({ length: 6 }, (_, index) => makeNode(`free-${index}`, 'domain-a', group));
            const outside = makeNode('outside', 'domain-b', '');
            const input = [...process, ...cards, outside];
            const edges: Edge[] = [
                { id: 'start-middle', source: 'start', target: 'middle' },
                { id: 'middle-end', source: 'middle', target: 'end' },
                { id: 'outside-start', source: 'outside', target: 'start' },
                { id: 'external-in-outside', source: 'external-in', target: 'outside' },
                { id: 'outside-external-out', source: 'outside', target: 'external-out' },
            ];
            const before = structuredClone(input);
            const result = await new DomainDagreLayoutStrategy().calculateLayout(input, edges, {
                type: LayoutType.DAGRE, direction, domainPlacement: 'topology', nodeLayout: LayoutType.DAGRE,
                generateDomainGroups: true, generateSubDomainGroups: grouped, edgeRoutingQuality: 'interactive',
                domainOrder: ['domain-a', 'domain-b'],
            });
            const positions = new Map(result.nodes.map(node => [node.id, absolutePositionOf(node, result.nodes)]));
            const flow = direction === 'TB' ? 'y' : 'x';
            const centers = new Map(result.nodes.map(node => [node.id,
                absolutePositionOf(node, result.nodes)[flow] + sizeOf(node)[direction === 'TB' ? 'height' : 'width'] / 2]));
            expect(centers.get('external-in')).toBe(centers.get('start'));
            expect(centers.get('external-out')).toBe(centers.get('start'));
            expect(new Set(cards.map(node => positions.get(node.id)?.[flow])).size).toBeGreaterThan(1);
            expect(input).toEqual(before);
        }
    });

    it.each([LayoutType.GRID, LayoutType.FLOW])('keeps cross-domain process bands in %s while independently packing disconnected cards', async nodeLayout => {
        const process = [makeNode('first', 'domain-a', ''), makeNode('middle', 'domain-b', ''), makeNode('last', 'domain-a', '')];
        const cards = Array.from({ length: 6 }, (_, index) => makeNode(`independent-${index}`, 'domain-a', ''));
        const input = [...process, ...cards];
        const edges: Edge[] = [{ id: 'first-middle', source: 'first', target: 'middle' },
            { id: 'middle-last', source: 'middle', target: 'last' }];
        const options = { type: LayoutType.SWIMLANE, direction: 'TB' as const, domainPlacement: 'ordered-lanes' as const,
            edgeRoutingQuality: 'interactive' as const, generateDomainGroups: true, generateSubDomainGroups: false,
            spacing: { horizontal: 120, vertical: 120 }, domainOrder: ['domain-a', 'domain-b'] };
        const strategy = new DomainDagreLayoutStrategy();
        const automatic = await strategy.calculateLayout(input, edges, { ...options, nodeLayout: LayoutType.DAGRE });
        const grid = await strategy.calculateLayout(input, edges, { ...options, nodeLayout });
        expect(grid.metadata?.laneRankDecision?.applied).toBe(automatic.metadata?.laneRankDecision?.applied);
        expect(grid.metadata?.laneRankDecision).toBeDefined();
        const position = (id: string, result: typeof grid) => {
            const node = result.nodes.find(value => value.id === id);
            if (!node) throw Error('missing candidate member');
            return absolutePositionOf(node, result.nodes);
        };
        for (const node of process) expect(position(node.id, grid).y).toBe(position(node.id, automatic).y);
        expect(new Set(cards.map(node => position(node.id, grid).x)).size).toBeGreaterThan(1);
        expect(new Set(cards.map(node => position(node.id, grid).y)).size).toBeGreaterThan(1);
        expect(cards.map(node => position(node.id, grid))).not.toEqual(cards.map(node => position(node.id, automatic)));
        expect(new Set(grid.nodes.filter(node => node.type === 'titleGroup').map(node => sizeOf(node).height)).size).toBe(1);
        expect(grid.edges?.every(edge => computedPathOf(edge).length >= 2)).toBe(true);
    });

    it.each(['TB', 'LR', 'BT', 'RL'] as const)('keeps empty, singleton and uneven edgeless domains valid in %s', async direction => {
        const fixtures: ReactFlowNode[][] = [
            [],
            [makeNode('single', 'only-domain', '')],
            Array.from({ length: 13 }, (_, index) => makeNode(
                'isolated-' + index,
                index === 12 ? 'sparse' : 'dense',
                index === 12 ? 'one' : index < 6 ? 'first' : 'second',
            )),
        ];
        for (const nodes of fixtures) {
            const before = structuredClone(nodes);
            const result = await new DomainDagreLayoutStrategy().calculateLayout(nodes, [], {
                type: LayoutType.SWIMLANE, direction,
                domainPlacement: 'ordered-lanes', generateDomainGroups: true, generateSubDomainGroups: true,
            });
            expect(result.edges ?? []).toEqual([]);
            const originalIds = new Set(nodes.map(node => node.id));
            const leaves = result.nodes.filter(node => originalIds.has(node.id));
            expect(leaves.map(node => node.id).sort()).toEqual([...originalIds].sort());
            expect(result.nodes.every(node => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
            for (let i = 0; i < leaves.length; i += 1) for (let j = i + 1; j < leaves.length; j += 1) {
                const a = absolutePositionOf(leaves[i], result.nodes), b = absolutePositionOf(leaves[j], result.nodes);
                const as = sizeOf(leaves[i]), bs = sizeOf(leaves[j]);
                expect(a.x + as.width <= b.x || b.x + bs.width <= a.x
                    || a.y + as.height <= b.y || b.y + bs.height <= a.y).toBe(true);
            }
            const domains = result.nodes.filter(node => node.type === 'titleGroup');
            const flowSize = direction === 'TB' || direction === 'BT' ? 'height' : 'width';
            if (nodes.length > 1) {
                expect(domains).toHaveLength(2);
                expect(new Set(domains.map(node => sizeOf(node)[flowSize])).size).toBe(1);
            }
            expect(nodes).toEqual(before);
        }
    });

    it('composes horizontal swimlanes with selectable vertical node layout and equal domain widths', async () => {
        const nodes: ReactFlowNode[] = [
            makeNode('a-1', 'domain-a', 'sub-a1'),
            makeNode('a-2', 'domain-a', 'sub-a1'),
            makeNode('a-3', 'domain-a', 'sub-a2'),
            makeNode('b-1', 'domain-b', 'sub-b1'),
        ];
        const edges: Edge[] = [
            { id: 'a-b', source: 'a-2', target: 'b-1' },
            { id: 'b-a', source: 'b-1', target: 'a-1' },
        ];

        const result = await new DomainDagreLayoutStrategy().calculateLayout(nodes, edges, {
            type: LayoutType.SWIMLANE,
            direction: 'LR',
            nodeLayout: LayoutType.VERTICAL,
            domainPlacement: 'ordered-lanes',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'LR',
            subDomainNodeDirection: 'LR',
        });
        const domains = result.nodes
            .filter(node => node.type === 'titleGroup')
            .sort((left, right) => left.position.y - right.position.y);
        expect(domains).toHaveLength(2);
        expect(domains[0].position.x).toBeCloseTo(domains[1].position.x);
        expect(domains[1].position.y).toBeGreaterThan(
            domains[0].position.y + sizeOf(domains[0]).height,
        );
        expect(sizeOf(domains[0]).width).toBe(sizeOf(domains[1]).width);

        const domainASubGroups = result.nodes
            .filter(node => node.type === 'subGroup' && node.data.domain === 'domain-a')
            .sort((left, right) => left.position.x - right.position.x);
        expect(domainASubGroups).toHaveLength(2);
        expect(domainASubGroups[0].position.y).toBeCloseTo(domainASubGroups[1].position.y);

        const a1 = result.nodes.find(node => node.id === 'a-1');
        const a2 = result.nodes.find(node => node.id === 'a-2');
        expect(a1).toBeTruthy();
        expect(a2).toBeTruthy();
        expect(a1!.position.x).toBeCloseTo(a2!.position.x);
        expect(a2!.position.y).toBeGreaterThan(a1!.position.y + sizeOf(a1!).height);
    });

    it('composes vertical swimlanes with selectable horizontal node layout and equal domain heights', async () => {
        const nodes: ReactFlowNode[] = [
            makeNode('a-1', 'domain-a', 'sub-a1'),
            makeNode('a-2', 'domain-a', 'sub-a1'),
            makeNode('a-3', 'domain-a', 'sub-a2'),
            makeNode('b-1', 'domain-b', 'sub-b1'),
        ];
        const edges: Edge[] = [
            { id: 'a-b', source: 'a-2', target: 'b-1' },
            { id: 'b-a', source: 'b-1', target: 'a-1' },
        ];

        const result = await new DomainDagreLayoutStrategy().calculateLayout(nodes, edges, {
            type: LayoutType.SWIMLANE,
            direction: 'TB',
            nodeLayout: LayoutType.HORIZONTAL,
            domainPlacement: 'ordered-lanes',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'TB',
            subDomainNodeDirection: 'TB',
        });
        const domains = result.nodes
            .filter(node => node.type === 'titleGroup')
            .sort((left, right) => left.position.x - right.position.x);
        expect(domains).toHaveLength(2);
        expect(domains[0].position.y).toBeCloseTo(domains[1].position.y);
        expect(domains[1].position.x).toBeGreaterThan(
            domains[0].position.x + sizeOf(domains[0]).width,
        );
        expect(sizeOf(domains[0]).height).toBe(sizeOf(domains[1]).height);

        const domainASubGroups = result.nodes
            .filter(node => node.type === 'subGroup' && node.data.domain === 'domain-a')
            .sort((left, right) => left.position.y - right.position.y);
        expect(domainASubGroups).toHaveLength(2);
        expect(domainASubGroups[0].position.x).toBeCloseTo(domainASubGroups[1].position.x);

        const a1 = result.nodes.find(node => node.id === 'a-1');
        const a2 = result.nodes.find(node => node.id === 'a-2');
        expect(a1).toBeTruthy();
        expect(a2).toBeTruthy();
        expect(a1!.position.y).toBeCloseTo(a2!.position.y);
        expect(a2!.position.x).toBeGreaterThan(a1!.position.x + sizeOf(a1!).width);
    });

    it('orders shared port anchors without parsing structured node ids', () => {
        const nodes: ReactFlowNode[] = [
            {
                id: 'domain:source',
                position: { x: 10, y: 20 },
                style: { width: '120px', height: '60px' },
                data: {},
            },
            {
                id: 'target:left',
                position: { x: 200, y: 200 },
                style: { width: 40, height: 40 },
                data: {},
            },
            {
                id: 'target:right',
                position: { x: 400, y: 200 },
                style: { width: 40, height: 40 },
                data: {},
            },
        ];
        const edges: Edge[] = [
            {
                id: 'left-edge',
                source: 'domain:source',
                target: 'target:left',
                sourceHandle: 'bottom',
                targetHandle: 'top',
                data: {
                    computedPath: [
                        { x: 70, y: 80 },
                        { x: 70, y: 112 },
                        { x: 220, y: 112 },
                        { x: 220, y: 200 },
                    ],
                },
            },
            {
                id: 'right-edge',
                source: 'domain:source',
                target: 'target:right',
                sourceHandle: 'bottom',
                targetHandle: 'top',
                data: {
                    computedPath: [
                        { x: 70, y: 80 },
                        { x: 70, y: 112 },
                        { x: 420, y: 112 },
                        { x: 420, y: 200 },
                    ],
                },
            },
        ];

        reorderDomainDagrePortAnchors(edges, new Map(nodes.map(node => [node.id, node])));

        expect(computedPathOf(edges[0]).slice(0, 2)).toEqual([
            { x: 50, y: 80 },
            { x: 50, y: 112 },
        ]);
        expect(computedPathOf(edges[1]).slice(0, 2)).toEqual([
            { x: 90, y: 80 },
            { x: 90, y: 112 },
        ]);
    });

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
        } as unknown as import('../../types/layout').LayoutOptions);

        for (const domainKey of ['first-domain', 'second-domain']) {
            const domain = result.nodes.find(n => String(n.type) === 'titleGroup' && n.data.domain === domainKey);
            expect(domain).toBeTruthy();

            const subGroups = result.nodes
                .filter(n => String(n.type) === 'subGroup' && n.data.domain === domainKey)
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
        } as unknown as import('../../types/layout').LayoutOptions);

        const routed = result.edges.find(e => e.id === 'e3')!;
        const source = result.nodes.find(n => n.id === 'calc-theory-ratio')!;
        const target = result.nodes.find(n => n.id === 'sort-demand')!;
        const sourceAbs = absolutePositionOf(source, result.nodes);
        const targetAbs = absolutePositionOf(target, result.nodes);
        const sourceSize = sizeOf(source);
        const _targetSize = sizeOf(target);
        const computedPath = computedPathOf(routed);

        expect(routed.sourceHandle).toBe('right');
        expect(routed.targetHandle).toBe('left');
        expect(computedPath.length).toBeGreaterThanOrEqual(2);
        expect(Math.abs(computedPath[0].x - (sourceAbs.x + sourceSize.width + 1))).toBeLessThanOrEqual(1);
        expect(Math.abs(computedPath[computedPath.length - 1].x - (targetAbs.x - 1))).toBeLessThanOrEqual(1);
    });

    it('respects standard data group visibility options before laying out system interaction diagrams', async () => {
        const systemsFixture = fixtureData(systemsInteractionStandardData);
        const canvas = await standardDataToCanvas(systemsFixture);
        const expectedSubDomains = new Set(systemsFixture.layout?.subDomainWhitelist);

        const domainGroups = canvas.nodes.filter(
            node => String(node.type) === 'titleGroup'
        );
        const visibleSubGroups = canvas.nodes.filter(
            node => String(node.type) === 'subGroup' && node.data.hidden !== true
        );
        const hiddenGroups = canvas.nodes.filter(
            node => ['titleGroup', 'subGroup'].includes(String(node.type || '')) && node.data.hidden === true
        );
        const hiddenGroupIds = new Set(hiddenGroups.map(node => node.id));
        const visibleNodesParentedToHiddenGroups = canvas.nodes.filter(
            node => !node.hidden && node.parentId && hiddenGroupIds.has(String(node.parentId))
        );

        expect(domainGroups).toHaveLength(0);
        expect(hiddenGroups).toHaveLength(0);
        expect(visibleNodesParentedToHiddenGroups).toEqual([]);
        expect(new Set(visibleSubGroups.map(node => String(node.data.subDomain || '')))).toEqual(expectedSubDomains);
        expect(canvas.edges).toHaveLength(systemsFixture.edges.length);
        expect(canvas.edges.every(edge => edge.data?.algorithm === 'domain-dagre-simplified')).toBe(true);
    }, 15_000);

    it('keeps large standard conversions layout-compatible in interactive edge-routing mode', async () => {
        const wmsFixture = fixtureData(wmsProcessFlowStandardData);
        const canvas = await standardDataToCanvas(wmsFixture, undefined, {
            edgeRoutingQuality: 'interactive',
        });

        const hiddenGroups = canvas.nodes.filter(
            node => ['titleGroup', 'subGroup'].includes(String(node.type || '')) && node.data.hidden === true
        );
        const interactiveEdges = canvas.edges.filter(edge => edge.data?.algorithm === 'domain-dagre-interactive');
        const fanOutSources = new Set(['order-input', 'allocation', 'task-generate', 'task-group', 'operation']);
        const fanOutEdges = canvas.edges.filter(edge => fanOutSources.has(edge.source));
        const sharedTrunkFanOutEdges = fanOutEdges.filter(edge => edge.data?.sharedTrunkSynthesized === true);

        expect(canvas.nodes.length).toBeGreaterThanOrEqual(wmsFixture.nodes.length);
        expect(canvas.edges).toHaveLength(wmsFixture.edges.length);
        expect(hiddenGroups).toHaveLength(0);
        expect(interactiveEdges).toHaveLength(canvas.edges.length);
        expect(canvas.edges.every(edge => edge.data?.trunkPolishVersion === 2)).toBe(true);
        expect(sharedTrunkFanOutEdges.length).toBeGreaterThan(0);
        expect(canvas.edges.every(edge => Array.isArray(edge.data?.computedPath))).toBe(true);
        expect(canvas.edges.every(edge => edge.data?.layoutPathLocked === true)).toBe(true);
    }, 15_000);

    it('keeps reverse systems-interaction feedback off the forward target trunk in interactive mode', async () => {
        const canvas = await standardDataToCanvas(fixtureData(systemsInteractionStandardData), undefined, {
            edgeRoutingQuality: 'interactive',
        });
        const feedback = canvas.edges.find(edge => edge.id === 'edge-tms-execution-wms-outbound');
        const path = pathFor(canvas.edges, 'edge-tms-execution-wms-outbound');

        expect(feedback).toBeTruthy();
        expect(path.length).toBeGreaterThanOrEqual(2);
        expect(feedback?.sourceHandle).toBe('top');
        expect(feedback?.data?.autoSource).toBe(true);
        expect(path[1].y).toBeLessThan(path[0].y);
    }, 15_000);

    it('keeps WMS quota fan-out on the vertical process axis in horizontal subdomain dagre', async () => {
        const demandFixture = fixtureData(demandAllocation);
        const canvas = await standardDataToCanvas(demandFixture);
        const presetLayout = demandFixture.layout;

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
        } as unknown as import('../../types/layout').LayoutOptions);

        const visibleLeaves = result.nodes.filter(node => !['titleGroup', 'subGroup', 'group', 'domain'].includes(String(node.type ?? '')));
        const absoluteLeaves = visibleLeaves.map(node => ({ node, position: absolutePositionOf(node, result.nodes) }));
        const minimumY = Math.min(...absoluteLeaves.map(({ position }) => position.y));
        const maximumY = Math.max(...absoluteLeaves.map(({ node, position }) => position.y + sizeOf(node).height));
        expect(maximumY - minimumY).toBeLessThan(3_000);

        const fixQuota = result.nodes.find(n => n.id === 'fix-quota')!;
        const outgoing = result.edges.filter(e => e.source === 'fix-quota');
        expect(fixQuota).toBeTruthy();
        expect(outgoing.map(e => e.id).sort()).toEqual(['e10', 'e16']);

        for (const edge of outgoing) {
            const path = computedPathOf(edge);
            expect(edge.sourceHandle).toBe('bottom');
            expect(edge.data?.layoutPathLocked).toBe(true);
            expect(edge.data?.runtimeHandleLock).toMatchObject({ source: true, target: true });
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
        const poolAPath = computedPathOf(poolAEdge);
        expect(detectLocalDoglegRisks(poolAPath)).toEqual([]);
    }, 15_000);

    it('keeps WMS quota fan-out entering lower resource nodes from the top', async () => {
        const demandFixture = fixtureData(demandAllocation);
        const canvas = await standardDataToCanvas(demandFixture);
        const presetLayout = demandFixture.layout;

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
        } as unknown as import('../../types/layout').LayoutOptions);

        for (const edgeId of ['e10', 'e16']) {
            const edge = result.edges.find(e => e.id === edgeId)!;
            const target = result.nodes.find(n => n.id === edge.target)!;
            const targetAbs = absolutePositionOf(target, result.nodes);
            const targetSize = sizeOf(target);
            const path = computedPathOf(edge);
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

    it.each(['TB', 'LR'] as const)(
      'keeps every WMS demand-allocation route out of unrelated business nodes in %s',
      async (direction) => {
        const demandFixture = fixtureData(demandAllocation);
        const canvas = await standardDataToCanvas(demandFixture);
        const presetLayout = demandFixture.layout;

        const result = await new DomainDagreLayoutStrategy().calculateLayout(canvas.nodes, canvas.edges, {
            type: LayoutType.DAGRE,
            direction,
            nodeLayout: 'dagre',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'LR',
            subDomainNodeDirection: 'TB',
            domainOrder: presetLayout.domainOrder,
            subDomainOrder: presetLayout.subDomainOrder,
        } as unknown as import('../../types/layout').LayoutOptions);
        const obstacles = new Map(result.nodes.flatMap(candidate => {
            if (['titleGroup', 'subGroup', 'group', 'domain'].includes(String(candidate.type ?? ''))) return [];
            const position = (candidate as ReactFlowNode & { positionAbsolute?: PathPoint }).positionAbsolute
                ?? absolutePositionOf(candidate, result.nodes);
            return [[candidate.id, {
                x: position.x,
                y: position.y,
                width: sizeOf(candidate).width,
                height: sizeOf(candidate).height,
            }] as const];
        }));

        const hardObstacleHits = result.edges.flatMap(edge => {
            const hits = countUnrelatedObstacleHits(computedPathOf(edge), edge, obstacles);
            return hits > 0 ? [{ edgeId: edge.id, hits }] : [];
        });
        const unlockedComputedPaths = result.edges.flatMap(edge => {
            const hasPath = computedPathOf(edge).length >= 2;
            const hasRenderLock = edge.data?.layoutPathLocked === true
                || edge.data?._layoutPathLocked === true
                || String(edge.type ?? '').toLowerCase() === 'stablepath';
            return hasPath && !hasRenderLock ? [edge.id] : [];
        });
        expect(hardObstacleHits).toEqual([]);
        expect(unlockedComputedPaths).toEqual([]);
      },
      15_000,
    );

    it('separates Logistics TMS support and yard lanes after dagre routing', async () => {
        const logisticsFixture = fixtureData(logisticsStandardData);
        const canvas = await standardDataToCanvas(logisticsFixture);
        const presetLayout = logisticsFixture.layout;

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
        } as unknown as import('../../types/layout').LayoutOptions);

        const tmsBms = pathFor(result.edges, 'edge-tms-bms');
        const tmsYms = pathFor(result.edges, 'edge-tms-yms');
        const tmsVisibility = pathFor(result.edges, 'edge-tms-visibility');
        const wmsVisibility = pathFor(result.edges, 'edge-wms-visibility');

        expect(maxParallelOverlap(tmsBms, tmsYms)).toBeLessThan(24);
        expect(maxParallelOverlap(tmsVisibility, wmsVisibility)).toBeLessThan(96);
    }, 15_000);

    it('keeps cyclic Logistics domains hard-clean in ordered lane mode', async () => {
        const logisticsFixture = fixtureData(logisticsStandardData);
        const canvas = await standardDataToCanvas(logisticsFixture);
        const presetLayout = logisticsFixture.layout;
        const result = await new DomainDagreLayoutStrategy().calculateLayout(canvas.nodes, canvas.edges, {
            type: LayoutType.DAGRE,
            direction: 'LR',
            nodeLayout: 'dagre',
            domainPlacement: 'ordered-lanes',
            generateDomainGroups: true,
            generateSubDomainGroups: true,
            domainSubGroupDirection: 'LR',
            subDomainNodeDirection: 'LR',
            domainOrder: presetLayout.domainOrder,
            subDomainOrder: presetLayout.subDomainOrder,
        } as unknown as import('../../types/layout').LayoutOptions);
        // Keep the complete graph through the production layout transaction:
        // filtering before routing removes the peers that constrain hub ports.
        const cyclicLaneIds = new Set([
            'edge-loms-wms',
            'edge-loms-tms',
            'edge-loms-customs',
            'edge-tms-bms',
            'edge-tms-yms',
            'edge-tms-carrier',
            'edge-loms-visibility',
            'edge-wms-visibility',
            'edge-tms-visibility',
            'edge-tms-downstream',
        ]);
        const sourceEdges = prepareLayeredLayoutEdges(result.nodes, result.edges, 'LR', { promoteLockedComputedPath: true });
        const unseeded = sourceEdges.map(edge => ({ ...edge, data: clearBaseReactFlowLayoutEdgeRoutingData(edge.data) }));
        const projected = projectBaseReactFlowDisplayWorkerInput({ nodes: result.nodes, edges: unseeded });
        const seed = seedBaseReactFlowStagedLayoutEdges({ sourceNodes: result.nodes, sourceEdges });
        const fallback = seedBaseReactFlowStagedLayoutEdges({ sourceNodes: result.nodes, sourceEdges: unseeded });
        const candidatePatches = createBaseReactFlowDisplayEdgePatches(projected.edges, seed);
        const fallbackCandidatePatches = createBaseReactFlowDisplayEdgePatches(projected.edges, fallback);
        if (!candidatePatches || !fallbackCandidatePatches) throw new Error('Invalid layout candidate patches');
        const commonInput = { ...projected, enableSmartEdges: true, smartEdgePadding: 20, isLargeGraph: false };
        const identity = computeBaseReactFlowDisplayInputIdentityBundle(commonInput);
        const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
            ...commonInput, operation: 'repair-validate-or-route', requestId: 'cyclic-logistics-layout',
            candidatePatches, fallbackCandidatePatches, candidateSource: 'persistent', qualityMode: 'full',
            inputIdentity: createDisplayRoutingIdentity(identity.cacheSignature, identity.geometryDigest),
            displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch(projected),
        });
        expect(response.hardClean).toBe(true);
        expect(response.hardReport).toMatchObject({
            obstacleHits: 0, terminalsAttached: true, terminalsAnchored: true,
            minimumClearanceViolations: 0, commercialClearanceViolations: 0,
        });
        if (!response.edges) throw new Error('Expected complete Worker routing output');
        expect(response.edges.map(edge => edge.id).sort()).toEqual(result.edges.map(edge => edge.id).sort());
        const displayEdges = response.edges.filter(edge => cyclicLaneIds.has(edge.id));
        expect(displayEdges).toHaveLength(cyclicLaneIds.size);

        expect(nonOrthogonalSegments(displayEdges)).toEqual([]);
        expect(shortEndpointStubs(displayEdges, 48)).toEqual([]);
        const absoluteNodes = withDisplayAbsolutePositions(projected.nodes, new Map(projected.nodes.map(node => [node.id, node])));
        expect(getExactDisplayHardReport(displayEdges, absoluteNodes)).toMatchObject({
            obstacleHits: 0, terminalsAttached: true, terminalsAnchored: true,
        });
        const rawCrossings = findDisplayGeometricCrossingHits(displayEdges);
        const quality = calculateEdgePathQualityScore(displayEdges);
        // Centerline intersections are allowed only with the production
        // endpoint/bend clearance and an actual painted bridge at every hit.
        expect(rawCrossings.every(hit => isReadableOrthogonalCrossing(hit.a, hit.b))).toBe(true);
        expect(quality.strictCrossings).toBe(0);
        expect(quality.bridgedCrossings ?? 0).toBe(rawCrossings.length);
        assertPaintedCrossingCoverage(displayEdges);
    }, 15_000);

    it('distinguishes a painted ordinary crossing from a crossing beside a bend or endpoint', () => {
        for (const withBends of [false, true]) for (const x of [23, 24, 50, 76, 77]) {
            const edges: Edge[] = [
                { id: 'horizontal', source: 'a', target: 'b', data: { computedPath: withBends
                    ? [{ x: 0, y: -50 }, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 150 }]
                    : [{ x: 0, y: 50 }, { x: 100, y: 50 }] } },
                { id: 'vertical', source: 'c', target: 'd', data: { computedPath: [{ x, y: 0 }, { x, y: 100 }] } },
            ];
            const rawCrossings = findDisplayGeometricCrossingHits(edges);
            const quality = calculateEdgePathQualityScore(edges);
            expect(rawCrossings).toHaveLength(1);
            if (x >= 24 && x <= 76) {
                expect(quality).toMatchObject({ strictCrossings: 0, bridgedCrossings: 1 });
                assertPaintedCrossingCoverage(edges);
            } else {
                expect(quality.strictCrossings).toBe(1);
                expect(quality.bridgedCrossings ?? 0).toBe(0);
            }
        }
    });

    it('keeps Logistics explicit hub lanes displayable after standard conversion', async () => {
        const canvas = await standardDataToCanvas(fixtureData(logisticsStandardData));
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
            expect(edge?.data?.layoutPathLocked, edgeId).toBe(true);
            expect(displayById.get(edgeId)?.type, edgeId).toBe('stablePath');
        }

        const displayTmsBms = pathFor(displayEdges, 'edge-tms-bms');
        expect(axisOf(displayTmsBms[displayTmsBms.length - 2], displayTmsBms[displayTmsBms.length - 1])).toBe('v');
        expect(nonOrthogonalSegments(displayEdges)).toEqual([]);
        expect(shortEndpointStubs(displayEdges, 48)).toEqual([]);
        // Ordinary crossings may remain, but every crossing must have a real
        // painted bridge and none may violate the endpoint/bend safety policy.
        expect(calculateEdgePathQualityScore(displayEdges).strictCrossings).toBe(0);
        assertPaintedCrossingCoverage(displayEdges);
    }, 15_000);

    it('separates opposite-role Transport hub lanes after dagre routing', async () => {
        const transportFixture = fixtureData(transportDrivenStandardData);
        const canvas = await standardDataToCanvas(transportFixture);
        const presetLayout = transportFixture.layout;

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
        } as unknown as import('../../types/layout').LayoutOptions);

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
        const canvas = await standardDataToCanvas(fixtureData(transportDrivenStandardData));
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

        expect(canvas.edges.find(edge => edge.id === 'edge-oms-wms-inbound')?.data).toEqual(expect.objectContaining({
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
    return computedPathOf(edge);
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
