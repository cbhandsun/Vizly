import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import { collaborationService } from '../../services/CollaborationService';
import type { MindElixirInstance } from 'mind-elixir';

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
                const data = JSON.parse(remoteData);
                instance.refresh(data);
            } catch (e) {
                console.error('[MindMap Yjs] Initial sync parse error:', e);
            }
            isRemoteUpdating.current = false;
        } else {
            // Push local data if room is empty
            yMap.set('nodeData', JSON.stringify(instance.getData()));
        }

        // Listen to local mindmap operations
        const handleLocalOperation = (operation: any) => {
            if (isRemoteUpdating.current) return;
            try {
                const currentData = JSON.stringify(instance.getData());
                const lastData = yMap.get('nodeData') as string | undefined;
                if (currentData !== lastData) {
                    yMap.set('nodeData', currentData);
                }
            } catch (e) {
                console.error('[MindMap Yjs] Failed to serialize local operation:', e);
            }
        };

        instance.bus.addListener('operation', handleLocalOperation);

        // Listen to remote changes
        const handleRemoteChange = (event: Y.YMapEvent<any>) => {
            if (event.transaction.local) return; // Ignore our own changes

            if (event.keysChanged.has('nodeData')) {
                const newDataStr = yMap.get('nodeData') as string | undefined;
                if (newDataStr) {
                    const localDataStr = JSON.stringify(instance.getData());
                    // Only refresh if truly different to prevent jitter
                    if (newDataStr !== localDataStr) {
                        isRemoteUpdating.current = true;
                        try {
                            const data = JSON.parse(newDataStr);
                            // Refresh redraws the map with new data
                            instance.refresh(data);
                        } catch (e) {
                            console.error('[MindMap Yjs] Remote sync parse error:', e);
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
            } catch (e) {}
            yMap.unobserve(handleRemoteChange);
        };
    }, [instance]);

    return null;
}
