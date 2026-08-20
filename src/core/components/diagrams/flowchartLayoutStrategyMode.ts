const GLOBAL_FULL_GRAPH_LAYOUT_STRATEGIES = new Set([
    'tree',
    'force',
    'domain-elk',
    'elk',
]);

export type FlowchartDomainLayoutDirection = 'TB' | 'LR';
export type FlowchartDomainNodeArrangement =
    | 'flow'
    | 'grid'
    | 'horizontal'
    | 'vertical'
    | 'dagre';

export interface FlowchartCustomDomainLayoutCommand {
    direction: FlowchartDomainLayoutDirection;
    nodeLayout: FlowchartDomainNodeArrangement;
    strategyName: 'domain-vertical' | 'domain-horizontal';
}

const DOMAIN_NODE_ARRANGEMENTS = new Set<FlowchartDomainNodeArrangement>([
    'flow',
    'grid',
    'horizontal',
    'vertical',
    'dagre',
]);

export const coerceFlowchartDomainNodeArrangement = (
    value: string | undefined,
): FlowchartDomainNodeArrangement => (
    value && DOMAIN_NODE_ARRANGEMENTS.has(value as FlowchartDomainNodeArrangement)
        ? value as FlowchartDomainNodeArrangement
        : 'dagre'
);

export const resolveCustomDomainLayoutDirection = (
    strategyName?: string,
    direction?: FlowchartDomainLayoutDirection,
): FlowchartDomainLayoutDirection => (
    strategyName === 'domain-horizontal' || direction === 'LR' ? 'LR' : 'TB'
);

/**
 * Domain direction and domain-internal node arrangement form one composable
 * layout command. The strategy name is an implementation detail selected from
 * the requested direction, rather than an independent user-facing choice.
 */
export const createCustomDomainLayoutCommand = (
    direction: FlowchartDomainLayoutDirection,
    nodeLayout: string | undefined,
): FlowchartCustomDomainLayoutCommand => ({
    direction,
    nodeLayout: coerceFlowchartDomainNodeArrangement(nodeLayout),
    strategyName: direction === 'LR' ? 'domain-horizontal' : 'domain-vertical',
});

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

export const resolveDomainLayoutRoutingQuality = (
    strategyName?: string,
): 'interactive' | undefined => (
    isOrderedDomainLaneLayoutStrategy(strategyName) ? 'interactive' : undefined
);

export const shouldPromoteDomainDagreRouteCandidate = (
    strategyName?: string,
): boolean => !isOrderedDomainLaneLayoutStrategy(strategyName);
