import type { Edge, Node } from '@xyflow/react';
import { evaluateLayoutGeometry } from '../../../algorithms/layoutGeometryConstraints';
import { isNodeMutationLocked } from '../nodeLockPolicy';

export type LayoutScopeMode = 'all' | 'selection' | 'selection-neighborhood';

export type LayoutScopeRequest = Readonly<{
    mode?: LayoutScopeMode;
    selectedNodeIds?: readonly string[];
    selectedEdgeIds?: readonly string[];
    neighborhoodDepth?: number;
}>;

export type LayoutScopeResolution = Readonly<{
    mode: LayoutScopeMode;
    status: 'all' | 'scoped' | 'empty-selection';
    nodes: Node[];
    edges: Edge[];
    seedNodeIds: ReadonlySet<string>;
    mutableNodeIds: ReadonlySet<string>;
    fixedNodeIds: ReadonlySet<string>;
    contextNodeIds: ReadonlySet<string>;
}>;

const MAX_SCOPE_IDS = 5_000;
const MAX_ID_LENGTH = 512;
const MAX_NEIGHBORHOOD_DEPTH = 3;
const GENERATED_CONTAINER_TYPES = new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']);

const coerceLayoutScopeMode = (value: unknown): LayoutScopeMode => (
    value === 'selection' || value === 'selection-neighborhood' ? value : 'all'
);

const isSafeId = (value: unknown): value is string => (
    typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_ID_LENGTH
    && !Array.from(value).some((char) => {
        const codePoint = char.codePointAt(0) ?? 0;
        return codePoint <= 0x1F || codePoint === 0x7F;
    })
);

const collectSafeIds = (values: readonly unknown[] | undefined): Set<string> => {
    const ids = new Set<string>();
    if (!Array.isArray(values)) return ids;
    for (const value of values) {
        if (ids.size >= MAX_SCOPE_IDS) break;
        if (isSafeId(value)) ids.add(value);
    }
    return ids;
};

const isGeneratedContainer = (node: Node): boolean => (
    typeof node.type === 'string' && GENERATED_CONTAINER_TYPES.has(node.type)
);

const collectDescendantIds = (nodes: readonly Node[], seedIds: ReadonlySet<string>): Set<string> => {
    const descendants = new Set<string>();
    let changed = true;
    while (changed) {
        changed = false;
        for (const node of nodes) {
            if (!node.parentId || descendants.has(node.id)) continue;
            if (!seedIds.has(node.parentId) && !descendants.has(node.parentId)) continue;
            descendants.add(node.id);
            changed = true;
        }
    }
    return descendants;
};

const collectAncestorIds = (nodeById: ReadonlyMap<string, Node>, nodeIds: ReadonlySet<string>): Set<string> => {
    const ancestors = new Set<string>();
    for (const id of nodeIds) {
        let parentId = nodeById.get(id)?.parentId;
        const seen = new Set([id]);
        while (parentId && !seen.has(parentId) && ancestors.size < MAX_SCOPE_IDS) {
            seen.add(parentId);
            ancestors.add(parentId);
            parentId = nodeById.get(parentId)?.parentId;
        }
    }
    return ancestors;
};

const collectIncidentNodeIds = (edges: readonly Edge[], edgeIds: ReadonlySet<string>): Set<string> => {
    const ids = new Set<string>();
    for (const edge of edges) {
        if (!edgeIds.has(edge.id)) continue;
        ids.add(edge.source);
        ids.add(edge.target);
    }
    return ids;
};

const expandNeighborhood = (
    seeds: ReadonlySet<string>,
    edges: readonly Edge[],
    depth: number,
): Set<string> => {
    const expanded = new Set(seeds);
    let frontier = new Set(seeds);
    for (let step = 0; step < depth; step++) {
        const next = new Set<string>();
        for (const edge of edges) {
            const touchesSource = frontier.has(edge.source);
            const touchesTarget = frontier.has(edge.target);
            if (!touchesSource && !touchesTarget) continue;
            if (!expanded.has(edge.source)) next.add(edge.source);
            if (!expanded.has(edge.target)) next.add(edge.target);
        }
        if (next.size === 0) break;
        for (const id of next) expanded.add(id);
        frontier = next;
    }
    return expanded;
};

const resolveSeedNodeIds = (
    nodes: readonly Node[],
    edges: readonly Edge[],
    request: LayoutScopeRequest,
): Set<string> => {
    const seedIds = collectSafeIds(request.selectedNodeIds);
    if (seedIds.size === 0 && request.selectedNodeIds === undefined) {
        for (const node of nodes) {
            if (seedIds.size >= MAX_SCOPE_IDS) break;
            if (node.selected === true && isSafeId(node.id)) seedIds.add(node.id);
        }
    }
    const selectedEdgeIds = collectSafeIds(request.selectedEdgeIds);
    for (const id of collectIncidentNodeIds(edges, selectedEdgeIds)) {
        if (seedIds.size >= MAX_SCOPE_IDS) break;
        seedIds.add(id);
    }
    return seedIds;
};

/**
 * Resolves a safe subgraph for future selection/neighborhood layout commands.
 * Generated containers and locked nodes are retained as context/anchors rather
 * than treated as mutable layout subjects.
 */
export const resolveLayoutScope = (
    nodes: readonly Node[],
    edges: readonly Edge[],
    request: LayoutScopeRequest | undefined,
): LayoutScopeResolution => {
    const mode = coerceLayoutScopeMode(request?.mode);
    if (mode === 'all') {
        const allIds = new Set(nodes.map(node => node.id));
        return {
            mode,
            status: 'all',
            nodes: [...nodes],
            edges: [...edges],
            seedNodeIds: allIds,
            mutableNodeIds: new Set(nodes.filter(node => !isGeneratedContainer(node) && !isNodeMutationLocked(node)).map(node => node.id)),
            fixedNodeIds: new Set(nodes.filter(isNodeMutationLocked).map(node => node.id)),
            contextNodeIds: new Set(nodes.filter(isGeneratedContainer).map(node => node.id)),
        };
    }

    const nodeById = new Map(nodes.map(node => [node.id, node] as const));
    const validNodeIds = new Set(nodeById.keys());
    const initialSeeds = resolveSeedNodeIds(nodes, edges, request ?? {});
    const seedNodeIds = new Set([...initialSeeds].filter(id => validNodeIds.has(id)));
    if (seedNodeIds.size === 0) {
        return {
            mode,
            status: 'empty-selection',
            nodes: [],
            edges: [],
            seedNodeIds,
            mutableNodeIds: new Set(),
            fixedNodeIds: new Set(),
            contextNodeIds: new Set(),
        };
    }

    const rawDepth = Number.isFinite(request?.neighborhoodDepth)
        ? Number(request?.neighborhoodDepth)
        : 1;
    const depth = mode === 'selection-neighborhood'
        ? Math.min(MAX_NEIGHBORHOOD_DEPTH, Math.max(1, Math.floor(rawDepth)))
        : 0;
    const expandedNodeIds = depth > 0 ? expandNeighborhood(seedNodeIds, edges, depth) : new Set(seedNodeIds);
    for (const id of collectDescendantIds(nodes, expandedNodeIds)) expandedNodeIds.add(id);

    const fixedNodeIds = new Set<string>();
    const mutableNodeIds = new Set<string>();
    for (const id of expandedNodeIds) {
        const node = nodeById.get(id);
        if (!node) continue;
        if (isGeneratedContainer(node) || isNodeMutationLocked(node)) {
            fixedNodeIds.add(id);
        } else {
            mutableNodeIds.add(id);
        }
    }

    const contextNodeIds = collectAncestorIds(nodeById, expandedNodeIds);
    for (const id of expandedNodeIds) {
        const node = nodeById.get(id);
        if (node && isGeneratedContainer(node)) contextNodeIds.add(id);
    }
    const includedNodeIds = new Set([...mutableNodeIds, ...fixedNodeIds, ...contextNodeIds]);
    const scopedNodes = nodes.filter(node => includedNodeIds.has(node.id));
    const scopedEdges = edges.filter(edge => includedNodeIds.has(edge.source) && includedNodeIds.has(edge.target));

    return {
        mode,
        status: 'scoped',
        nodes: scopedNodes,
        edges: scopedEdges,
        seedNodeIds,
        mutableNodeIds,
        fixedNodeIds,
        contextNodeIds,
    };
};

const finiteCoordinate = (value: unknown): number | null => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
);

const finitePosition = (position: Node['position'] | undefined): Node['position'] => ({
    x: finiteCoordinate(position?.x) ?? 0,
    y: finiteCoordinate(position?.y) ?? 0,
});

const resolveAbsolutePosition = (
    node: Node,
    nodeById: ReadonlyMap<string, Node>,
    seen: ReadonlySet<string> = new Set(),
): Node['position'] => {
    const local = finitePosition(node.position);
    if (!node.parentId || seen.has(node.parentId)) return local;
    const parent = nodeById.get(node.parentId);
    if (!parent) return local;
    const parentPosition = resolveAbsolutePosition(parent, nodeById, new Set([...seen, node.id]));
    return { x: parentPosition.x + local.x, y: parentPosition.y + local.y };
};

const toOriginalCoordinateSpace = (
    originalNode: Node,
    candidateNode: Node,
    originalById: ReadonlyMap<string, Node>,
): Node['position'] => {
    const candidateAbsolute = finitePosition(candidateNode.position);
    if (!originalNode.parentId) return candidateAbsolute;
    const parent = originalById.get(originalNode.parentId);
    if (!parent) return candidateAbsolute;
    const parentAbsolute = resolveAbsolutePosition(parent, originalById);
    return {
        x: candidateAbsolute.x - parentAbsolute.x,
        y: candidateAbsolute.y - parentAbsolute.y,
    };
};

export type ScopedLayoutMergeInput = Readonly<{
    allNodes: readonly Node[];
    allEdges: readonly Edge[];
    scope: LayoutScopeResolution;
    candidateNodes: readonly Node[];
    candidateEdges: readonly Edge[];
}>;

/**
 * Merges a scoped layout candidate back into the full graph. Only mutable
 * scoped nodes receive new positions; locked nodes, generated containers, and
 * all out-of-scope nodes remain anchored in the original graph. Candidate edge
 * routing is accepted only for edges whose endpoints are fully inside scope.
 */
export const mergeScopedLayoutResult = ({
    allNodes,
    allEdges,
    scope,
    candidateNodes,
    candidateEdges,
}: ScopedLayoutMergeInput): { nodes: Node[]; edges: Edge[] } => {
    if (scope.status === 'all') {
        return { nodes: [...candidateNodes], edges: [...candidateEdges] };
    }
    if (scope.status === 'empty-selection') {
        return { nodes: [...allNodes], edges: [...allEdges] };
    }

    const originalById = new Map(allNodes.map(node => [node.id, node] as const));
    const candidateById = new Map(candidateNodes.map(node => [node.id, node] as const));
    const nodes = allNodes.map((node) => {
        if (!scope.mutableNodeIds.has(node.id)) return node;
        const candidate = candidateById.get(node.id);
        if (!candidate) return node;
        const nextPosition = toOriginalCoordinateSpace(node, candidate, originalById);
        const currentPosition = finitePosition(node.position);
        if (currentPosition.x === nextPosition.x && currentPosition.y === nextPosition.y) return node;
        return { ...node, position: nextPosition } as Node;
    });

    const scopedIds = new Set([
        ...scope.mutableNodeIds,
        ...scope.fixedNodeIds,
        ...scope.contextNodeIds,
    ]);
    const candidateEdgeById = new Map(candidateEdges.map(edge => [edge.id, edge] as const));
    const edges = allEdges.map((edge) => {
        if (!scopedIds.has(edge.source) || !scopedIds.has(edge.target)) return edge;
        return candidateEdgeById.get(edge.id) ?? edge;
    });

    const originalReport = evaluateLayoutGeometry(allNodes);
    const mergedReport = evaluateLayoutGeometry(nodes);
    if (originalReport.clean && !mergedReport.clean) {
        return { nodes: [...allNodes], edges: [...allEdges] };
    }

    return { nodes, edges };
};
