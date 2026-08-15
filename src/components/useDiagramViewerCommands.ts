import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router';

import { readRecentCommandIds } from '@/core/components/ui/commandPaletteStorage';
import {
    readFavoriteDiagramIds,
    readRecentDiagramIds,
    writeFavoriteDiagramIds,
} from '@/core/hooks/diagramHostStorage';
import type { CommandItem } from '@/core/types/plugin';
import { diagramDefinitions } from '@/data/diagram-definitions';
import {
    createDiagramViewerCommandItems,
    getDiagramViewerCommandModifierLabel,
} from './diagramViewerCommandItems';
import { canMutateDiagramDocument } from './diagramViewerPermissions';
import { createDiagramViewerGlobalKeydownHandler } from './diagramViewerKeyboard';
import { hasVisibleModalDialog } from '@/core/components/ui/modalDialogState';
import {
    logDiagramViewerCommandPaletteStateFailure,
    logDiagramViewerFullscreenExitFailure,
    logDiagramViewerOpenNewTabFailure,
} from './diagramViewerLogging';
import { openDiagramViewerInNewTab } from './diagramViewerNavigation';

interface UseDiagramViewerCommandsOptions {
    t: TFunction;
    isFullscreen: boolean;
    isPresentationMode: boolean;
    isReadonly: boolean;
    handleToggleFullscreen: () => void;
    exitFullscreen: () => void;
    handleSelectDiagram: (id: string) => void;
    navigate: NavigateFunction;
    setMermaidModalVisible: (visible: boolean) => void;
    exitPresentation: () => void;
}

export interface DiagramViewerCommandsState {
    commandItems: CommandItem[];
    isCommandOpen: boolean;
    setIsCommandOpen: (open: boolean) => void;
    isSettingsOpen: boolean;
    setIsSettingsOpen: (open: boolean) => void;
    isShortcutsOpen: boolean;
    setIsShortcutsOpen: (open: boolean) => void;
    restoreCommandPaletteFocus: () => void;
    showDebugPanel: boolean;
    setShowDebugPanel: (open: boolean) => void;
}

const clickFirstMatchingElement = (selectors: string[]): void => {
    for (const selector of selectors) {
        const element = document.querySelector<HTMLElement>(selector);
        if (element) {
            element.click();
            return;
        }
    }
};

export function useDiagramViewerCommands({
    t,
    isFullscreen,
    isPresentationMode,
    isReadonly,
    handleToggleFullscreen,
    exitFullscreen,
    handleSelectDiagram,
    navigate,
    setMermaidModalVisible,
    exitPresentation,
}: UseDiagramViewerCommandsOptions): DiagramViewerCommandsState {
    const editingEnabled = canMutateDiagramDocument({ isReadonly, isPresentationMode });
    const [showDebugPanel, setShowDebugPanel] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCommandOpen, setCommandOpen] = useState(false);
    const commandPaletteFocusReturnRef = useRef<HTMLElement | null>(null);
    const [commandFavorites, setCommandFavorites] = useState<string[]>([]);
    const [commandRecent, setCommandRecent] = useState<string[]>([]);
    const [commandRecentOps, setCommandRecentOps] = useState<string[]>([]);
    const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

    const setIsCommandOpen = useCallback((open: boolean) => {
        if (open) {
            const activeElement = document.activeElement;
            commandPaletteFocusReturnRef.current = activeElement instanceof HTMLElement
                && activeElement !== document.body
                ? activeElement
                : null;
        }
        setCommandOpen(open);
    }, []);

    const restoreCommandPaletteFocus = useCallback(() => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                const capturedTarget = commandPaletteFocusReturnRef.current;
                const fallbackTarget = document.querySelector<HTMLElement>('[data-command-palette-focus-return]');
                const target = capturedTarget?.isConnected && capturedTarget !== document.body
                    ? capturedTarget
                    : fallbackTarget;
                target?.focus();
            });
        });
    }, []);

    useEffect(() => {
        if (!isCommandOpen) return;
        const readCommandState = () => {
            try {
                const favorites = readFavoriteDiagramIds();
                const recent = readRecentDiagramIds();
                const recentOps = readRecentCommandIds(8).filter(id => id.startsWith('op:'));
                queueMicrotask(() => {
                    setCommandFavorites(favorites);
                    setCommandRecent(recent);
                    setCommandRecentOps(recentOps.slice(0, 8));
                });
            } catch (error) {
                logDiagramViewerCommandPaletteStateFailure(error);
            }
        };

        readCommandState();
        window.addEventListener('diagramMenuFavoritesChanged', readCommandState);
        window.addEventListener('diagramMenuRecentChanged', readCommandState);
        window.addEventListener('commandPaletteRecentChanged', readCommandState);
        return () => {
            window.removeEventListener('diagramMenuFavoritesChanged', readCommandState);
            window.removeEventListener('diagramMenuRecentChanged', readCommandState);
            window.removeEventListener('commandPaletteRecentChanged', readCommandState);
        };
    }, [isCommandOpen]);

    useEffect(() => {
        const onKeyDown = createDiagramViewerGlobalKeydownHandler({
            isPresentationMode,
            editingEnabled,
            isGlobalShortcutBlocked: hasVisibleModalDialog,
            isFullscreenActive: () => Boolean(document.fullscreenElement),
            exitFullscreen,
            onFullscreenExitFailure: logDiagramViewerFullscreenExitFailure,
            toggleDebugPanel: () => {
                if (import.meta.env.DEV) setShowDebugPanel(previous => !previous);
            },
            openCommandPalette: () => setIsCommandOpen(true),
            openSettings: () => setIsSettingsOpen(true),
            triggerEditorCommand: (action) => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action } })),
            triggerAi: () => clickFirstMatchingElement(['[data-id="toolbar-ai-btn"]', '.toolbar-button-ai']),
            triggerTheme: () => clickFirstMatchingElement(['[data-id="toolbar-theme-btn"]']),
            exitPresentation,
        });
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [editingEnabled, exitFullscreen, exitPresentation, isPresentationMode, setIsCommandOpen]);

    const openDiagramInNewTab = useCallback((id: string) => {
        openDiagramViewerInNewTab({
            id,
            currentHref: window.location.href,
            openWindow: (url, target, features) => window.open(url, target, features),
            logFailure: logDiagramViewerOpenNewTabFailure,
        });
    }, []);

    const commandItems = useMemo(() => createDiagramViewerCommandItems({
        t,
        modifierLabel: getDiagramViewerCommandModifierLabel({
            platform: typeof navigator !== 'undefined' ? navigator.platform || '' : '',
        }),
        isFullscreen,
        editingEnabled,
        commandFavorites,
        commandRecent,
        commandRecentOps,
        diagramDefinitions,
        setIsShortcutsOpen,
        setIsSettingsOpen,
        setMermaidModalVisible,
        handleToggleFullscreen,
        handleSelectDiagram,
        openDiagramInNewTab,
        navigate,
        triggerEditorCommand: (action) => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action } })),
        triggerAiButton: () => clickFirstMatchingElement(['[data-id="toolbar-ai-btn"]', '.toolbar-button-ai']),
        triggerThemeButton: () => clickFirstMatchingElement(['[data-id="toolbar-theme-btn"]']),
        clearFavorites: () => {
            writeFavoriteDiagramIds([]);
            window.dispatchEvent(new CustomEvent('diagramMenuFavoritesChanged'));
        },
    }), [
        commandFavorites,
        commandRecent,
        commandRecentOps,
        handleSelectDiagram,
        handleToggleFullscreen,
        editingEnabled,
        isFullscreen,
        navigate,
        openDiagramInNewTab,
        setMermaidModalVisible,
        t,
    ]);

    return {
        commandItems,
        isCommandOpen,
        setIsCommandOpen,
        isSettingsOpen,
        setIsSettingsOpen,
        isShortcutsOpen,
        setIsShortcutsOpen,
        restoreCommandPaletteFocus,
        showDebugPanel,
        setShowDebugPanel,
    };
}
