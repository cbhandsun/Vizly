


import { PathFindingResult } from '../types/routing';

export type CachedPathResult = PathFindingResult;

interface CacheItem {
    paramsHash: string;
    result: CachedPathResult;
    timestamp: number;
}

export class EdgeRoutingCache {
    private static instance: EdgeRoutingCache;
    private cache = new Map<string, CacheItem>();
    private maxSize: number = 2000;

    private constructor() { }


    public static getInstance(): EdgeRoutingCache {
        if (!EdgeRoutingCache.instance) {
            EdgeRoutingCache.instance = new EdgeRoutingCache();
        }
        return EdgeRoutingCache.instance;
    }

    /**
     * Generate a lightweight hash for routing parameters.
     * We don't need a cryptographic hash, just a robust unique string.
     */
    public generateKey(edgeId: string, params: Record<string, unknown>): string {
        // Critical dependencies for routing:
        // 1. Source/Target Node Geometry (Position, Size)
        // 2. Port Restrictions (Handles, Direction)
        // 3. Layout Direction
        // 4. Graph Architecture (IsBus, BusTrunk) - implies dependence on neighbors
        // 5. Config (Gap, Radius)

        // For performance, we assume 'params' is already a flat object or structured deterministically.
        // But calculating a hash of the ENTIRE graph context (obstacles) for every edge is too slow.
        // COMPROMISE: We trust the caller (Coordinator) to invalidate us if the global graph topology changes significantly,
        // OR we include a "GraphVersion" ID in the params.

        return `${edgeId}:${JSON.stringify(params)}`;
    }

    public get(key: string): CachedPathResult | undefined {
        const item = this.cache.get(key);
        if (item) {
            item.timestamp = Date.now(); // LRU update
            return item.result;
        }
        return undefined;
    }

    public set(key: string, result: CachedPathResult): void {
        if (this.cache.size >= this.maxSize) {
            this.prune();
        }
        this.cache.set(key, {
            paramsHash: key,
            result,
            timestamp: Date.now()
        });
    }

    private prune(): void {
        // Simple LRU: remove oldest 20%
        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const deleteCount = Math.floor(this.maxSize * 0.2);
        for (let i = 0; i < deleteCount; i++) {
            this.cache.delete(entries[i][0]);
        }
    }

    /**
     * [P2.1] Delete all cache entries for a specific edge.
     * Keys are formatted as `${edgeId}:${params}`, so we match by prefix.
     */
    public deleteByEdgeId(edgeId: string): void {
        const prefix = `${edgeId}:`;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    public clear(): void {
        this.cache.clear();
    }

    public getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
}
