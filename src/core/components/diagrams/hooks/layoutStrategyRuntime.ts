import type { ILayoutStrategy } from '../../../types/layout-strategy';

export const LAYERED_TREE_ROUTING_SPACING = Object.freeze({
    // Same-rank edges also need two 48px terminal stubs.
    nodeSpacing: 120,
    // Two 48px commercial terminal stubs plus a 24px shared channel.
    levelSpacing: 120,
});

let domainElkStrategyPromise: Promise<ILayoutStrategy> | undefined;
let domainCompoundElkStrategyPromise: Promise<ILayoutStrategy> | undefined;

export const loadDomainElkStrategy = (): Promise<ILayoutStrategy> => {
    domainElkStrategyPromise ??= import('../../../strategies/DomainElkLayoutStrategy')
        .then(({ DomainElkLayoutStrategy }) => new DomainElkLayoutStrategy());
    return domainElkStrategyPromise;
};

export const loadDomainCompoundElkStrategy = (): Promise<ILayoutStrategy> => {
    domainCompoundElkStrategyPromise ??= import('../../../strategies/DomainCompoundElkLayoutStrategy')
        .then(({ DomainCompoundElkLayoutStrategy }) => new DomainCompoundElkLayoutStrategy());
    return domainCompoundElkStrategyPromise;
};
