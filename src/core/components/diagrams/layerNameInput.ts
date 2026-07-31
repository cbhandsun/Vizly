const MAX_LAYER_NAME_LENGTH = 80;
const REPEATED_WHITESPACE = /\s+/g;

const replaceControlCharacters = (value: string): string => (
    Array.from(value, character => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
            ? ' '
            : character;
    }).join('')
);

export const normalizeLayerNameInput = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = replaceControlCharacters(value)
        .replace(REPEATED_WHITESPACE, ' ')
        .trim()
        .slice(0, MAX_LAYER_NAME_LENGTH)
        .trim();
    return normalized || null;
};
