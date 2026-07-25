/**
 * useSharedTrunks
 *
 * React hook that subscribes to the EdgeRoutingCoordinator's graphVersion
 * and returns the latest SharedTrunkSegment list after each routing batch.
 *
 * Usage: mount once at the Canvas/FlowchartDesigner level, pass the result
 * to the <SharedTrunkLayer /> component for rendering.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import type { SharedTrunkSegment } from '../../../types/routing';

export function useSharedTrunks(enabled = true): SharedTrunkSegment[] {
    const subscribe = useCallback((callback: () => void) => {
        if (!enabled) return () => undefined;
        return EdgeRoutingCoordinator.getInstance().subscribeGraphVersion(callback);
    }, [enabled]);
    const getSnapshot = useCallback(
        () => enabled ? EdgeRoutingCoordinator.getInstance().getGraphVersion() : 0,
        [enabled],
    );
    const _version = useSyncExternalStore(
        subscribe,
        getSnapshot,
        () => 0,
    );

    if (!enabled) return [];
    return EdgeRoutingCoordinator.getInstance().getSharedTrunks();
}
