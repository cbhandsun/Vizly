export const shouldShowNodeHoverToolbar = ({
    hasContextMenu,
    quickAddMenuVisible,
    isDragging,
    isConnecting,
    isContextToolbarHidden,
    isMindMapSelected,
}: {
    hasContextMenu: boolean;
    quickAddMenuVisible: boolean;
    isDragging: boolean;
    isConnecting: boolean;
    isContextToolbarHidden: boolean;
    isMindMapSelected: boolean;
}): boolean => (
    !hasContextMenu
    && !quickAddMenuVisible
    && !isDragging
    && !isConnecting
    && !isContextToolbarHidden
    && !isMindMapSelected
);
