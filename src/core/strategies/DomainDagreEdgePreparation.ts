import type { Edge } from '@xyflow/react';
import type { LayoutOptions } from '../types/layout';
import { prepareDomainDagreInteractiveEdges } from './domainDagreInteractiveEdgePreparation';
import { routingNodeSize, type RoutingNode } from './domainDagreEdgePreparationSupport';

export interface DomainDagreEdgePreparationInput {
    nodes: RoutingNode[];
    edges: Edge[];
    options: LayoutOptions;
    config: unknown;
    nodeById: Map<string, RoutingNode>;
    leafNodes: RoutingNode[];
}

export async function prepareDomainDagreEdges({
    nodes: updatedNodes,
    edges,
    options,
    config: cfg,
    nodeById: idMap,
    leafNodes,
}: DomainDagreEdgePreparationInput): Promise<Edge[]> {
    const getAbsPos = (n: RoutingNode): { x: number, y: number } => {
        let x = n.position.x;
        let y = n.position.y;
        let current = n;
        let depth = 0;
        while (current.parentId && depth < 10) {
            const parent = idMap.get(current.parentId);
            if (!parent) break;
            x += parent.position.x;
            y += parent.position.y;
            current = parent;
            depth++;
        }
        return { x, y };
    };

    // 确保所有节点有 positionAbsolute、width、height 和 measured
    updatedNodes.forEach(n => {
        const absPos = getAbsPos(n);
        n.positionAbsolute = absPos;

        // normalizeDomainDagreNodes has already bounded the measured geometry.
        // Preserve it for the hidden routing transaction so React Flow does not
        // invalidate the committed snapshot when it measures the same nodes.
        const size = routingNodeSize(n, 200, 80);
        // React Flow publishes DOM measurements through integer-valued
        // offset dimensions. Canonicalize the hidden lane geometry the same
        // way so subpixel container sizes do not invalidate a clean route.
        const w = Math.max(1, Math.round(size.width));
        const h = Math.max(1, Math.round(size.height));
        n.width = w;
        n.height = h;
        n.measured = { width: w, height: h };
    });

    // 克隆 edges 以确保 React 能检测到修改
    // Sort edges by source then target to ensure consistent processing order for "bus" optimization
    // [FIX] Clear stale computedPath from previous layouts so EdgeRouter always recomputes fresh.
    // Without this, the old C-shaped path would be preserved across layout runs.
    const clonedEdges = edges
        .map(e => ({
            ...e,
            data: e.data ? { ...e.data as object, computedPath: undefined } : e.data
        }))
        .sort((a, b) => {
            const sComp = a.source.localeCompare(b.source);
            if (sComp !== 0) return sComp;
            return a.target.localeCompare(b.target);
        });

    const edgeRoutingQuality = String(options.edgeRoutingQuality ?? 'full');
    if (edgeRoutingQuality === 'interactive') {
        return prepareDomainDagreInteractiveEdges({
            nodes: updatedNodes,
            edges: clonedEdges,
            options,
            nodeById: idMap,
        });
    }


    const { prepareDomainDagreFullEdges } = await import('./domainDagreFullEdgePreparation');
    return prepareDomainDagreFullEdges({ nodes: updatedNodes, edges: clonedEdges, options, config: cfg,
        nodeById: idMap, leafNodes });
}
