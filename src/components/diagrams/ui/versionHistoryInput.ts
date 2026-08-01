export const VERSION_MESSAGE_MAX_LENGTH = 160;
export const DEFAULT_VERSION_MESSAGE = '手动保存的版本快照';

const removeUnsafeControlCharacters = (value: string): string => Array.from(value)
    .filter((character) => {
        const code = character.codePointAt(0) ?? 0;
        return !(
            code <= 8
            || code === 11
            || code === 12
            || (code >= 14 && code <= 31)
            || code === 127
        );
    })
    .join('');

export const normalizeVersionMessage = (value: unknown): string => {
    if (typeof value !== 'string') return DEFAULT_VERSION_MESSAGE;
    const normalized = removeUnsafeControlCharacters(value)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, VERSION_MESSAGE_MAX_LENGTH);
    return normalized || DEFAULT_VERSION_MESSAGE;
};
