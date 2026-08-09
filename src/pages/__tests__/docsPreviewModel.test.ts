import { describe, expect, it } from 'vitest';
import { getDocsPreviewCopy } from '../docsPreviewContent';
import {
    DOCS_SEARCH_MAX_LENGTH,
    filterDocsPreviewTopics,
    resolveDocsPreviewLocale,
    resolveVisibleDocsTopic,
    sanitizeDocsSearchQuery,
} from '../docsPreviewModel';

describe('docsPreviewModel', () => {
    it('resolves only supported locales from unknown input', () => {
        expect(resolveDocsPreviewLocale('zh-CN')).toBe('zh');
        expect(resolveDocsPreviewLocale('ZH-hant')).toBe('zh');
        expect(resolveDocsPreviewLocale('en-US')).toBe('en');
        expect(resolveDocsPreviewLocale(null)).toBe('en');
    });

    it('sanitizes control characters, whitespace, and oversized input', () => {
        expect(sanitizeDocsSearchQuery(null)).toBe('');
        expect(sanitizeDocsSearchQuery('\u0000  分享\n链接')).toBe('分享 链接');
        expect(Array.from(sanitizeDocsSearchQuery('图'.repeat(200)))).toHaveLength(DOCS_SEARCH_MAX_LENGTH);
        expect(sanitizeDocsSearchQuery('  storage  ')).toBe('storage ');
    });

    it('filters titles, summaries, keywords, and article content', () => {
        const topics = getDocsPreviewCopy('zh').topics;

        expect(filterDocsPreviewTopics(topics, '')).toHaveLength(6);
        expect(filterDocsPreviewTopics(topics, '分享').map((topic) => topic.id)).toEqual(['sharing']);
        expect(filterDocsPreviewTopics(topics, '客户数据').map((topic) => topic.id)).toEqual(['sharing']);
        expect(filterDocsPreviewTopics(topics, 'not-present')).toEqual([]);
    });

    it('keeps the selected topic when visible and otherwise falls back safely', () => {
        const topics = getDocsPreviewCopy('en').topics;

        expect(resolveVisibleDocsTopic(topics, 'sharing')?.id).toBe('sharing');
        expect(resolveVisibleDocsTopic(topics, 'missing')?.id).toBe('getting-started');
        expect(resolveVisibleDocsTopic([], 'missing')).toBeNull();
    });
});
