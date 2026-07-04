import { logUiStorageReadFailure, logUiStorageWriteFailure } from './uiStorageLogging';

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'getItem' | 'setItem'>;

export interface DiagramConfigIndexEntry {
    id: string;
    type: string;
    name?: string;
    updatedAt?: number;
}

const DIAGRAM_CONFIG_INDEX_KEY = 'vizly_diagram_configs';
const MAX_CONFIG_INDEX_ENTRIES = 1000;
const MAX_CONFIG_ID_LENGTH = 160;
const MAX_CONFIG_TYPE_LENGTH = 80;
const MAX_CONFIG_NAME_LENGTH = 240;
const MAX_DIAGRAM_TYPE_STORAGE_JSON_LENGTH = 2 * 1024 * 1024;

const getRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};

const getStringProp = (value: unknown, prop: string): string | undefined => {
    const record = getRecord(value);
    const candidate = record[prop];
    return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
};

const cleanString = (value: unknown, maxLength: number): string | undefined => (
    typeof value === 'string' && value.trim()
        ? value.trim().slice(0, maxLength)
        : undefined
);

const cleanUpdatedAt = (value: unknown): number | undefined => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : undefined
);

const parseStoredJson = <T>(raw: string | null, fallback: T, key: string): T => {
    if (!raw) return fallback;
    if (raw.length > MAX_DIAGRAM_TYPE_STORAGE_JSON_LENGTH) {
        logUiStorageReadFailure('diagramTypeStorage', key, new Error('Diagram type storage JSON is too large.'));
        return fallback;
    }
    try {
        return JSON.parse(raw) as T;
    } catch (error) {
        logUiStorageReadFailure('diagramTypeStorage', key, error);
        return fallback;
    }
};

export const coerceDiagramConfigIndex = (value: unknown): Record<string, DiagramConfigIndexEntry> => {
    const raw = getRecord(value);
    const entries: Array<[string, DiagramConfigIndexEntry]> = [];

    for (const [rawKey, rawEntry] of Object.entries(raw).slice(-MAX_CONFIG_INDEX_ENTRIES)) {
        const entry = getRecord(rawEntry);
        const id = cleanString(entry.id, MAX_CONFIG_ID_LENGTH) ?? cleanString(rawKey, MAX_CONFIG_ID_LENGTH);
        const type = cleanString(entry.type, MAX_CONFIG_TYPE_LENGTH);
        if (!id || !type) continue;

        entries.push([id, {
            id,
            type,
            name: cleanString(entry.name, MAX_CONFIG_NAME_LENGTH),
            updatedAt: cleanUpdatedAt(entry.updatedAt),
        }]);
    }

    return Object.fromEntries(entries);
};

export const readDiagramConfigIndex = (
    storage: StorageReader
): Record<string, DiagramConfigIndexEntry> => {
    try {
        return coerceDiagramConfigIndex(
            parseStoredJson<unknown>(storage.getItem(DIAGRAM_CONFIG_INDEX_KEY), {}, DIAGRAM_CONFIG_INDEX_KEY)
        );
    } catch (error) {
        logUiStorageReadFailure('diagramTypeStorage', DIAGRAM_CONFIG_INDEX_KEY, error);
        return {};
    }
};

export const upsertDiagramConfigIndex = (
    storage: StorageWriter,
    entry: DiagramConfigIndexEntry
): void => {
    const id = cleanString(entry.id, MAX_CONFIG_ID_LENGTH);
    const type = cleanString(entry.type, MAX_CONFIG_TYPE_LENGTH);
    if (!id || !type) return;

    const configs = readDiagramConfigIndex(storage);
    configs[id] = {
        id,
        type,
        name: cleanString(entry.name, MAX_CONFIG_NAME_LENGTH),
        updatedAt: cleanUpdatedAt(entry.updatedAt) ?? Date.now(),
    };
    try {
        storage.setItem(DIAGRAM_CONFIG_INDEX_KEY, JSON.stringify(configs));
    } catch (error) {
        logUiStorageWriteFailure('diagramTypeStorage', DIAGRAM_CONFIG_INDEX_KEY, error);
    }
};

export const getDiagramDocTypeFromStorage = (
    storage: StorageReader,
    selectedDiagramId: string
): string | undefined => {
    if (!selectedDiagramId) return undefined;

    let diagrams: unknown = [];
    try {
        diagrams = parseStoredJson<unknown>(storage.getItem('vizly_diagrams'), [], 'vizly_diagrams');
    } catch (error) {
        logUiStorageReadFailure('diagramTypeStorage', 'vizly_diagrams', error);
    }
    if (Array.isArray(diagrams)) {
        const found = diagrams.find((diagram) => getStringProp(diagram, 'id') === selectedDiagramId);
        const type = getStringProp(found, 'type');
        if (type) return type;
    }

    const configs = readDiagramConfigIndex(storage);
    const configType = getStringProp(configs[selectedDiagramId], 'type');
    if (configType) return configType;

    let autosave: Record<string, unknown> = {};
    try {
        autosave = getRecord(parseStoredJson<unknown>(
            storage.getItem(`flowchart-autosave-v2-${selectedDiagramId}`),
            {},
            `flowchart-autosave-v2-${selectedDiagramId}`
        ));
    } catch (error) {
        logUiStorageReadFailure('diagramTypeStorage', `flowchart-autosave-v2-${selectedDiagramId}`, error);
    }
    const autosaveType = getStringProp(autosave.metadata, 'type');
    if (autosaveType) return autosaveType;

    return undefined;
};
