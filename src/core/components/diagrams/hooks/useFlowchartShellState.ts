import { useEffect, useRef, useState } from 'react';
import { BackgroundVariant } from '@xyflow/react';

import type { DiffResult } from '../../../utils/diagramDiff';
import type { PresentationSlide } from '../../../hooks/usePresentationSlides';
import { readFlowchartOnboardingDismissed } from '../flowchartOnboardingStorage';
import type { MobileIconRailPanelRequest } from '../iconRailSidebarState';
import {
    readFlowchartCanvasPreferences,
    writeFlowchartCanvasPreferences,
    type FlowchartCanvasPreferences,
} from '../flowchartCanvasPreferences';

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

interface FlowchartInitialCanvasPreferences {
    showGrid: boolean;
    gridVariant: BackgroundVariant;
    showMinimap: boolean;
    showRuler: boolean;
    snapEnabled: boolean;
}

const resolveGridVariant = (
    value: FlowchartCanvasPreferences['gridVariant'] | undefined,
): BackgroundVariant => {
    switch (value) {
        case 'dots':
            return BackgroundVariant.Dots;
        case 'cross':
            return BackgroundVariant.Cross;
        case 'lines':
        default:
            return BackgroundVariant.Lines;
    }
};

const serializeGridVariant = (
    value: BackgroundVariant,
): FlowchartCanvasPreferences['gridVariant'] => {
    switch (value) {
        case BackgroundVariant.Dots:
            return 'dots';
        case BackgroundVariant.Cross:
            return 'cross';
        case BackgroundVariant.Lines:
        default:
            return 'lines';
    }
};

const getThemeGridSignature = (value: FlowchartThemeGridState | null): string => (
    value ? `${value.showGrid}:${value.gridVariant ?? ''}` : 'invalid'
);

export const resolveFlowchartInitialCanvasPreferences = (
    themeGrid: unknown,
    initialShowMinimap: boolean,
    persistedPreferences: FlowchartCanvasPreferences | null,
): FlowchartInitialCanvasPreferences => {
    if (persistedPreferences) {
        return {
            showGrid: persistedPreferences.showGrid,
            gridVariant: resolveGridVariant(persistedPreferences.gridVariant),
            showMinimap: persistedPreferences.showMinimap,
            showRuler: persistedPreferences.showRuler,
            snapEnabled: persistedPreferences.snapEnabled,
        };
    }

    const themeGridState = coerceFlowchartThemeGridState(themeGrid);
    return {
        showGrid: themeGridState?.showGrid ?? true,
        gridVariant: themeGridState?.gridVariant ?? BackgroundVariant.Lines,
        showMinimap: initialShowMinimap,
        showRuler: false,
        snapEnabled: true,
    };
};

export function useFlowchartShellState(themeGrid: unknown, initialShowMinimap = true) {
    const [initialCanvasPreferences] = useState(() => resolveFlowchartInitialCanvasPreferences(
        themeGrid,
        initialShowMinimap,
        readFlowchartCanvasPreferences(),
    ));
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
    const [canvasSearchReplaceVisible, setCanvasSearchReplaceVisible] = useState(false);
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
    const [showGrid, setShowGrid] = useState(initialCanvasPreferences.showGrid);
    const [showMinimap, setShowMinimap] = useState(initialCanvasPreferences.showMinimap);
    const [snapEnabled, setSnapEnabled] = useState(initialCanvasPreferences.snapEnabled);
    const [showRuler, setShowRuler] = useState(initialCanvasPreferences.showRuler);
    const [gridVariant, setGridVariant] = useState<BackgroundVariant>(initialCanvasPreferences.gridVariant);
    const lastThemeGridSignatureRef = useRef(getThemeGridSignature(
        coerceFlowchartThemeGridState(themeGrid),
    ));
    const hasMountedPreferencePersistenceRef = useRef(false);

    useEffect(() => {
        const nextGridState = coerceFlowchartThemeGridState(themeGrid);
        const nextSignature = getThemeGridSignature(nextGridState);
        if (nextSignature === lastThemeGridSignatureRef.current) return;
        lastThemeGridSignatureRef.current = nextSignature;
        if (!nextGridState) return;
        const timer = window.setTimeout(() => {
            setShowGrid(nextGridState.showGrid);
            if (nextGridState.gridVariant) setGridVariant(nextGridState.gridVariant);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [themeGrid]);

    useEffect(() => {
        if (!hasMountedPreferencePersistenceRef.current) {
            hasMountedPreferencePersistenceRef.current = true;
            return;
        }
        writeFlowchartCanvasPreferences({
            version: 1,
            showGrid,
            gridVariant: serializeGridVariant(gridVariant),
            showMinimap,
            showRuler,
            snapEnabled,
        });
    }, [gridVariant, showGrid, showMinimap, showRuler, snapEnabled]);

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
        presentationActive, setPresentationActive, laserEnabled, diffResult, setDiffResult,
        canvasSearchVisible, setCanvasSearchVisible, canvasSearchReplaceVisible, setCanvasSearchReplaceVisible,
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
