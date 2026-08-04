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

export const getAnnotationContentErrorMessage = (error: AnnotationContentError | null): string | null => {
    if (error === 'required') return '请输入批注内容';
    if (error === 'too_long') return `批注内容不能超过 ${MAX_ANNOTATION_CONTENT_LENGTH} 个字符`;
    if (error === 'save_failed') return '批注保存失败，请重试';
    return null;
};
