export const shouldExpandDesignerRightSidebar = ({
    isCollapsed,
    hasSelection,
    activeTab,
    aiChatVisible,
    previousAiChatVisible,
}: {
    isCollapsed: boolean;
    hasSelection: boolean;
    activeTab: 'property' | 'ai';
    aiChatVisible: boolean;
    previousAiChatVisible: boolean;
}): boolean => (
    isCollapsed
    && (
        hasSelection
        || (activeTab === 'ai' && aiChatVisible && !previousAiChatVisible)
    )
);

export const shouldOpenDesignerAiSidebar = (
    activeTab: 'property' | 'ai',
    aiChatVisible: boolean,
): boolean => activeTab !== 'ai' || !aiChatVisible;

export const shouldFreezeDesignerRightSidebarDuringDrag = (
    previous: { isDraggingNode: boolean },
    next: { isDraggingNode: boolean },
): boolean => previous.isDraggingNode && next.isDraggingNode;
