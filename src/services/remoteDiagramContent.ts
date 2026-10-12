import {
    coerceRemoteDiagramContent as coerceCoreRemoteContent,
    parseRemoteDiagramJson as parseCoreRemoteJson,
    coerceRemoteDiagramPreview,
} from '@vizly/core/remote-content';

type Fallback = { id: string; title: string };
const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Binary preview data has its own bounded contract; ordinary text remains Core-sanitized. */
const restoreValidatedPreview = (parsed: ReturnType<typeof coerceCoreRemoteContent>, raw: unknown) => {
    const metadata = asRecord(asRecord(raw)?.metadata);
    if (!metadata || !Object.hasOwn(metadata, 'preview')) return parsed;
    const preview = coerceRemoteDiagramPreview(metadata.preview);
    return { ...parsed, metadata: { ...parsed.metadata, preview: preview ?? undefined } };
};

export const coerceRemoteDiagramContent = (content: unknown, fallback: Fallback) =>
    restoreValidatedPreview(coerceCoreRemoteContent(content, fallback), content);

export const parseRemoteDiagramJson = (rawJson: string, fallback: Fallback) => {
    // Core applies the complete-document limit before the raw preview is examined.
    const parsed = parseCoreRemoteJson(rawJson, fallback);
    const raw: unknown = JSON.parse(rawJson);
    return restoreValidatedPreview(parsed, raw);
};

export const parseRemoteDiagramContent = (content: unknown, fallback: Fallback) =>
    typeof content === 'string' ? parseRemoteDiagramJson(content, fallback) : coerceRemoteDiagramContent(content, fallback);
