import { MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../utils/fileImportGuards';
import { cleanMindMapData } from './mindmapTreeSanitizer';

export const parseRemoteMindMapYjsData = (raw: string): ReturnType<typeof cleanMindMapData> => {
    if (raw.length > MINDMAP_TEXT_IMPORT_MAX_BYTES) {
        throw new Error('Remote mind map payload is too large.');
    }
    return cleanMindMapData(JSON.parse(raw));
};

export const serializeLocalMindMapYjsData = (value: unknown): string => (
    JSON.stringify(cleanMindMapData(value))
);
