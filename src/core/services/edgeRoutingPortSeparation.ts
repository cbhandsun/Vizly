import type {
    PathFindingJob,
    Rectangle,
    SharedGraphContext,
} from '../types/routing';

type PortSide = 'left' | 'right' | 'top' | 'bottom';

type CachedRoutingJob = Partial<PathFindingJob> & {
    source: string;
    target: string;
};

export type CachedRoutingRequests = ReadonlyMap<
    string,
    { request?: { job?: CachedRoutingJob } }
>;

interface RoutingGraphNode {
    id: string;
    position?: { x?: number; y?: number };
    measured?: { width?: number; height?: number };
    width?: number;
    height?: number;
    parentId?: string;
    parentNode?: string;
    positionAbsolute?: { x?: number; y?: number };
    computed?: { positionAbsolute?: { x?: number; y?: number } };
}

interface EdgeDescriptor {
    edgeId: string;
    source: string;
    target: string;
    isOneToMany: boolean;
    isManyToOne: boolean;
    sourceRect: Rectangle;
    targetRect: Rectangle;
    actualOutSide?: PortSide;
    actualInSide?: PortSide;
}

const finiteNumber = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveNumber = (value: unknown, fallback: number): number => {
    const parsed = finiteNumber(value, fallback);
    return parsed > 0 ? parsed : fallback;
};

const normalizePortSide = (value: unknown): PortSide | undefined => {
    const normalized = typeof value === 'string' ? value.toLowerCase() : '';
    return normalized === 'left'
        || normalized === 'right'
        || normalized === 'top'
        || normalized === 'bottom'
        ? normalized
        : undefined;
};

export const inferRoutingPortSide = (
    sourceRect: Rectangle,
    targetRect: Rectangle,
    role: 'source' | 'target',
): PortSide => {
    const sourceCenterX = sourceRect.x + sourceRect.width / 2;
    const sourceCenterY = sourceRect.y + sourceRect.height / 2;
    const targetCenterX = targetRect.x + targetRect.width / 2;
    const targetCenterY = targetRect.y + targetRect.height / 2;
    const deltaX = targetCenterX - sourceCenterX;
    const deltaY = targetCenterY - sourceCenterY;

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        return role === 'source'
            ? (deltaX >= 0 ? 'right' : 'left')
            : (deltaX >= 0 ? 'left' : 'right');
    }

    return role === 'source'
        ? (deltaY >= 0 ? 'bottom' : 'top')
        : (deltaY >= 0 ? 'top' : 'bottom');
};

const createNodeRectResolver = (graph: SharedGraphContext) => {
    const nodes = (Array.isArray(graph.nodes) ? graph.nodes : []) as RoutingGraphNode[];
    const nodeMap = new Map(
        nodes
            .filter(node => node && typeof node.id === 'string' && node.id.length > 0)
            .map(node => [node.id, node] as const),
    );
    const absolutePositionCache = new Map<string, { x: number; y: number }>();

    const resolveAbsolutePosition = (
        node: RoutingGraphNode,
        visiting: Set<string> = new Set(),
    ): { x: number; y: number } => {
        const cached = absolutePositionCache.get(node.id);
        if (cached) return cached;

        const localPosition = {
            x: finiteNumber(node.position?.x, 0),
            y: finiteNumber(node.position?.y, 0),
        };
        const parentId = node.parentId || node.parentNode;

        if (parentId && !visiting.has(node.id)) {
            const parent = nodeMap.get(parentId);
            if (parent && parent.id !== node.id) {
                const nextVisiting = new Set(visiting);
                nextVisiting.add(node.id);
                if (!nextVisiting.has(parent.id)) {
                    const parentPosition = resolveAbsolutePosition(parent, nextVisiting);
                    const resolved = {
                        x: parentPosition.x + localPosition.x,
                        y: parentPosition.y + localPosition.y,
                    };
                    absolutePositionCache.set(node.id, resolved);
                    return resolved;
                }
            }
        }

        const absolute = node.positionAbsolute ?? node.computed?.positionAbsolute;
        const resolved = absolute
            ? {
                x: finiteNumber(absolute.x, localPosition.x),
                y: finiteNumber(absolute.y, localPosition.y),
            }
            : localPosition;
        absolutePositionCache.set(node.id, resolved);
        return resolved;
    };

    return (nodeId: string): Rectangle | undefined => {
        const node = nodeMap.get(nodeId);
        if (!node) return undefined;
        const position = resolveAbsolutePosition(node);
        return {
            x: position.x,
            y: position.y,
            width: positiveNumber(node.width ?? node.measured?.width, 150),
            height: positiveNumber(node.height ?? node.measured?.height, 80),
        };
    };
};

const getTrunkPortSides = (
    job: CachedRoutingJob,
): { outSide?: PortSide; inSide?: PortSide } => {
    const routingJob = job as PathFindingJob & { trunkPort?: unknown };
    const oneToManyPort = routingJob.o2mTrunkPort
        || (routingJob.isOneToMany ? routingJob.trunkPort : undefined);
    const manyToOnePort = routingJob.m2oTrunkPort
        || (routingJob.isManyToOne ? routingJob.trunkPort : undefined);

    return {
        outSide: normalizePortSide(oneToManyPort),
        inSide: normalizePortSide(manyToOnePort),
    };
};

const collectEdgeDescriptors = (
    eligibleJobs: PathFindingJob[],
    graph: SharedGraphContext,
    cachedRequests: CachedRoutingRequests,
): EdgeDescriptor[] => {
    const currentJobIds = new Set(eligibleJobs.map(job => job.edgeId));
    const resolveNodeRect = createNodeRectResolver(graph);
    const descriptors: EdgeDescriptor[] = eligibleJobs.map(job => {
        const portSides = getTrunkPortSides(job);
        return {
            edgeId: job.edgeId,
            source: job.source,
            target: job.target,
            isOneToMany: !!job.isOneToMany,
            isManyToOne: !!job.isManyToOne,
            sourceRect: job.sourceRect!,
            targetRect: job.targetRect!,
            actualOutSide: portSides.outSide,
            actualInSide: portSides.inSide,
        };
    });

    for (const [edgeId, cached] of cachedRequests) {
        if (currentJobIds.has(edgeId)) continue;
        const job = cached?.request?.job;
        if (!job || typeof job.source !== 'string' || typeof job.target !== 'string') continue;
        const sourceRect = resolveNodeRect(job.source);
        const targetRect = resolveNodeRect(job.target);
        if (!sourceRect || !targetRect) continue;
        const portSides = getTrunkPortSides(job);
        descriptors.push({
            edgeId,
            source: job.source,
            target: job.target,
            isOneToMany: !!job.isOneToMany,
            isManyToOne: !!job.isManyToOne,
            sourceRect,
            targetRect,
            actualOutSide: portSides.outSide,
            actualInSide: portSides.inSide,
        });
    }

    return descriptors;
};

const groupBusEdges = (
    edges: EdgeDescriptor[],
    side: PortSide,
    direction: 'out' | 'in',
    jobByEdgeId: ReadonlyMap<string, PathFindingJob>,
    cachedRequests: CachedRoutingRequests,
): Map<string, EdgeDescriptor[]> => {
    const groups = new Map<string, EdgeDescriptor[]>();

    for (const edge of edges) {
        const job = jobByEdgeId.get(edge.edgeId)
            ?? cachedRequests.get(edge.edgeId)?.request?.job;
        const pathJob = job as (PathFindingJob & {
            o2mPeerGroupKey?: string;
            m2oPeerGroupKey?: string;
            peerGroupKey?: string;
        }) | undefined;
        const isOutgoing = direction === 'out';
        const trunkCoordinate = Math.round(
            finiteNumber(
                isOutgoing
                    ? pathJob?.busTrunkSource?.x ?? pathJob?.busTrunkTarget?.x
                    : pathJob?.busTrunkTarget?.x ?? pathJob?.busTrunkSource?.x,
                0,
            ) * 10,
        );
        const groupKey = isOutgoing
            ? pathJob?.o2mPeerGroupKey
                ?? pathJob?.peerGroupKey
                ?? `implicit-o2m:${edge.source}:${side}:${trunkCoordinate}`
            : pathJob?.m2oPeerGroupKey
                ?? pathJob?.busRoutingPlan?.m2oPeerGroupKey
                ?? pathJob?.peerGroupKey
                ?? `implicit-m2o:${edge.target}:${side}:${trunkCoordinate}`;
        const group = groups.get(groupKey) ?? [];
        group.push(edge);
        groups.set(groupKey, group);
    }

    return groups;
};

const sortGroupKeysByPeerCoordinate = (
    groups: ReadonlyMap<string, EdgeDescriptor[]>,
    peerCoordinate: (edge: EdgeDescriptor) => number,
): string[] => [...groups.keys()].sort((leftKey, rightKey) => {
    const leftEdges = groups.get(leftKey) ?? [];
    const rightEdges = groups.get(rightKey) ?? [];
    const leftCenter = leftEdges.reduce((sum, edge) => sum + peerCoordinate(edge), 0)
        / Math.max(1, leftEdges.length);
    const rightCenter = rightEdges.reduce((sum, edge) => sum + peerCoordinate(edge), 0)
        / Math.max(1, rightEdges.length);
    return leftCenter - rightCenter || leftKey.localeCompare(rightKey);
});

/**
 * Separates incoming and outgoing edge ports that occupy the same node side.
 *
 * The function mutates only jobs from the current batch. Cached requests provide
 * sibling-edge context but are never modified.
 */
export const assignSameSidePortSeparation = (
    jobs: PathFindingJob[],
    graph: SharedGraphContext,
    cachedRequests: CachedRoutingRequests = new Map(),
): void => {
    const eligibleJobs = jobs.filter(job => job?.sourceRect && job?.targetRect);
    if (eligibleJobs.length === 0) return;

    const currentJobIds = new Set(eligibleJobs.map(job => job.edgeId));
    const jobByEdgeId = new Map(eligibleJobs.map(job => [job.edgeId, job] as const));
    const allEdges = collectEdgeDescriptors(eligibleJobs, graph, cachedRequests);
    const buckets = new Map<string, { outEdges: EdgeDescriptor[]; inEdges: EdgeDescriptor[] }>();

    const getBucket = (nodeId: string, side: PortSide) => {
        const key = `${nodeId}::${side}`;
        const bucket = buckets.get(key) ?? { outEdges: [], inEdges: [] };
        buckets.set(key, bucket);
        return bucket;
    };

    for (const edge of allEdges) {
        const outSide = edge.actualOutSide
            ?? inferRoutingPortSide(edge.sourceRect, edge.targetRect, 'source');
        const inSide = edge.actualInSide
            ?? inferRoutingPortSide(edge.sourceRect, edge.targetRect, 'target');
        getBucket(edge.source, outSide).outEdges.push(edge);
        getBucket(edge.target, inSide).inEdges.push(edge);
    }

    for (const [bucketKey, { outEdges, inEdges }] of buckets) {
        const side = bucketKey.slice(bucketKey.indexOf('::') + 2) as PortSide;
        const peerCoordinate = (edge: EdgeDescriptor, asSource: boolean): number => {
            const rect = asSource ? edge.targetRect : edge.sourceRect;
            return side === 'top' || side === 'bottom'
                ? rect.x + rect.width / 2
                : rect.y + rect.height / 2;
        };

        const outHubCounts = new Map<string, number>();
        const inHubCounts = new Map<string, number>();
        outEdges.forEach(edge => outHubCounts.set(
            edge.source,
            (outHubCounts.get(edge.source) ?? 0) + 1,
        ));
        inEdges.forEach(edge => inHubCounts.set(
            edge.target,
            (inHubCounts.get(edge.target) ?? 0) + 1,
        ));

        const isOutSharedHub = (edge: EdgeDescriptor) =>
            edge.isOneToMany || (outHubCounts.get(edge.source) ?? 0) > 1;
        const isInSharedHub = (edge: EdgeDescriptor) =>
            edge.isManyToOne || (inHubCounts.get(edge.target) ?? 0) > 1;
        const outSoloEdges = outEdges.filter(edge => !isOutSharedHub(edge));
        const inSoloEdges = inEdges.filter(edge => !isInSharedHub(edge));
        const outBusEdges = outEdges.filter(isOutSharedHub);
        const inBusEdges = inEdges.filter(isInSharedHub);

        for (const edge of outBusEdges) {
            const job = currentJobIds.has(edge.edgeId) ? jobByEdgeId.get(edge.edgeId) : undefined;
            if (job && !job.isOneToMany && (outHubCounts.get(edge.source) ?? 0) > 1) {
                job.isOneToMany = true;
            }
        }
        for (const edge of inBusEdges) {
            const job = currentJobIds.has(edge.edgeId) ? jobByEdgeId.get(edge.edgeId) : undefined;
            if (job && !job.isManyToOne && (inHubCounts.get(edge.target) ?? 0) > 1) {
                job.isManyToOne = true;
            }
        }

        const outBusGroups = groupBusEdges(
            outBusEdges,
            side,
            'out',
            jobByEdgeId,
            cachedRequests,
        );
        const inBusGroups = groupBusEdges(
            inBusEdges,
            side,
            'in',
            jobByEdgeId,
            cachedRequests,
        );
        const outSlotCount = outBusGroups.size + outSoloEdges.length;
        const inSlotCount = inBusGroups.size + inSoloEdges.length;
        const hasOut = outEdges.length > 0;
        const hasIn = inEdges.length > 0;

        const assignBusGroups = (
            groups: ReadonlyMap<string, EdgeDescriptor[]>,
            groupKeys: string[],
            direction: 'out' | 'in',
            totalSlots: number,
            baseIndex: number,
            preserveFrozenPort = true,
        ) => {
            groupKeys.forEach((groupKey, groupIndex) => {
                for (const edge of groups.get(groupKey) ?? []) {
                    if (!currentJobIds.has(edge.edgeId)) continue;
                    const job = jobByEdgeId.get(edge.edgeId);
                    if (!job) continue;
                    const portFrozen = preserveFrozenPort && !!job.busRoutingPlan?.portFrozen;
                    if (direction === 'out') {
                        if (!portFrozen) job.outgoingCount = totalSlots;
                        job.outgoingIndex = portFrozen
                            ? (job.outgoingIndex ?? 0) + baseIndex
                            : baseIndex + groupIndex;
                    } else {
                        if (!portFrozen) job.incomingCount = totalSlots;
                        job.incomingIndex = portFrozen
                            ? (job.incomingIndex ?? 0) + baseIndex
                            : baseIndex + groupIndex;
                    }
                }
            });
        };

        if (hasOut && hasIn) {
            const totalSlots = outSlotCount + inSlotCount;
            const outCentroid = outEdges.reduce(
                (sum, edge) => sum + peerCoordinate(edge, true),
                0,
            ) / outEdges.length;
            const inCentroid = inEdges.reduce(
                (sum, edge) => sum + peerCoordinate(edge, false),
                0,
            ) / inEdges.length;
            const outFirst = outCentroid <= inCentroid;
            const outBase = outFirst ? 0 : inSlotCount;
            const inBase = outFirst ? outSlotCount : 0;
            const outGroupKeys = sortGroupKeysByPeerCoordinate(
                outBusGroups,
                edge => peerCoordinate(edge, true),
            );
            const inGroupKeys = sortGroupKeysByPeerCoordinate(
                inBusGroups,
                edge => peerCoordinate(edge, false),
            );

            assignBusGroups(outBusGroups, outGroupKeys, 'out', totalSlots, outBase);
            assignBusGroups(inBusGroups, inGroupKeys, 'in', totalSlots, inBase);

            [...outSoloEdges]
                .sort((left, right) =>
                    peerCoordinate(left, true) - peerCoordinate(right, true)
                    || left.edgeId.localeCompare(right.edgeId))
                .forEach((edge, index) => {
                    const job = jobByEdgeId.get(edge.edgeId);
                    if (!job) return;
                    job.outgoingCount = totalSlots;
                    job.outgoingIndex = outBase + outBusGroups.size + index;
                });
            [...inSoloEdges]
                .sort((left, right) =>
                    peerCoordinate(left, false) - peerCoordinate(right, false)
                    || left.edgeId.localeCompare(right.edgeId))
                .forEach((edge, index) => {
                    const job = jobByEdgeId.get(edge.edgeId);
                    if (!job) return;
                    job.incomingCount = totalSlots;
                    job.incomingIndex = inBase + inBusGroups.size + index;
                });
        } else if (hasOut && outBusGroups.size === 1 && outSoloEdges.length === 0) {
            assignBusGroups(outBusGroups, [...outBusGroups.keys()], 'out', 1, 0, false);
        } else if (hasIn && inBusGroups.size === 1 && inSoloEdges.length === 0) {
            assignBusGroups(inBusGroups, [...inBusGroups.keys()], 'in', 1, 0, false);
        } else if (hasOut && outSoloEdges.length >= 2) {
            [...outSoloEdges]
                .sort((left, right) =>
                    peerCoordinate(left, true) - peerCoordinate(right, true)
                    || left.edgeId.localeCompare(right.edgeId))
                .forEach((edge, index) => {
                    const job = jobByEdgeId.get(edge.edgeId);
                    if (!job) return;
                    job.outgoingCount = outSlotCount;
                    job.outgoingIndex = outBusGroups.size + index;
                });
        } else if (hasIn && inSoloEdges.length >= 2) {
            [...inSoloEdges]
                .sort((left, right) =>
                    peerCoordinate(left, false) - peerCoordinate(right, false)
                    || left.edgeId.localeCompare(right.edgeId))
                .forEach((edge, index) => {
                    const job = jobByEdgeId.get(edge.edgeId);
                    if (!job) return;
                    job.incomingCount = inSlotCount;
                    job.incomingIndex = inBusGroups.size + index;
                });
        } else if (hasOut && outBusGroups.size >= 2) {
            assignBusGroups(
                outBusGroups,
                [...outBusGroups.keys()].sort(),
                'out',
                outSlotCount,
                0,
                false,
            );
        } else if (hasIn && inBusGroups.size >= 2) {
            assignBusGroups(
                inBusGroups,
                sortGroupKeysByPeerCoordinate(
                    inBusGroups,
                    edge => peerCoordinate(edge, false),
                ),
                'in',
                inSlotCount,
                0,
                false,
            );
        }
    }

    for (const job of eligibleJobs) {
        if ((job.outgoingCount ?? 0) > 1 || (job.incomingCount ?? 0) > 1) {
            job.bidirectionalChannel = undefined;
            job.bidirectionalSpacing = undefined;
        }
    }
};
