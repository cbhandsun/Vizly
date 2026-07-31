import { describe, expect, it } from 'vitest';

import {
    createDesignerRightSidebarLayout,
    MOBILE_DESIGNER_PANEL_DOCK_CLEARANCE,
    shouldActivateDesignerPropertyTab,
    shouldExpandDesignerRightSidebar,
    shouldFreezeDesignerRightSidebarDuringDrag,
    shouldOpenDesignerAiSidebar,
} from '../designerRightSidebarState';

describe('createDesignerRightSidebarLayout', () => {
    it('keeps an expanded mobile panel above the bottom dock and safe area', () => {
        expect(createDesignerRightSidebarLayout({
            isCollapsed: false,
            isMobile: true,
            panelWidth: 360,
        })).toMatchObject({
            position: 'fixed',
            right: 0,
            left: 0,
            bottom: MOBILE_DESIGNER_PANEL_DOCK_CLEARANCE,
            maxHeight: 'calc(100% - 176px)',
            height: 'min(85vh, calc(100% - 176px))',
            width: '100%',
        });
    });

    it('preserves desktop sizing and collapses the mobile panel to zero height', () => {
        expect(createDesignerRightSidebarLayout({
            isCollapsed: true,
            isMobile: true,
            panelWidth: 360,
        }).height).toBe(0);
        expect(createDesignerRightSidebarLayout({
            isCollapsed: false,
            isMobile: false,
            panelWidth: 360,
        })).toMatchObject({
            position: 'absolute',
            right: 16,
            bottom: 'auto',
            height: 'calc(100% - 96px)',
            width: 360,
        });
    });
});

describe('shouldExpandDesignerRightSidebar', () => {
    it('expands a collapsed sidebar for a selection or an active AI request', () => {
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: true,
            isMobile: false,
            activeTab: 'property',
            aiChatVisible: false,
            previousAiChatVisible: false,
        })).toBe(true);
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: false,
            isMobile: false,
            activeTab: 'ai',
            aiChatVisible: true,
            previousAiChatVisible: false,
        })).toBe(true);
    });

    it('does not expand for hidden AI, another tab, or an already expanded panel', () => {
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: false,
            isMobile: false,
            activeTab: 'ai',
            aiChatVisible: false,
            previousAiChatVisible: false,
        })).toBe(false);
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: false,
            isMobile: false,
            activeTab: 'property',
            aiChatVisible: true,
            previousAiChatVisible: false,
        })).toBe(false);
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: false,
            hasSelection: false,
            isMobile: false,
            activeTab: 'ai',
            aiChatVisible: true,
            previousAiChatVisible: false,
        })).toBe(false);
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: false,
            isMobile: false,
            activeTab: 'ai',
            aiChatVisible: true,
            previousAiChatVisible: true,
        })).toBe(false);
    });

    it('does not cover the mobile canvas merely because an item becomes selected', () => {
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: true,
            isMobile: true,
            activeTab: 'property',
            aiChatVisible: false,
            previousAiChatVisible: false,
        })).toBe(false);
    });

    it('respects a manual collapse while the current selection continues', () => {
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: true,
            previousHasSelection: true,
            isMobile: false,
            activeTab: 'property',
            aiChatVisible: false,
            previousAiChatVisible: false,
        })).toBe(false);
    });
});

describe('shouldActivateDesignerPropertyTab', () => {
    it('returns to properties when a new desktop selection starts from the AI tab', () => {
        expect(shouldActivateDesignerPropertyTab({
            activeTab: 'ai',
            hasSelection: true,
            isMobile: false,
            previousHasSelection: false,
        })).toBe(true);
    });

    it('keeps the current tab for mobile, a continuing selection, or no selection', () => {
        expect(shouldActivateDesignerPropertyTab({
            activeTab: 'ai',
            hasSelection: true,
            isMobile: true,
            previousHasSelection: false,
        })).toBe(false);
        expect(shouldActivateDesignerPropertyTab({
            activeTab: 'ai',
            hasSelection: true,
            isMobile: false,
            previousHasSelection: true,
        })).toBe(false);
        expect(shouldActivateDesignerPropertyTab({
            activeTab: 'ai',
            hasSelection: false,
            isMobile: false,
            previousHasSelection: false,
        })).toBe(false);
    });
});

describe('shouldOpenDesignerAiSidebar', () => {
    it('opens when the AI tab is inactive or currently hidden', () => {
        expect(shouldOpenDesignerAiSidebar('property', false)).toBe(true);
        expect(shouldOpenDesignerAiSidebar('ai', false)).toBe(true);
        expect(shouldOpenDesignerAiSidebar('ai', true)).toBe(false);
    });
});

describe('shouldFreezeDesignerRightSidebarDuringDrag', () => {
    it('freezes the form-heavy sidebar only between active drag frames', () => {
        expect(shouldFreezeDesignerRightSidebarDuringDrag(
            { isDraggingNode: true },
            { isDraggingNode: true },
        )).toBe(true);
        expect(shouldFreezeDesignerRightSidebarDuringDrag(
            { isDraggingNode: false },
            { isDraggingNode: true },
        )).toBe(false);
        expect(shouldFreezeDesignerRightSidebarDuringDrag(
            { isDraggingNode: true },
            { isDraggingNode: false },
        )).toBe(false);
    });
});
