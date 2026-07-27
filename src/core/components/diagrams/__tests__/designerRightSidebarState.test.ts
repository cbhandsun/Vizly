import { describe, expect, it } from 'vitest';

import {
    shouldExpandDesignerRightSidebar,
    shouldFreezeDesignerRightSidebarDuringDrag,
    shouldOpenDesignerAiSidebar,
} from '../designerRightSidebarState';

describe('shouldExpandDesignerRightSidebar', () => {
    it('expands a collapsed sidebar for a selection or an active AI request', () => {
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: true,
            activeTab: 'property',
            aiChatVisible: false,
            previousAiChatVisible: false,
        })).toBe(true);
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: false,
            activeTab: 'ai',
            aiChatVisible: true,
            previousAiChatVisible: false,
        })).toBe(true);
    });

    it('does not expand for hidden AI, another tab, or an already expanded panel', () => {
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: false,
            activeTab: 'ai',
            aiChatVisible: false,
            previousAiChatVisible: false,
        })).toBe(false);
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: false,
            activeTab: 'property',
            aiChatVisible: true,
            previousAiChatVisible: false,
        })).toBe(false);
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: false,
            hasSelection: false,
            activeTab: 'ai',
            aiChatVisible: true,
            previousAiChatVisible: false,
        })).toBe(false);
        expect(shouldExpandDesignerRightSidebar({
            isCollapsed: true,
            hasSelection: false,
            activeTab: 'ai',
            aiChatVisible: true,
            previousAiChatVisible: true,
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
