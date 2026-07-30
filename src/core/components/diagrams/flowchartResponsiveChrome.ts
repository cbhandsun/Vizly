interface FlowchartOnboardingVisibilityOptions {
    isMobile: boolean;
    pluginId: string;
    isInitialDiagramLoading: boolean;
    onboardingDismissed: boolean;
    leftDrawerOpen: boolean;
    nodeCount: number;
    edgeCount: number;
    jsonEditorVisible: boolean;
    selectedNodeCount: number;
    selectedEdgeCount: number;
}

export const shouldShowFlowchartOnboarding = ({
    isMobile,
    pluginId,
    isInitialDiagramLoading,
    onboardingDismissed,
    leftDrawerOpen,
    nodeCount,
    edgeCount,
    jsonEditorVisible,
    selectedNodeCount,
    selectedEdgeCount,
}: FlowchartOnboardingVisibilityOptions): boolean => (
    !isMobile
    && pluginId !== 'mindmap'
    && !isInitialDiagramLoading
    && !onboardingDismissed
    && !leftDrawerOpen
    && nodeCount <= 1
    && edgeCount === 0
    && !jsonEditorVisible
    && selectedNodeCount === 0
    && selectedEdgeCount === 0
);

export const shouldShowFlowchartMinimapByDefault = (isMobile: boolean): boolean => !isMobile;

export const shouldFitFlowchartAfterMobileTransition = (
    wasMobile: boolean,
    isMobile: boolean,
    nodeCount: number,
): boolean => (
    !wasMobile
    && isMobile
    && Number.isFinite(nodeCount)
    && nodeCount > 0
);
