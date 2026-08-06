export type MermaidDocumentKind = 'flowchart' | 'mindmap';

export type MermaidDocumentDeclarationResult =
    | { ok: true; kind: MermaidDocumentKind; lineIndex: number }
    | { ok: false; reason: 'empty' | 'missing-declaration' };

const FLOWCHART_DECLARATION = /^(?:flowchart|graph)\s+(?:TB|TD|LR|RL|BT)(?:\s|$)/i;
const MINDMAP_DECLARATION = /^mindmap(?:\s|$)/i;

export const parseMermaidDocumentDeclaration = (
    lines: readonly string[],
): MermaidDocumentDeclarationResult => {
    const lineIndex = lines.findIndex(line => {
        const trimmed = line.trim();
        return Boolean(trimmed) && !trimmed.startsWith('%%');
    });

    if (lineIndex < 0) return { ok: false, reason: 'empty' };

    const declaration = lines[lineIndex].trim();
    if (FLOWCHART_DECLARATION.test(declaration)) {
        return { ok: true, kind: 'flowchart', lineIndex };
    }
    if (MINDMAP_DECLARATION.test(declaration)) {
        return { ok: true, kind: 'mindmap', lineIndex };
    }

    return { ok: false, reason: 'missing-declaration' };
};

export const requireMermaidDocumentDeclaration = (
    lines: readonly string[],
    supportedKinds: readonly MermaidDocumentKind[] = ['flowchart', 'mindmap'],
): { kind: MermaidDocumentKind; lineIndex: number } => {
    const result = parseMermaidDocumentDeclaration(lines);
    if (!result.ok) {
        throw new Error('Mermaid document declaration is required.');
    }
    if (!supportedKinds.includes(result.kind)) {
        throw new Error('Unsupported Mermaid document type.');
    }
    return result;
};
