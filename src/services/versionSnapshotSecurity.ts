import type { DiagramVersion } from './storage/types';
import { coerceClipboardData } from '@/core/utils/flowchartClipboard';

const MAX_VERSION_DIAGRAM_ID_LENGTH = 180;
const MAX_VERSION_MESSAGE_LENGTH = 500;
const MAX_VERSION_SNAPSHOT_JSON_CHARS = 2 * 1024 * 1024;

export const isSafeVersionId = (value: unknown): value is string =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_VERSION_DIAGRAM_ID_LENGTH &&
    /^[A-Za-z0-9:_-]+$/.test(value.trim());

export const coerceVersionMessage = (message: unknown, fallback = '版本快照'): string => {
    if (typeof message !== 'string') return fallback;
    const trimmed = message.trim();
    return (trimmed || fallback).slice(0, MAX_VERSION_MESSAGE_LENGTH);
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

export const coerceDiagramVersion = (version: DiagramVersion): DiagramVersion | null => {
    try {
        if (!isSafeVersionId(version.diagramId) || !isSafeVersionId(version.id)) return null;
        return {
            ...version,
            diagramId: version.diagramId.trim(),
            id: version.id.trim(),
            snapshotData: version.snapshotData == null
                ? null
                : coerceVersionSnapshotData(version.snapshotData),
            createdAt: typeof version.createdAt === 'number' && Number.isFinite(version.createdAt)
                ? version.createdAt
                : Date.now(),
            message: coerceVersionMessage(version.message),
        };
    } catch {
        return null;
    }
};
