import type { DiagramVersion } from './storage/types';
import { coerceClipboardData } from '@/core/utils/flowchartClipboard';

const MAX_VERSION_DIAGRAM_ID_LENGTH = 180;
const MAX_VERSION_MESSAGE_LENGTH = 500;
const MAX_VERSION_AUTHOR_LENGTH = 180;
const MAX_VERSION_LIST_ITEMS = 500;
const MAX_VERSION_SNAPSHOT_JSON_CHARS = 2 * 1024 * 1024;
const MAX_DATE_MS = 8_640_000_000_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeDisplayText = (value: unknown, maxLength: number): string => {
    if (typeof value !== 'string') return '';
    return Array.from(value)
        .filter(character => {
            const code = character.codePointAt(0) ?? 0;
            return !(
                code <= 8
                || code === 11
                || code === 12
                || (code >= 14 && code <= 31)
                || code === 127
                || (code >= 0x202a && code <= 0x202e)
                || (code >= 0x2066 && code <= 0x2069)
            );
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
};

export const isSafeVersionId = (value: unknown): value is string =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_VERSION_DIAGRAM_ID_LENGTH &&
    /^[A-Za-z0-9:_-]+$/.test(value.trim());

export const coerceVersionMessage = (message: unknown, fallback = '版本快照'): string => {
    const normalized = normalizeDisplayText(message, MAX_VERSION_MESSAGE_LENGTH);
    return normalized || fallback;
};

export const coerceVersionSnapshotData = (snapshotData: unknown) => {
    const json = JSON.stringify(snapshotData);
    if (!json || json.length > MAX_VERSION_SNAPSHOT_JSON_CHARS) {
        throw new Error('Version snapshot is too large.');
    }

    const snapshot = coerceClipboardData(snapshotData);
    if (!snapshot) {
        throw new Error('Version snapshot must contain valid nodes and edges.');
    }

    return snapshot;
};

export const coerceDiagramVersion = (value: unknown): DiagramVersion | null => {
    try {
        if (!isRecord(value)) return null;
        if (!isSafeVersionId(value.diagramId) || !isSafeVersionId(value.id)) return null;
        if (
            typeof value.createdAt !== 'number'
            || !Number.isSafeInteger(value.createdAt)
            || value.createdAt < 0
            || value.createdAt > MAX_DATE_MS
        ) return null;
        const authorId = normalizeDisplayText(value.authorId, MAX_VERSION_AUTHOR_LENGTH);
        return {
            id: value.id.trim(),
            diagramId: value.diagramId.trim(),
            snapshotData: value.snapshotData == null
                ? null
                : coerceVersionSnapshotData(value.snapshotData),
            ...(authorId ? { authorId } : {}),
            createdAt: value.createdAt,
            message: coerceVersionMessage(value.message),
        };
    } catch {
        return null;
    }
};

export type DiagramVersionListParseResult =
    | { ok: true; value: DiagramVersion[] }
    | { ok: false; value: [] };

export const parseDiagramVersionList = (
    value: unknown,
    expectedDiagramId: string,
): DiagramVersionListParseResult => {
    if (
        !Array.isArray(value)
        || value.length > MAX_VERSION_LIST_ITEMS
        || !isSafeVersionId(expectedDiagramId)
    ) return { ok: false, value: [] };

    const normalizedDiagramId = expectedDiagramId.trim();
    const seenIds = new Set<string>();
    const versions: DiagramVersion[] = [];
    for (const candidate of value) {
        const version = coerceDiagramVersion(candidate);
        if (
            !version
            || version.diagramId !== normalizedDiagramId
            || seenIds.has(version.id)
        ) return { ok: false, value: [] };
        seenIds.add(version.id);
        versions.push(version);
    }

    versions.sort((left, right) => right.createdAt - left.createdAt);
    return { ok: true, value: versions };
};
