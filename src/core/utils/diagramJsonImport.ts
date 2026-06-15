import { coerceRemoteDiagramContent } from '@/services/remoteDiagramContent';
import { coerceClipboardData, type ClipboardData } from './flowchartClipboard';

export const DIAGRAM_JSON_IMPORT_MAX_CHARS = 5 * 1024 * 1024;
export type DiagramImportKind = 'json' | 'mermaid';

const getFileExtension = (fileName: unknown): string => {
    if (typeof fileName !== 'string') return '';
    const trimmed = fileName.trim().toLowerCase();
    const dotIndex = trimmed.lastIndexOf('.');
    return dotIndex >= 0 ? trimmed.slice(dotIndex + 1) : '';
};

export const getDiagramImportKind = (fileName: unknown): DiagramImportKind | null => {
    const extension = getFileExtension(fileName);
    if (extension === 'json') return 'json';
    if (extension === 'txt' || extension === 'mmd' || extension === 'mermaid') return 'mermaid';
    return null;
};

export const parseDiagramJson = (content: string): unknown => {
    if (content.length > DIAGRAM_JSON_IMPORT_MAX_CHARS) {
        throw new Error('Diagram JSON is too large.');
    }
    return JSON.parse(content);
};

export const isLikelyStandardDiagramData = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const nodes = Array.isArray(record.nodes) ? record.nodes : [];
    const firstNode = nodes[0] as Record<string, unknown> | undefined;
    return Array.isArray(record.nodes) &&
        Array.isArray(record.edges) &&
        (typeof record.type === 'string' || record.layout !== undefined || typeof record.version === 'string') &&
        nodes.length > 0 &&
        Boolean(firstNode && (firstNode.description !== undefined || firstNode.domain !== undefined));
};

export const coerceStandardDiagramImport = (
    value: unknown,
    fallback: { id: string; title: string }
) => coerceRemoteDiagramContent(value, fallback);

export const coerceReactFlowImport = (value: unknown): ClipboardData => {
    const parsed = coerceClipboardData(value);
    if (!parsed) {
        throw new Error('React Flow JSON must contain valid nodes and edges.');
    }
    return parsed;
};
