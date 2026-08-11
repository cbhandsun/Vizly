import { useEffect } from 'react';
import { hasVisibleModalDialog } from '../ui/modalDialogState';

const INTERACTIVE_SHORTCUT_TARGET_SELECTOR = [
    'button',
    'a[href]',
    'summary',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="radio"]',
    '[role="slider"]',
    '[role="spinbutton"]',
    '[role="switch"]',
    '[role="tab"]',
].join(',');

export const shouldIgnoreCanvasShortcutForTarget = (
    target: EventTarget | null,
    hasGlobalModifier: boolean,
): boolean => {
    if (hasGlobalModifier || typeof Element === 'undefined' || !(target instanceof Element)) {
        return false;
    }
    return Boolean(target.closest(INTERACTIVE_SHORTCUT_TARGET_SELECTOR));
};

interface UseKeyboardShortcutsProps {
    onDelete: () => void;
    onDuplicate: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onSelectAll: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onCut?: () => void;
    onGroup: () => void;
    onUngroup: () => void;
    onNudge?: (direction: 'up' | 'down' | 'left' | 'right', distance: number) => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onFitView?: () => void;
    onEnterEdit?: () => void;
    onEscapeEdit?: () => void;
    onOpenCommandPalette?: () => void;
    onShowShortcuts?: () => void;
    pluginShortcuts?: import('../../types/plugin').KeyboardShortcut[];
    pluginCtx?: import('../../types/plugin').PluginContext;
    isGlobalShortcutBlocked?: () => boolean;
}

export const useKeyboardShortcuts = ({
    onDelete,
    onDuplicate,
    onUndo,
    onRedo,
    onSelectAll,
    onCopy,
    onPaste,
    onCut,
    onGroup,
    onUngroup,
    onNudge,
    onZoomIn,
    onZoomOut,
    onFitView,
    onEnterEdit,
    onEscapeEdit,
    onOpenCommandPalette,
    onShowShortcuts,
    pluginShortcuts,
    pluginCtx,
    isGlobalShortcutBlocked = hasVisibleModalDialog,
}: UseKeyboardShortcutsProps) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || isGlobalShortcutBlocked()) return;

            // Ignore if input/textarea is focused or inside a contentEditable
            const target = event.target as HTMLElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
                // 但允许 Escape 键退出编辑
                if (event.key === 'Escape' && onEscapeEdit) {
                    onEscapeEdit();
                }
                return;
            }

            const isCtrlOrCmd = event.ctrlKey || event.metaKey;
            if (shouldIgnoreCanvasShortcutForTarget(target, isCtrlOrCmd)) return;

            // 1. 先触发业务插件拦截
            if (pluginShortcuts && pluginCtx) {
                for (const shortcut of pluginShortcuts) {
                    if (shortcut.trigger(event)) {
                        event.preventDefault();
                        shortcut.action(pluginCtx);
                        return; // 中断内置快捷键的触发
                    }
                }
            }

            // Ctrl/Cmd + = : Zoom In (also catches + on many keyboards)
            if (isCtrlOrCmd && (event.key === '=' || event.key === '+') && onZoomIn) {
                event.preventDefault();
                onZoomIn();
            }
            // Ctrl/Cmd + - : Zoom Out
            else if (isCtrlOrCmd && event.key === '-' && onZoomOut) {
                event.preventDefault();
                onZoomOut();
            }
            // Ctrl/Cmd + 0 : Fit View
            else if (isCtrlOrCmd && event.key === '0' && onFitView) {
                event.preventDefault();
                onFitView();
            }
            // Delete / Backspace
            else if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                onDelete();
            }
            // Ctrl+D: Duplicate
            else if (isCtrlOrCmd && event.key.toLowerCase() === 'd') {
                event.preventDefault();
                onDuplicate();
            }
            // Ctrl+Z: Undo, Ctrl+Shift+Z: Redo
            else if (isCtrlOrCmd && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (event.shiftKey) {
                    onRedo();
                } else {
                    onUndo();
                }
            }
            // Ctrl+Y: Redo
            else if (isCtrlOrCmd && event.key.toLowerCase() === 'y') {
                event.preventDefault();
                onRedo();
            }
            // Ctrl+A: Select All
            else if (isCtrlOrCmd && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                onSelectAll();
            }
            // Ctrl+C: Copy
            else if (isCtrlOrCmd && event.key.toLowerCase() === 'c') {
                event.preventDefault();
                onCopy();
            }
            // Ctrl+V: Paste
            else if (isCtrlOrCmd && event.key.toLowerCase() === 'v') {
                event.preventDefault();
                onPaste();
            }
            // Ctrl+X: Cut
            else if (isCtrlOrCmd && event.key.toLowerCase() === 'x' && onCut) {
                event.preventDefault();
                onCut();
            }
            // Ctrl+G: Group, Ctrl+Shift+G: Ungroup
            else if (isCtrlOrCmd && event.key.toLowerCase() === 'g') {
                event.preventDefault();
                if (event.shiftKey) {
                    onUngroup();
                } else {
                    onGroup();
                }
            }
            // Arrow Keys: Nudge selected nodes
            else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && onNudge) {
                event.preventDefault();
                const distance = event.shiftKey ? 10 : 1; // Shift = 10px, normal = 1px
                const directionMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
                    'ArrowUp': 'up',
                    'ArrowDown': 'down',
                    'ArrowLeft': 'left',
                    'ArrowRight': 'right'
                };
                onNudge(directionMap[event.key], distance);
            }
            // Enter: Edit selected node
            else if (event.key === 'Enter' && onEnterEdit) {
                event.preventDefault();
                onEnterEdit();
            }
            // Escape: Deselect / Exit mode
            else if (event.key === 'Escape' && onEscapeEdit) {
                event.preventDefault();
                onEscapeEdit();
            }
            // Ctrl+K or / : Command Palette
            else if ((isCtrlOrCmd && event.key.toLowerCase() === 'k') || (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName))) {
                if (onOpenCommandPalette) {
                    event.preventDefault();
                    onOpenCommandPalette();
                }
            }
            // ? : Show Keyboard Shortcuts
            else if (event.key === '?' && onShowShortcuts) {
                event.preventDefault();
                onShowShortcuts();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onDelete, onDuplicate, onUndo, onRedo, onSelectAll, onCopy, onPaste, onCut, onGroup, onUngroup, onNudge, onZoomIn, onZoomOut, onFitView, onEnterEdit, onEscapeEdit, onOpenCommandPalette, onShowShortcuts, pluginShortcuts, pluginCtx, isGlobalShortcutBlocked]);
};
