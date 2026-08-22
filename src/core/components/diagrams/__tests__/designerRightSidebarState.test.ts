import { describe, expect, it } from 'vitest';

import {
    createDesignerRightSidebarLayout,
    createDesignerRightSidebarOffsetVariables,
    MOBILE_DESIGNER_PANEL_DOCK_CLEARANCE,
    MOBILE_DESIGNER_PANEL_WIDTH,
    shouldActivateDesignerPropertyTab,
    shouldExpandDesignerRightSidebar,
    shouldFreezeDesignerRightSidebarDuringDrag,
    shouldOpenDesignerAiSidebar,
    shouldReuseDesignerRightSidebar,
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
            width: MOBILE_DESIGNER_PANEL_WIDTH,
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
        expect(createDesignerRightSidebarLayout({
            isCollapsed: true,
            isMobile: false,
            panelWidth: 360,
        }).width).toBe('var(--commercial-touch-target, 44px)');
    });
});

describe('createDesignerRightSidebarOffsetVariables', () => {
    it('combines sidebar offsets without a computed-style layout read', () => {
        expect(createDesignerRightSidebarOffsetVariables(60)).toEqual({
            rightSidebarOffset: '60px',
            maxSidebarOffset: 'max(var(--left-sidebar-offset, 0px), 60px)',
        });
    });

    it('fails closed for hidden, non-finite, negative, and excessive widths', () => {
        const hidden = {
            rightSidebarOffset: '0px',
            maxSidebarOffset: 'var(--left-sidebar-offset, 0px)',
        };
        expect(createDesignerRightSidebarOffsetVariables(null)).toEqual(hidden);
        expect(createDesignerRightSidebarOffsetVariables(Number.NaN)).toEqual(hidden);
        expect(createDesignerRightSidebarOffsetVariables(Number.POSITIVE_INFINITY)).toEqual(hidden);
        expect(createDesignerRightSidebarOffsetVariables(-1)).toEqual(hidden);
        expect(createDesignerRightSidebarOffsetVariables(10_001)).toEqual(hidden);
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

describe('shouldReuseDesignerRightSidebar', () => {
    const selectedNode = { id: 'node-a' };
    const createProps = (overrides: Record<string, unknown> = {}): {
        isDraggingNode: boolean;
        selectedNodes: readonly unknown[];
        selectedEdges: readonly unknown[];
    } & Record<string, unknown> => ({
        isDraggingNode: false,
        selectedNodes: [selectedNode],
        selectedEdges: [],
        activeTab: 'property',
        onUpdate: () => undefined,
        ...overrides,
    });

    it('reuses a sidebar when only selection array containers were recreated', () => {
        const previous = createProps();
        const next = { ...previous, selectedNodes: [selectedNode], selectedEdges: [] };
        expect(shouldReuseDesignerRightSidebar(previous, next)).toBe(true);
    });

    it('freezes drag entry and renders after business selection or callback changes', () => {
        const previous = createProps();
        expect(shouldReuseDesignerRightSidebar(
            previous,
            { ...previous, isDraggingNode: true },
        )).toBe(true);
        expect(shouldReuseDesignerRightSidebar(
            previous,
            { ...previous, selectedNodes: [{ id: 'node-b' }] },
        )).toBe(false);
        expect(shouldReuseDesignerRightSidebar(
            previous,
            { ...previous, onUpdate: () => undefined },
        )).toBe(false);
    });

    it('ignores routing geometry while preserving business and style updates', () => {
        const previous = createProps();
        expect(shouldReuseDesignerRightSidebar(previous, {
            ...previous,
            selectedNodes: [{
                ...selectedNode,
                position: { x: 40, y: 12 },
                measured: { width: 180, height: 72 },
            }],
        })).toBe(true);
        expect(shouldReuseDesignerRightSidebar(previous, {
            ...previous,
            selectedNodes: [{ ...selectedNode, data: { label: 'changed' } }],
        })).toBe(false);
    });

    it('preserves complete node updates for custom plugin property panels', () => {
        const activePlugin = { renderCustomPropertyPanel: () => null };
        const previous = createProps({ activePlugin });
        expect(shouldReuseDesignerRightSidebar(previous, {
            ...previous,
            selectedNodes: [{ ...selectedNode, position: { x: 40, y: 12 } }],
        })).toBe(false);
    });

    it('ignores standard plugin context churn but preserves it for a custom panel', () => {
        const previous = createProps({ pluginCtx: { nodes: [] } });
        expect(shouldReuseDesignerRightSidebar(previous, {
            ...previous,
            pluginCtx: { nodes: [{ id: 'geometry-only' }] },
        })).toBe(true);

        const customPrevious = createProps({
            activePlugin: { renderCustomPropertyPanel: () => null },
            pluginCtx: { nodes: [] },
        });
        expect(shouldReuseDesignerRightSidebar(customPrevious, {
            ...customPrevious,
            pluginCtx: { nodes: [{ id: 'custom-panel-input' }] },
        })).toBe(false);
    });

    it('freezes changing form data between active drag frames', () => {
        expect(shouldReuseDesignerRightSidebar(
            createProps({ isDraggingNode: true }),
            createProps({ isDraggingNode: true, selectedNodes: [{ id: 'changed' }] }),
        )).toBe(true);
    });
});
