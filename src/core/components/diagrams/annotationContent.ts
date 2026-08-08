export const MAX_ANNOTATION_CONTENT_LENGTH = 4000;

const INVISIBLE_FORMATTING_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

const replaceUnsafeControlCharacters = (value: string): string => (
    Array.from(value, character => {
        const codePoint = character.codePointAt(0);
        if (codePoint === undefined) return '';
        if (character === '\n' || character === '\t') return character;
        return codePoint <= 31 || codePoint === 127 ? ' ' : character;
    }).join('')
);

export type AnnotationContentError = 'required' | 'too_long' | 'save_failed';

export type AnnotationContentResult =
    | { ok: true; value: string }
    | { ok: false; error: Exclude<AnnotationContentError, 'save_failed'> };

export const parseAnnotationContent = (value: unknown): AnnotationContentResult => {
    if (typeof value !== 'string') return { ok: false, error: 'required' };

    const normalized = replaceUnsafeControlCharacters(value.replace(/\r\n?/g, '\n'))
        .replace(INVISIBLE_FORMATTING_CHARACTERS, '')
        .trim();

    if (!normalized) return { ok: false, error: 'required' };
    if (normalized.length > MAX_ANNOTATION_CONTENT_LENGTH) {
        return { ok: false, error: 'too_long' };
    }
    return { ok: true, value: normalized };
};
