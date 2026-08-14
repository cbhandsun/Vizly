const OUTLINE_NAVIGATION_KEYS = new Set([
    'ArrowDown',
    'ArrowUp',
    'End',
    'Home',
]);

interface MindMapOutlineNavigationInput {
    key: string;
    currentId: string;
    visibleIds: readonly string[];
}

export const getMindMapOutlineRovingId = (
    visibleIds: readonly string[],
    activeId: string | null,
): string | null => {
    if (activeId && visibleIds.includes(activeId)) return activeId;
    return visibleIds[0] ?? null;
};

export const getMindMapOutlineNavigationTarget = ({
    key,
    currentId,
    visibleIds,
}: MindMapOutlineNavigationInput): string | null => {
    if (!OUTLINE_NAVIGATION_KEYS.has(key) || visibleIds.length === 0) return null;
    if (key === 'Home') return visibleIds[0] ?? null;
    if (key === 'End') return visibleIds.at(-1) ?? null;

    const currentIndex = visibleIds.indexOf(currentId);
    if (currentIndex < 0) return visibleIds[0] ?? null;
    const offset = key === 'ArrowDown' ? 1 : -1;
    const targetIndex = Math.min(
        visibleIds.length - 1,
        Math.max(0, currentIndex + offset),
    );
    return visibleIds[targetIndex] ?? null;
};
