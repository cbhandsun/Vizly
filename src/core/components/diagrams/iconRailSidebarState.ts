export interface ShouldAutoOpenShapesPanelInput {
    activePanel: string | null;
    alreadyAutoOpened: boolean;
    enabled?: boolean;
    isMobile: boolean;
    nodeCount: number;
}

export type MobileIconRailPanelRequest = 'shapes' | 'layers' | 'close';

export const resolveIconRailRequestedPanel = (
    requestedPanel: MobileIconRailPanelRequest,
): 'shapes' | 'layers' | null => requestedPanel === 'close' ? null : requestedPanel;

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
