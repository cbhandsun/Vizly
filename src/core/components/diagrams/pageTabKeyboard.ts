export type PageTabNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

const isPageTabNavigationKey = (key: string): key is PageTabNavigationKey => (
    key === 'ArrowLeft'
    || key === 'ArrowRight'
    || key === 'Home'
    || key === 'End'
);

/** Resolves a horizontal tab-list key press with wrapping navigation. */
export const resolvePageTabTargetIndex = (
    key: string,
    currentIndex: number,
    pageCount: number,
): number | null => {
    if (!isPageTabNavigationKey(key) || pageCount <= 0) return null;
    if (currentIndex < 0 || currentIndex >= pageCount) return null;

    switch (key) {
        case 'Home':
            return 0;
        case 'End':
            return pageCount - 1;
        case 'ArrowLeft':
            return (currentIndex - 1 + pageCount) % pageCount;
        case 'ArrowRight':
            return (currentIndex + 1) % pageCount;
    }
};
