import type { DiagramPage } from './hooks/useMultiPage';

const createDefaultPageName = (index: number): string => `页面 ${index}`;
const DEFAULT_PAGE_NAME_PATTERN = /^(?:Page|页面)\s+(\d+)$/iu;

export type PageNameFactory = (index: number) => string;

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

export const createNextPageName = (
    pages: DiagramPage[],
    createPageName: PageNameFactory = createDefaultPageName,
): string => {
    const existingNames = new Set(pages.map(page => createPageNameKey(page.name)));
    const reservedDefaultIndexes = new Set(pages.flatMap((page) => {
        const match = normalizePageName(page.name).match(DEFAULT_PAGE_NAME_PATTERN);
        const index = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
        return Number.isSafeInteger(index) && index > 0 ? [index] : [];
    }));
    let suffix = 1;

    while (
        reservedDefaultIndexes.has(suffix)
        || existingNames.has(createPageNameKey(createPageName(suffix)))
    ) {
        suffix += 1;
    }

    return createPageName(suffix);
};

export const createUniquePageName = (
    pages: DiagramPage[],
    preferredName: string,
    maxLength: number,
): string | null => {
    const normalizedName = normalizePageName(preferredName).slice(0, maxLength);
    if (!normalizedName) return null;
    if (isPageNameAvailable(pages, normalizedName)) return normalizedName;

    for (let suffix = 2; suffix <= pages.length + 2; suffix += 1) {
        const suffixText = ` (${suffix})`;
        const baseName = normalizedName.slice(0, maxLength - suffixText.length).trimEnd();
        const candidate = `${baseName}${suffixText}`;
        if (isPageNameAvailable(pages, candidate)) return candidate;
    }

    return null;
};
