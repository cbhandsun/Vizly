import type { ElkNode } from 'elkjs';

import type {
    ElkLayoutExecutor,
    ElkLayoutRunOptions,
} from '../../../ports/elkLayoutExecutor';
import type { ILayoutStrategy } from '../../../types/layout-strategy';

type ElkLayoutClientModule = Readonly<{
    createElkLayoutExecutor: () => ElkLayoutExecutor;
}>;

export type ElkLayoutClientLoader = () => Promise<ElkLayoutClientModule>;

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
        .then(({ DomainElkLayoutStrategy }) => new DomainElkLayoutStrategy())
        .catch((error: unknown) => {
            domainElkStrategyPromise = undefined;
            throw error;
        });
    return domainElkStrategyPromise;
};

export const loadDomainCompoundElkStrategy = (): Promise<ILayoutStrategy> => {
    domainCompoundElkStrategyPromise ??= import('../../../strategies/DomainCompoundElkLayoutStrategy')
        .then(({ DomainCompoundElkLayoutStrategy }) => new DomainCompoundElkLayoutStrategy())
        .catch((error: unknown) => {
            domainCompoundElkStrategyPromise = undefined;
            throw error;
        });
    return domainCompoundElkStrategyPromise;
};

const createDisposedExecutorError = (): Error => {
    const error = new Error('elk-layout-executor-disposed');
    error.name = 'AbortError';
    return error;
};

const loadElkLayoutClient: ElkLayoutClientLoader = () => (
    import('../../../workers/elkLayoutClient')
);

/**
 * Keeps the ELK chunk lazy while giving one Canvas a stable executor lifetime.
 * Failed imports remain retryable; a late import after disposal is immediately
 * retired so StrictMode cleanup cannot leak a worker.
 */
export const createLazyElkLayoutExecutor = (
    loader: ElkLayoutClientLoader = loadElkLayoutClient,
): ElkLayoutExecutor => {
    let delegate: ElkLayoutExecutor | undefined;
    let delegatePromise: Promise<ElkLayoutExecutor> | undefined;
    let disposed = false;

    const loadDelegate = (): Promise<ElkLayoutExecutor> => {
        if (disposed) return Promise.reject(createDisposedExecutorError());
        if (delegate) return Promise.resolve(delegate);

        delegatePromise ??= Promise.resolve()
            .then(loader)
            .then(module => {
                const created = module.createElkLayoutExecutor();
                if (disposed) {
                    created.dispose();
                    throw createDisposedExecutorError();
                }
                delegate = created;
                return created;
            })
            .catch((error: unknown) => {
                delegatePromise = undefined;
                throw error;
            });
        return delegatePromise;
    };

    return Object.freeze({
        run: (graph: ElkNode, options?: ElkLayoutRunOptions) => (
            loadDelegate().then(executor => executor.run(graph, options))
        ),
        dispose: () => {
            if (disposed) return;
            disposed = true;
            delegate?.dispose();
            delegate = undefined;
        },
    });
};
