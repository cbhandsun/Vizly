export const DIAGRAM_EXPORT_TYPES = ['png', 'pdf', 'svg', 'gif'] as const;

export type DiagramExportType = (typeof DIAGRAM_EXPORT_TYPES)[number];

export interface DiagramExportEventDetail {
    diagramId?: string;
    type: DiagramExportType;
}

export interface DiagramExportProgressEventDetail extends DiagramExportEventDetail {
    type: 'gif';
    progress: number;
}

const MAX_DIAGRAM_ID_LENGTH = 256;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readDiagramId = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const diagramId = value.trim();
    if (!diagramId) return undefined;
    return diagramId.slice(0, MAX_DIAGRAM_ID_LENGTH);
};

const isDiagramExportType = (value: unknown): value is DiagramExportType =>
    typeof value === 'string'
    && (DIAGRAM_EXPORT_TYPES as readonly string[]).includes(value);

export const readDiagramExportEventDetail = (event: Event): unknown =>
    Reflect.get(event, 'detail');

export const parseDiagramExportEventDetail = (
    value: unknown,
): DiagramExportEventDetail | null => {
    if (!isRecord(value) || !isDiagramExportType(value.type)) return null;
    return {
        diagramId: readDiagramId(value.diagramId),
        type: value.type,
    };
};

export const parseDiagramExportProgressEventDetail = (
    value: unknown,
): DiagramExportProgressEventDetail | null => {
    if (!isRecord(value) || value.type !== 'gif') return null;
    if (typeof value.progress !== 'number' || !Number.isFinite(value.progress)) return null;
    return {
        diagramId: readDiagramId(value.diagramId),
        type: 'gif',
        progress: Math.min(1, Math.max(0, value.progress)),
    };
};
