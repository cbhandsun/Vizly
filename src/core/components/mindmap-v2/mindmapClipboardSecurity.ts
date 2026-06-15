import type { NodeObj } from 'mind-elixir';
import { MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../utils/fileImportGuards';
import { cleanAndValidateTree, MINDMAP_MAX_NODES } from './mindmapTreeSanitizer';

export const MIND_ELIXIR_CLIPBOARD_MAGIC = 'MIND-ELIXIR-WAIT-COPY';

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export function parseMindElixirClipboardNodes(text: string): NodeObj[] | null {
    if (!text) return null;
    if (text.length > MINDMAP_TEXT_IMPORT_MAX_BYTES) {
        throw new Error('Mind map clipboard payload is too large.');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }

    if (!isRecord(parsed) || parsed.magic !== MIND_ELIXIR_CLIPBOARD_MAGIC) {
        return null;
    }

    if (!Array.isArray(parsed.data)) {
        return [];
    }

    const ctx = { count: 0 };
    return parsed.data
        .slice(0, MINDMAP_MAX_NODES)
        .map((node) => cleanAndValidateTree(node, false, 0, ctx));
}
