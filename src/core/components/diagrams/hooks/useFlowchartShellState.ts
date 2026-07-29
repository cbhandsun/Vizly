import { useEffect, useState } from 'react';
import { BackgroundVariant } from '@xyflow/react';

import type { DiffResult } from '../../../utils/diagramDiff';
import type { PresentationSlide } from '../../../hooks/usePresentationSlides';
import { readFlowchartOnboardingDismissed } from '../flowchartOnboardingStorage';
import type { MobileIconRailPanelRequest } from '../iconRailSidebarState';

export interface FlowchartThemeGridState {
    showGrid: boolean;
    gridVariant?: BackgroundVariant;
}

export const coerceFlowchartThemeGridState = (value: unknown): FlowchartThemeGridState | null => {
    const rawStyle = typeof value === 'string'
        ? value
        : (value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>).style
            : undefined);
    if (typeof rawStyle !== 'string') return null;
    switch (rawStyle.trim().toLowerCase()) {
        case 'dots':
            return { showGrid: true, gridVariant: BackgroundVariant.Dots };
        case 'lines':
            return { showGrid: true, gridVariant: BackgroundVariant.Lines };
        case 'cross':
            return { showGrid: true, gridVariant: BackgroundVariant.Cross };
        case 'none':
        case 'hidden':
            return { showGrid: false };
        default:
            return null;
    }
};

export function useFlowchartShellState(themeGrid: unknown, initialShowMinimap = true) {
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [leftDrawerWidth, setLeftDrawerWidth] = useState(300);
    const [rightSidebarWidth, setRightSidebarWidth] = useState(300);
    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [historyPanelVisible, setHistoryPanelVisible] = useState(false);
    const [jsonEditorVisible, setJsonEditorVisible] = useState(false);
    const [presentationActive, setPresentationActive] = useState(false);
    const [laserEnabled, setLaserEnabled] = useState(false);
    const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
    const [canvasSearchVisible, setCanvasSearchVisible] = useState(false);
    const [mobileRequestedPanel, setMobileRequestedPanel] = useState<MobileIconRailPanelRequest | null>(null);
    const [mobilePropertyDrawerVisible, setMobilePropertyDrawerVisible] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [pluginManagerVisible, setPluginManagerVisible] = useState(false);
    const [aiChatVisible, setAiChatVisible] = useState(false);
    const [activeRightTab, setActiveRightTab] = useState<'property' | 'ai'>('property');
    const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
    const [shortcutHelpVisible, setShortcutHelpVisible] = useState(false);
    const [showShortcuts, setShowShortcutsModal] = useState(false);
    const [presentationSlides, setPresentationSlides] = useState<PresentationSlide[]>([]);
    const [, setHighlightedNodeId] = useState<string | null>(null);
    const [onboardingDismissed, setOnboardingDismissed] = useState(readFlowchartOnboardingDismissed);
    const [showGrid, setShowGrid] = useState(true);
    const [showMinimap, setShowMinimap] = useState(initialShowMinimap);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [showRuler, setShowRuler] = useState(false);
    const [gridVariant, setGridVariant] = useState<BackgroundVariant>(BackgroundVariant.Lines);

    useEffect(() => {
        const nextGridState = coerceFlowchartThemeGridState(themeGrid);
        if (!nextGridState) return;
        const timer = window.setTimeout(() => {
            setShowGrid(nextGridState.showGrid);
            if (nextGridState.gridVariant) setGridVariant(nextGridState.gridVariant);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [themeGrid]);

    useEffect(() => {
        if (!presentationActive) {
            const timer = window.setTimeout(() => setLaserEnabled(false), 0);
            return () => window.clearTimeout(timer);
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
            if (event.key.toLowerCase() === 'l') setLaserEnabled(current => !current);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [presentationActive]);

    return {
        isSidebarHidden: false,
        leftDrawerOpen, setLeftDrawerOpen, leftDrawerWidth, setLeftDrawerWidth, rightSidebarWidth, setRightSidebarWidth,
        isDrawingMode, setIsDrawingMode, historyPanelVisible, setHistoryPanelVisible, jsonEditorVisible, setJsonEditorVisible,
        presentationActive, setPresentationActive, laserEnabled, diffResult, setDiffResult, canvasSearchVisible, setCanvasSearchVisible,
        mobileRequestedPanel, setMobileRequestedPanel, mobilePropertyDrawerVisible, setMobilePropertyDrawerVisible,
        exportModalVisible, setExportModalVisible, pluginManagerVisible, setPluginManagerVisible,
        aiChatVisible, setAiChatVisible, activeRightTab, setActiveRightTab,
        commandPaletteVisible, setCommandPaletteVisible, shortcutHelpVisible, setShortcutHelpVisible,
        showShortcuts, setShowShortcutsModal, jsonEditorInitialContent: undefined as string | undefined,
        showPerformanceDashboard: false,
        presentationSlides, setPresentationSlides, setHighlightedNodeId,
        onboardingDismissed, setOnboardingDismissed,
        showGrid, setShowGrid, showMinimap, setShowMinimap, snapEnabled, setSnapEnabled,
        showRuler, setShowRuler, gridVariant, setGridVariant,
    };
}
