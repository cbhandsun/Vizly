const GLOBAL_FULL_GRAPH_LAYOUT_STRATEGIES = new Set([
    'tree',
    'force',
    'domain-elk',
    'elk',
]);

/**
 * Full-graph layouts intentionally flatten generated domain containers while
 * they are active. Domain-aware layouts instead compose container placement
 * with the remembered domain-internal node arrangement.
 */
export const isGlobalFullGraphLayoutStrategy = (strategyName?: string): boolean => (
    Boolean(strategyName && GLOBAL_FULL_GRAPH_LAYOUT_STRATEGIES.has(strategyName))
);

export const usesSelectableDomainNodeArrangement = (strategyName?: string): boolean => (
    strategyName === 'domain-vertical'
    || strategyName === 'domain-horizontal'
);

export const isOrderedDomainLaneLayoutStrategy = (strategyName?: string): boolean => (
    strategyName === 'domain-lanes'
);

export const resolveLayoutDomainOrder = (
    strategyName: string | undefined,
    explicitOrder: string[] | undefined,
    implicitOrder: string[],
): string[] | undefined => {
    if (explicitOrder) return explicitOrder;
    return isOrderedDomainLaneLayoutStrategy(strategyName) ? undefined : implicitOrder;
};
