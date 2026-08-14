import { AimOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MindElixirInstance } from 'mind-elixir';

import { getMindMapFocusAvailability } from './mindMapFocusAvailability';
import { shouldExitMindMapFocusOnEscape } from './mindMapFocusInteraction';
import { logMindmapToolbarFocusModeFailure } from './mindmapToolbarLogging';
import MindMapToolbarIconButton from './MindMapToolbarIconButton';
import { useMindMapFocusMode } from './useMindMapFocusMode';
import { useMindMapPropertySelection } from './useMindMapPropertySelection';

interface MindMapFocusButtonProps {
    mind: MindElixirInstance | null;
}

const MindMapFocusButton = ({ mind }: MindMapFocusButtonProps) => {
    const { t } = useTranslation();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const restoreFocusOnExitRef = useRef(false);
    const firstRestoreFrameRef = useRef<number | null>(null);
    const secondRestoreFrameRef = useRef<number | null>(null);
    const focusedNodeIdRef = useRef<string | null>(null);
    const selectedNode = useMindMapPropertySelection(mind);
    const availability = getMindMapFocusAvailability(mind, selectedNode);
    const { isFocused, toggleFocusMode } = useMindMapFocusMode(
        mind,
        logMindmapToolbarFocusModeFailure,
    );

    const cancelScheduledFocusRestore = useCallback(() => {
        if (firstRestoreFrameRef.current !== null) {
            window.cancelAnimationFrame(firstRestoreFrameRef.current);
            firstRestoreFrameRef.current = null;
        }
        if (secondRestoreFrameRef.current !== null) {
            window.cancelAnimationFrame(secondRestoreFrameRef.current);
            secondRestoreFrameRef.current = null;
        }
    }, []);

    const scheduleInteractionFocusRestore = useCallback(() => {
        cancelScheduledFocusRestore();
        firstRestoreFrameRef.current = window.requestAnimationFrame(() => {
            firstRestoreFrameRef.current = null;
            secondRestoreFrameRef.current = window.requestAnimationFrame(() => {
                secondRestoreFrameRef.current = null;
                const button = buttonRef.current;
                if (button?.isConnected && !button.disabled) {
                    button.focus({ preventScroll: true });
                    return;
                }
                const focusedNodeId = focusedNodeIdRef.current;
                if (!mind || !focusedNodeId) return;
                try {
                    const node = mind.findEle(focusedNodeId);
                    if (node instanceof HTMLElement) {
                        node.tabIndex = -1;
                        mind.selectNode(node);
                        node.focus({ preventScroll: true });
                    }
                } catch (error) {
                    logMindmapToolbarFocusModeFailure(error);
                }
            });
        });
    }, [cancelScheduledFocusRestore, mind]);

    useEffect(() => cancelScheduledFocusRestore, [cancelScheduledFocusRestore]);

    useLayoutEffect(() => {
        if (isFocused || !restoreFocusOnExitRef.current) return;
        restoreFocusOnExitRef.current = false;
        scheduleInteractionFocusRestore();
    }, [isFocused, scheduleInteractionFocusRestore]);

    const exitFocusMode = useCallback(() => {
        restoreFocusOnExitRef.current = true;
        try {
            toggleFocusMode();
        } catch (error) {
            restoreFocusOnExitRef.current = false;
            logMindmapToolbarFocusModeFailure(error);
        }
    }, [toggleFocusMode]);

    useEffect(() => {
        if (!isFocused) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (!shouldExitMindMapFocusOnEscape(event)) return;
            event.preventDefault();
            event.stopPropagation();
            exitFocusMode();
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [exitFocusMode, isFocused]);

    const handleFocusMode = () => {
        if (isFocused) {
            exitFocusMode();
            return;
        }
        try {
            focusedNodeIdRef.current = selectedNode?.id ?? null;
            toggleFocusMode(selectedNode?.id);
        } catch (error) {
            logMindmapToolbarFocusModeFailure(error);
        }
    };

    return (
        <MindMapToolbarIconButton
            ref={buttonRef}
            label={t(isFocused ? 'plugins.mindmap.toolbar.exitFocus' : 'plugins.mindmap.toolbar.enterFocus')}
            icon={<AimOutlined />}
            onClick={handleFocusMode}
            disabled={!isFocused && !availability.enabled}
            pressed={isFocused}
            aria-keyshortcuts={isFocused ? 'Escape' : undefined}
            style={{ color: isFocused ? '#6366f1' : undefined }}
        />
    );
};

export default MindMapFocusButton;
