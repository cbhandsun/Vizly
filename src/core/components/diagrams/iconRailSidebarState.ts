export interface ShouldAutoOpenShapesPanelInput {
    activePanel: string | null;
    alreadyAutoOpened: boolean;
    enabled?: boolean;
    isMobile: boolean;
    nodeCount: number;
}

export type MobileIconRailPanelRequest = 'shapes' | 'shapes-search' | 'layers' | 'close';

export const resolveIconRailRequestedPanel = (
    requestedPanel: MobileIconRailPanelRequest,
): 'shapes' | 'layers' | null => {
    if (requestedPanel === 'close') return null;
    return requestedPanel === 'shapes-search' ? 'shapes' : requestedPanel;
};

export const resolveIconRailRequestedFocusTarget = (
    requestedPanel: MobileIconRailPanelRequest,
): 'default' | 'search' => requestedPanel === 'shapes-search' ? 'search' : 'default';

export const shouldAutoOpenShapesPanel = ({
    activePanel,
    alreadyAutoOpened,
    enabled = true,
    isMobile,
    nodeCount,
}: ShouldAutoOpenShapesPanelInput): boolean => (
    enabled
    && !isMobile
    && nodeCount === 0
    && !alreadyAutoOpened
    && activePanel === null
);
