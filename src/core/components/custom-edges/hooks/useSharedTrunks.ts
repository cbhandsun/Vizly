/**
 * useSharedTrunks
 *
 * React hook that subscribes to the EdgeRoutingCoordinator's graphVersion
 * and returns the latest SharedTrunkSegment list after each routing batch.
 *
 * Usage: mount once at the Canvas/FlowchartDesigner level, pass the result
 * to the <SharedTrunkLayer /> component for rendering.
 */
import { useSyncExternalStore } from 'react';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import type { SharedTrunkSegment } from '../../../types/routing';

export function useSharedTrunks(): SharedTrunkSegment[] {
    // Re-runs whenever graphVersion changes (i.e., after every routing batch).
    const _version = useSyncExternalStore(
        (cb) => EdgeRoutingCoordinator.getInstance().subscribeGraphVersion(cb),
        () => EdgeRoutingCoordinator.getInstance().getGraphVersion(),
    );

    // Derive from Coordinator synchronously — no async, no extra state.
    return EdgeRoutingCoordinator.getInstance().getSharedTrunks();
}
