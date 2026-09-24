export const DOCS_SEARCH_MAX_LENGTH = 80;

export type DocsPreviewLocale = 'en' | 'zh';

export interface DocsPreviewSection {
    title: string;
    body: string;
    bullets?: readonly string[];
}

export interface DocsPreviewTopic {
    id: string;
    title: string;
    summary: string;
    eyebrow: string;
    keywords: readonly string[];
    sections: readonly DocsPreviewSection[];
}

export const resolveDocsPreviewLocale = (input: unknown): DocsPreviewLocale => {
    if (typeof input !== 'string') return 'en';
    return input.trim().toLocaleLowerCase().startsWith('zh') ? 'zh' : 'en';
};

export const sanitizeDocsSearchQuery = (input: unknown): string => {
    if (typeof input !== 'string') return '';

    const withoutControls = Array.from(input, (character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127 ? ' ' : character;
    }).join('');
    const normalized = withoutControls
        .replace(/\s+/gu, ' ')
        .trimStart();

    return Array.from(normalized).slice(0, DOCS_SEARCH_MAX_LENGTH).join('');
};

const normalizeSearchText = (value: string): string => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim();

export const filterDocsPreviewTopics = (
    topics: readonly DocsPreviewTopic[],
    rawQuery: unknown,
): DocsPreviewTopic[] => {
    const query = normalizeSearchText(sanitizeDocsSearchQuery(rawQuery));
    if (!query) return [...topics];

    return topics.filter((topic) => normalizeSearchText([
        topic.title,
        topic.summary,
        topic.eyebrow,
        ...topic.keywords,
        ...topic.sections.flatMap((section) => [
            section.title,
            section.body,
            ...(section.bullets ?? []),
        ]),
    ].join(' ')).includes(query));
};

export const resolveVisibleDocsTopic = (
    topics: readonly DocsPreviewTopic[],
    selectedTopicId: string,
): DocsPreviewTopic | null => (
    topics.find((topic) => topic.id === selectedTopicId) ?? topics[0] ?? null
);
