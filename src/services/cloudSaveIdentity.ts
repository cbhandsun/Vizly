import { coerceDiagramId } from '@vizly/core/input';

/** Storage owns its canonical identifier (for example an S3 object filename). */
export const readSavedDiagramId = (result: unknown): string => {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('Storage returned an invalid diagram identity.');
    }
    const rawId = (result as Record<string, unknown>).id;
    const id = coerceDiagramId(rawId);
    // Coercion must not silently rename the provider's object key.
    if (!id || rawId !== id) throw new Error('Storage returned an invalid diagram identity.');
    return id;
};
