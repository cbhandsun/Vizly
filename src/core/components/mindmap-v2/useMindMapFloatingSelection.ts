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

        function clearSelection() {
            selectedNodeIdRef.current = null;
            setPosition(null);
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
            selectionVersion += 1;
            selectedNodeIdRef.current = node.id;
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

        const existingTopic = resolveSelectedMindMapTopic(activeMind, null);
        const existingNodeId = existingTopic?.dataset?.nodeid ?? '';
        const existingNode = existingNodeId
            ? findNodeById(activeMind.getData().nodeData, existingNodeId)
            : null;
        if (existingNode) onSelect([existingNode]);

        return () => {
            disposed = true;
            if (operationTimer) clearTimeout(operationTimer);
            activeMind.bus.removeListener('selectNodes', onSelect);
            activeMind.bus.removeListener('selectNewNode', onSelectNewNode);
            activeMind.bus.removeListener('unselectNodes', onDeselect);
            activeMind.bus.removeListener('operation', onOperation);
            legacyBus.removeListener('unselectNode', onDeselect);
        };
    }, [mind, onSelectionCleared, refreshForNode]);

    return { position, refreshForNode };
}
