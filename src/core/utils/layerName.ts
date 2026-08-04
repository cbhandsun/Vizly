export const MAX_LAYER_NAME_LENGTH = 80;

const REPEATED_WHITESPACE = /\s+/g;
const INVISIBLE_FORMATTING_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const GENERATED_NAME_SUFFIX = / \(\d+\)$/u;

export interface LayerNameEntry {
    id: string;
    name: string;
}

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
        .replace(INVISIBLE_FORMATTING_CHARACTERS, '')
        .replace(REPEATED_WHITESPACE, ' ')
        .trim()
        .slice(0, MAX_LAYER_NAME_LENGTH)
        .trim();
    return normalized || null;
};

export const createLayerNameComparisonKey = (value: string): string => (
    value.normalize('NFKC').toLowerCase()
);

export const isLayerNameAvailable = (
    layers: readonly LayerNameEntry[],
    candidate: unknown,
    excludedLayerId?: string,
): boolean => {
    const normalizedCandidate = normalizeLayerNameInput(candidate);
    if (!normalizedCandidate) return false;
    const candidateKey = createLayerNameComparisonKey(normalizedCandidate);

    return !layers.some(layer => (
        layer.id !== excludedLayerId
        && createLayerNameComparisonKey(normalizeLayerNameInput(layer.name) ?? '') === candidateKey
    ));
};

export const resolveUniqueLayerName = (
    existingNames: readonly string[],
    candidate: unknown,
): string | null => {
    const normalizedCandidate = normalizeLayerNameInput(candidate);
    if (!normalizedCandidate) return null;
    const usedKeys = new Set(existingNames.map(name => (
        createLayerNameComparisonKey(normalizeLayerNameInput(name) ?? '')
    )));
    if (!usedKeys.has(createLayerNameComparisonKey(normalizedCandidate))) {
        return normalizedCandidate;
    }

    const baseCandidate = normalizedCandidate.replace(GENERATED_NAME_SUFFIX, '');
    for (let index = 2; index <= existingNames.length + 2; index += 1) {
        const suffix = ` (${index})`;
        const base = baseCandidate
            .slice(0, MAX_LAYER_NAME_LENGTH - suffix.length)
            .trimEnd();
        const candidateName = `${base}${suffix}`;
        if (!usedKeys.has(createLayerNameComparisonKey(candidateName))) {
            return candidateName;
        }
    }

    return null;
};
