interface SetDesignerCommandPaletteVisibilityOptions {
    visible: boolean;
    openHostCommandPalette?: () => void;
    setInternalVisibility: (visible: boolean) => void;
}

export const setDesignerCommandPaletteVisibility = ({
    visible,
    openHostCommandPalette,
    setInternalVisibility,
}: SetDesignerCommandPaletteVisibilityOptions): void => {
    if (visible && openHostCommandPalette) {
        openHostCommandPalette();
        return;
    }

    setInternalVisibility(visible);
};
