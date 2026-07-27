import { describe, expect, it } from 'vitest';
import { shouldShowNodeHoverToolbar } from '../hoverToolbarVisibility';

const visibleState = {
    hasContextMenu: false,
    quickAddMenuVisible: false,
    isDragging: false,
    isConnecting: false,
    isContextToolbarHidden: false,
    isMindMapSelected: false,
};

describe('shouldShowNodeHoverToolbar', () => {
    it('shows the toolbar only in an idle editing state', () => {
        expect(shouldShowNodeHoverToolbar(visibleState)).toBe(true);
    });

    it('hides the toolbar immediately during a local node drag', () => {
        expect(shouldShowNodeHoverToolbar({
            ...visibleState,
            isDragging: true,
        })).toBe(false);
    });

    it('hides the toolbar for other conflicting overlays and modes', () => {
        expect(shouldShowNodeHoverToolbar({ ...visibleState, hasContextMenu: true })).toBe(false);
        expect(shouldShowNodeHoverToolbar({ ...visibleState, quickAddMenuVisible: true })).toBe(false);
        expect(shouldShowNodeHoverToolbar({ ...visibleState, isConnecting: true })).toBe(false);
        expect(shouldShowNodeHoverToolbar({ ...visibleState, isContextToolbarHidden: true })).toBe(false);
        expect(shouldShowNodeHoverToolbar({ ...visibleState, isMindMapSelected: true })).toBe(false);
    });
});
