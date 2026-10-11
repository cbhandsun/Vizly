import { parseLocaleResource } from './localeResourceBoundary';

const hasMessage = (resource: Record<string, unknown>): boolean => {
    const pending: unknown[] = Object.values(resource);
    while (pending.length > 0) {
        const value = pending.pop();
        if (typeof value === 'string' && value.trim().length > 0) return true;
        if (value !== null && typeof value === 'object') pending.push(...Object.values(value));
    }
    return false;
};

/** i18next can resolve init after a backend failure; require the active bundle. */
export const awaitLocaleInitialization = async (
    initialization: Promise<unknown>,
    readActiveResource: () => unknown,
): Promise<void> => {
    try {
        await initialization;
        if (!hasMessage(parseLocaleResource(readActiveResource()))) {
            throw new Error('Empty locale resource.');
        }
    } catch {
        // Startup receives a failure, but no raw backend payload or URL.
        throw new Error('Application locale initialization failed.');
    }
};
