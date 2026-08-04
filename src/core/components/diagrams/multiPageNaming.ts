import type { DiagramPage } from './hooks/useMultiPage';

const DEFAULT_PAGE_NAME_PREFIX = '页面';

export const normalizePageName = (name: string): string => name.trim();

export const createPageNameKey = (name: string): string => (
    normalizePageName(name).normalize('NFKC').toLocaleLowerCase()
);

export const isPageNameAvailable = (
    pages: DiagramPage[],
    candidateName: string,
    excludedPageId?: string,
): boolean => {
    const candidateKey = createPageNameKey(candidateName);
    if (!candidateKey) return false;

    return !pages.some(page => (
        page.id !== excludedPageId && createPageNameKey(page.name) === candidateKey
    ));
};

export const createNextPageName = (pages: DiagramPage[]): string => {
    const existingNames = new Set(pages.map(page => createPageNameKey(page.name)));
    let suffix = 1;

    while (existingNames.has(createPageNameKey(`${DEFAULT_PAGE_NAME_PREFIX} ${suffix}`))) {
        suffix += 1;
    }

    return `${DEFAULT_PAGE_NAME_PREFIX} ${suffix}`;
};
