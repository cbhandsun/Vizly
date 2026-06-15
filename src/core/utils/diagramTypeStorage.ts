import { safeJsonParse } from './jsonUtils';

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
): Record<string, DiagramConfigIndexEntry> => (
    coerceDiagramConfigIndex(safeJsonParse<unknown>(storage.getItem(DIAGRAM_CONFIG_INDEX_KEY), {}))
);

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
    storage.setItem(DIAGRAM_CONFIG_INDEX_KEY, JSON.stringify(configs));
};

export const getDiagramDocTypeFromStorage = (
    storage: StorageReader,
    selectedDiagramId: string
): string | undefined => {
    if (!selectedDiagramId) return undefined;

    const diagrams = safeJsonParse<unknown>(storage.getItem('vizly_diagrams'), []);
    if (Array.isArray(diagrams)) {
        const found = diagrams.find((diagram) => getStringProp(diagram, 'id') === selectedDiagramId);
        const type = getStringProp(found, 'type');
        if (type) return type;
    }

    const configs = readDiagramConfigIndex(storage);
    const configType = getStringProp(configs[selectedDiagramId], 'type');
    if (configType) return configType;

    const autosave = getRecord(safeJsonParse<unknown>(
        storage.getItem(`flowchart-autosave-v2-${selectedDiagramId}`),
        {}
    ));
    const autosaveType = getStringProp(autosave.metadata, 'type');
    if (autosaveType) return autosaveType;

    return undefined;
};
