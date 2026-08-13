const DEFAULT_BATCH_CONCURRENCY = 5;

export interface CloudStorageBatchDeleteResult {
    succeededIds: string[];
    failedIds: string[];
}

interface RunCloudStorageBatchDeleteOptions {
    ids: readonly string[];
    deleteDiagram: (id: string) => Promise<void>;
    onDeleteFailure?: (id: string, error: unknown) => void;
    concurrency?: number;
}

const normalizeConcurrency = (value: number | undefined): number => {
    if (value === undefined) return DEFAULT_BATCH_CONCURRENCY;
    if (!Number.isSafeInteger(value) || value < 1) return DEFAULT_BATCH_CONCURRENCY;
    return Math.min(value, 20);
};

const normalizeDeletionIds = (ids: readonly string[]): string[] => {
    const normalized = new Set<string>();
    for (const id of ids) {
        const value = id.trim();
        if (value) normalized.add(value);
    }
    return [...normalized];
};

export const runCloudStorageBatchDelete = async ({
    ids,
    deleteDiagram,
    onDeleteFailure,
    concurrency,
}: RunCloudStorageBatchDeleteOptions): Promise<CloudStorageBatchDeleteResult> => {
    const normalizedIds = normalizeDeletionIds(ids);
    const limit = normalizeConcurrency(concurrency);
    const succeededIds: string[] = [];
    const failedIds: string[] = [];

    for (let offset = 0; offset < normalizedIds.length; offset += limit) {
        const chunk = normalizedIds.slice(offset, offset + limit);
        const results = await Promise.allSettled(chunk.map(id => deleteDiagram(id)));
        results.forEach((result, index) => {
            const id = chunk[index];
            if (result.status === 'fulfilled') {
                succeededIds.push(id);
                return;
            }
            failedIds.push(id);
            onDeleteFailure?.(id, result.reason);
        });
    }

    return { succeededIds, failedIds };
};
