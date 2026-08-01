export const canonicalizeSelectionById = <T extends { id: string }>(
    selectedItems: readonly T[],
    currentItems: readonly T[],
): T[] => {
    const currentById = new Map(currentItems.map(item => [item.id, item]));
    return selectedItems.map(item => currentById.get(item.id) ?? item);
};
