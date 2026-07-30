const MAX_DIAGRAM_TITLE_LENGTH = 240;

const asRecord = (value: unknown): Record<string, unknown> | null => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
);

export const normalizeDiagramTitle = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const withoutControlCharacters = Array.from(value, (character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127 ? ' ' : character;
    }).join('');
    const normalized = withoutControlCharacters
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_DIAGRAM_TITLE_LENGTH);
    return normalized || undefined;
};

export const getPersistedDiagramTitle = (value: unknown): string | undefined => {
    const diagram = asRecord(value);
    if (!diagram) return undefined;
    const metadata = asRecord(diagram.metadata);
    return normalizeDiagramTitle(metadata?.title) ?? normalizeDiagramTitle(diagram.name);
};
