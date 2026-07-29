import { describe, expect, it } from 'vitest';

import {
    shouldActivateDesignerPropertyTab,
    shouldExpandDesignerRightSidebar,
    shouldFreezeDesignerRightSidebarDuringDrag,
    shouldOpenDesignerAiSidebar,
} from '../designerRightSidebarState';

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
