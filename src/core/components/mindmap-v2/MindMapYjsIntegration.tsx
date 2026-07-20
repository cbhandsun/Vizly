import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import { collaborationService } from '../../services/CollaborationService';
import type { MindElixirInstance } from 'mind-elixir';
import { parseRemoteMindMapYjsData, serializeLocalMindMapYjsData } from './mindmapYjsSecurity';
import { refreshMindElixirWithSanitizedData } from './mindmapTreeSanitizer';
import {
    logMindmapYjsCleanupFailure,
    logMindmapYjsInitialSyncParseFailure,
    logMindmapYjsLocalSerializeFailure,
    logMindmapYjsRemoteSyncParseFailure,
} from './mindmapPanelLogging';

export default function MindMapYjsIntegration() {
    const [instance, setInstance] = useState<MindElixirInstance | null>(getMindElixirInstance());
    const isRemoteUpdating = useRef(false);

    useEffect(() => {
        return subscribeMindElixir(() => {
            setInstance(getMindElixirInstance());
        });
    }, []);

    useEffect(() => {
        if (!instance) return;
        if (!collaborationService.isInitialized() || !collaborationService.isConnected()) {
            return;
        }

        const doc = collaborationService.getDoc();
        const yMap = doc.getMap('mindmap-data');

        // Initial sync from remote
        const remoteData = yMap.get('nodeData') as string | undefined;
        if (remoteData) {
            isRemoteUpdating.current = true;
            try {
                const data = parseRemoteMindMapYjsData(remoteData);
                refreshMindElixirWithSanitizedData(instance, data);
            } catch (e) {
                logMindmapYjsInitialSyncParseFailure(e);
            }
            isRemoteUpdating.current = false;
        } else {
            // Push local data if room is empty
            yMap.set('nodeData', serializeLocalMindMapYjsData(instance.getData()));
        }

        // Listen to local mindmap operations
        const handleLocalOperation = (_operation: any) => {
            if (isRemoteUpdating.current) return;
            try {
                const currentData = serializeLocalMindMapYjsData(instance.getData());
                const lastData = yMap.get('nodeData') as string | undefined;
                if (currentData !== lastData) {
                    yMap.set('nodeData', currentData);
                }
            } catch (e) {
                logMindmapYjsLocalSerializeFailure(e);
            }
        };

        instance.bus.addListener('operation', handleLocalOperation);

        // Listen to remote changes
        const handleRemoteChange = (event: Y.YMapEvent<any>) => {
            if (event.transaction.local) return; // Ignore our own changes

            if (event.keysChanged.has('nodeData')) {
                const newDataStr = yMap.get('nodeData') as string | undefined;
                if (newDataStr) {
                    const localDataStr = serializeLocalMindMapYjsData(instance.getData());
                    // Only refresh if truly different to prevent jitter
                    if (newDataStr !== localDataStr) {
                        isRemoteUpdating.current = true;
                        try {
                            const data = parseRemoteMindMapYjsData(newDataStr);
                            // Refresh redraws the map with new data
                            refreshMindElixirWithSanitizedData(instance, data);
                        } catch (e) {
                            logMindmapYjsRemoteSyncParseFailure(e);
                        }
                        isRemoteUpdating.current = false;
                    }
                }
            }
        };

        yMap.observe(handleRemoteChange);

        return () => {
            try {
                // Not all mind-elixir versions expose removeListener, but it's standard.
                if (typeof instance.bus.removeListener === 'function') {
                    instance.bus.removeListener('operation', handleLocalOperation);
                }
            } catch (error) {
                logMindmapYjsCleanupFailure(error);
            }
            yMap.unobserve(handleRemoteChange);
        };
    }, [instance]);

    return null;
}
