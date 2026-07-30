import { useCallback, useEffect } from 'react';

import { setDesignerCommandPaletteVisibility } from '../commandPaletteOwnership';
import type { MobileIconRailPanelRequest } from '../iconRailSidebarState';

interface UseFlowchartChromeCoordinationOptions {
    isMobile: boolean;
    onOpenCommandPalette?: () => void;
    setCommandPaletteVisible: (visible: boolean) => void;
    setLeftDrawerOpen: (visible: boolean) => void;
    setMobileRequestedPanel: (panel: MobileIconRailPanelRequest | null) => void;
    setShowMinimap: (visible: boolean) => void;
}

export const useFlowchartChromeCoordination = ({
    isMobile,
    onOpenCommandPalette,
    setCommandPaletteVisible,
    setLeftDrawerOpen,
    setMobileRequestedPanel,
    setShowMinimap,
}: UseFlowchartChromeCoordinationOptions) => {
    const handleCommandPaletteVisibility = useCallback((visible: boolean) => {
        setDesignerCommandPaletteVisibility({
            visible,
            openHostCommandPalette: onOpenCommandPalette,
            setInternalVisibility: setCommandPaletteVisible,
        });
    }, [onOpenCommandPalette, setCommandPaletteVisible]);

    useEffect(() => {
        if (!isMobile) return;
        const timer = window.setTimeout(() => {
            setShowMinimap(false);
            setMobileRequestedPanel('close');
        }, 0);
        return () => window.clearTimeout(timer);
    }, [isMobile, setMobileRequestedPanel, setShowMinimap]);

    const handleMobilePluginNodeAdded = useCallback(() => {
        setLeftDrawerOpen(false);
        setMobileRequestedPanel('close');
    }, [setLeftDrawerOpen, setMobileRequestedPanel]);

    return { handleCommandPaletteVisibility, handleMobilePluginNodeAdded };
};
