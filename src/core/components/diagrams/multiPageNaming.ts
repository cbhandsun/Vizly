import type { DiagramPage } from './hooks/useMultiPage';

const DEFAULT_PAGE_NAME_PREFIX = '页面';

export const createNextPageName = (pages: DiagramPage[]): string => {
    const existingNames = new Set(pages.map(page => page.name.trim()));
    let suffix = 1;

    while (existingNames.has(`${DEFAULT_PAGE_NAME_PREFIX} ${suffix}`)) {
        suffix += 1;
    }

    return `${DEFAULT_PAGE_NAME_PREFIX} ${suffix}`;
};
