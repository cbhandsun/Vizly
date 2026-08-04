import { describe, expect, it } from 'vitest';

import {
    MAX_ANNOTATION_CONTENT_LENGTH,
    parseAnnotationContent,
} from '../annotationContent';

describe('annotation content boundary', () => {
    it('normalizes line endings, surrounding whitespace, controls, and invisible formatting', () => {
        expect(parseAnnotationContent('  审批\r\n\u0000节\u200B点  ')).toEqual({
            ok: true,
            value: '审批\n 节点',
        });
    });

    it.each([undefined, null, 12, '', '   ', '\u200B\u202E'])('rejects empty or invalid input %#', value => {
        expect(parseAnnotationContent(value)).toEqual({ ok: false, error: 'required' });
    });

    it('accepts the maximum length and rejects oversized content without truncating it', () => {
        const maximum = '批'.repeat(MAX_ANNOTATION_CONTENT_LENGTH);
        expect(parseAnnotationContent(maximum)).toEqual({ ok: true, value: maximum });
        expect(parseAnnotationContent(`${maximum}超`)).toEqual({ ok: false, error: 'too_long' });
    });
});
