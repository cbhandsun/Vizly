import { useCallback, useEffect, useRef, useState } from 'react';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { findNodeById } from './migrate';
import {
    resolveMindMapNodeAfterSelectionSettles,
    resolveMindMapTopicById,
    resolveSelectedMindMapTopic,
} from './mindMapFloatingSelection';
import { logMindMapFloatingActionFailure } from './mindmapFloatingLogging';

export interface MindMapFloatingBarPosition {
    x: number;
    y: number;
    nodeId: string;
}

interface LegacyUnselectBus {
    addListener: (type: 'unselectNode', handler: () => void) => void;
    removeListener: (type: 'unselectNode', handler: () => void) => void;
}

export function useMindMapFloatingSelection(
    mind: MindElixirInstance | null,
    onSelectionCleared: () => void,
) {
    const [position, setPosition] = useState<MindMapFloatingBarPosition | null>(null);
    const [interactionReady, setInteractionReady] = useState(true);
    const selectedNodeIdRef = useRef<string | null>(null);

    const refreshForNode = useCallback((nodeId: string): boolean => {
        if (!mind) return false;
        const topic = resolveMindMapTopicById(mind, nodeId);
        if (!topic) return false;
        const rect = topic.getBoundingClientRect();
        selectedNodeIdRef.current = nodeId;
        setPosition({ x: rect.left + rect.width / 2, y: rect.top - 8, nodeId });
        return true;
    }, [mind]);

    useEffect(() => {
        if (!mind) return;
        const activeMind = mind;

        let disposed = false;
        let selectionVersion = 0;
        let operationTimer: ReturnType<typeof setTimeout> | null = null;
        let interactionReleaseTimer: ReturnType<typeof setTimeout> | number | null = null;
        let pointerActive = false;

        const cancelInteractionRelease = () => {
            if (interactionReleaseTimer === null) return;
            if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(interactionReleaseTimer as number);
            }
            clearTimeout(interactionReleaseTimer);
            interactionReleaseTimer = null;
        };

        const releaseInteractionAfterPointerSequence = () => {
            if (!pointerActive) return;
            pointerActive = false;
            cancelInteractionRelease();
            const release = () => {
                interactionReleaseTimer = null;
                if (!disposed) setInteractionReady(true);
            };
            interactionReleaseTimer = typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame(release)
                : setTimeout(release, 0);
        };

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (
                event.button !== 0
                || !(target instanceof Node)
                || !activeMind.container.contains(target)
            ) return;
            cancelInteractionRelease();
            pointerActive = true;
        };

        function clearSelection() {
            selectedNodeIdRef.current = null;
            setPosition(null);
            setInteractionReady(true);
            onSelectionCleared();
        }

        function reconcileTransientDeselection() {
            const deselectionVersion = ++selectionVersion;
            const fallbackNodeId = selectedNodeIdRef.current;
            void resolveMindMapNodeAfterSelectionSettles(activeMind, fallbackNodeId).then(recoveredNode => {
                if (disposed || deselectionVersion !== selectionVersion) return;
                if (recoveredNode) onSelect([recoveredNode]);
                else clearSelection();
            });
        }

        function onSelect(nodes: NodeObj[] | null) {
            const node = nodes?.[0] ?? null;
            if (!node) {
                if (resolveSelectedMindMapTopic(activeMind, selectedNodeIdRef.current)) return;
                reconcileTransientDeselection();
                return;
            }
            const selectionChanged = selectedNodeIdRef.current !== node.id;
            selectionVersion += 1;
            selectedNodeIdRef.current = node.id;
            if (selectionChanged && pointerActive) setInteractionReady(false);
            else if (!pointerActive) setInteractionReady(true);
            try {
                if (!refreshForNode(node.id)) setPosition(null);
            } catch (error) {
                logMindMapFloatingActionFailure('selectPosition', error);
                setPosition(null);
            }
        }

        function onDeselect() {
            if (resolveSelectedMindMapTopic(activeMind, selectedNodeIdRef.current)) return;
            reconcileTransientDeselection();
        }

        const onSelectNewNode = (node: NodeObj) => onSelect([node]);
        const onOperation = () => {
            if (operationTimer) clearTimeout(operationTimer);
            operationTimer = setTimeout(() => {
                const topic = resolveSelectedMindMapTopic(activeMind, selectedNodeIdRef.current);
                const nodeId = topic?.dataset?.nodeid ?? '';
                if (!nodeId || !refreshForNode(nodeId)) setPosition(null);
            }, 50);
        };
        const legacyBus = activeMind.bus as unknown as LegacyUnselectBus;

        activeMind.bus.addListener('selectNodes', onSelect);
        activeMind.bus.addListener('selectNewNode', onSelectNewNode);
        activeMind.bus.addListener('unselectNodes', onDeselect);
        activeMind.bus.addListener('operation', onOperation);
        legacyBus.addListener('unselectNode', onDeselect);
        window.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('pointerup', releaseInteractionAfterPointerSequence, true);
        window.addEventListener('pointercancel', releaseInteractionAfterPointerSequence, true);
        window.addEventListener('blur', releaseInteractionAfterPointerSequence);

        const existingTopic = resolveSelectedMindMapTopic(activeMind, null);
        const existingNodeId = existingTopic?.dataset?.nodeid ?? '';
        const existingNode = existingNodeId
            ? findNodeById(activeMind.getData().nodeData, existingNodeId)
            : null;
        if (existingNode) onSelect([existingNode]);

        return () => {
            disposed = true;
            if (operationTimer) clearTimeout(operationTimer);
            cancelInteractionRelease();
            activeMind.bus.removeListener('selectNodes', onSelect);
            activeMind.bus.removeListener('selectNewNode', onSelectNewNode);
            activeMind.bus.removeListener('unselectNodes', onDeselect);
            activeMind.bus.removeListener('operation', onOperation);
            legacyBus.removeListener('unselectNode', onDeselect);
            window.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('pointerup', releaseInteractionAfterPointerSequence, true);
            window.removeEventListener('pointercancel', releaseInteractionAfterPointerSequence, true);
            window.removeEventListener('blur', releaseInteractionAfterPointerSequence);
        };
    }, [mind, onSelectionCleared, refreshForNode]);

    return { interactionReady, position, refreshForNode };
}
