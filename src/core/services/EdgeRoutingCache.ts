


import { PathFindingResult } from '../types/routing';

export type CachedPathResult = PathFindingResult;

interface CacheItem {
    paramsHash: string;
    result: CachedPathResult;
    timestamp: number;
    expiresAt: number; // [FIX C-7] TTL 过期时间戳
}


export class EdgeRoutingCache {
    private static instance: EdgeRoutingCache;
    private cache = new Map<string, CacheItem>();
    private maxSize: number = 2000;
    private defaultMaxAgeMs: number = 60_000; // [FIX C-7] 默认 60s TTL

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
        // [FIX C-2] 改为固定顺序的字段拼接，替代 JSON.stringify。
        // JSON.stringify 在不同调用路径构造的对象上 key 顺序可能不一致，
        // 导致相同坐标产生不同 cache key，缓存命中率趋近于零。
        // Keep port fields and routing version in the key: endpoint coordinates can
        // remain stable while the selected side/handle changes, which changes the
        // required first/last segment direction and must invalidate stale paths.
        const p = params;
        return [
            edgeId,
            p.rv ?? 0,
            p.s ?? '',
            p.t ?? '',
            p.sx ?? 0,
            p.sy ?? 0,
            p.tx ?? 0,
            p.ty ?? 0,
            p.sr ?? '0',
            p.tr ?? '0',
            p.type ?? 's',
            p.sourceHandle ?? '',
            p.targetHandle ?? '',
            p.sourcePosition ?? '',
            p.targetPosition ?? '',
            p.bus ?? '',
            p.pe ?? 0,  // [H-9] pendingEdges XOR hash — changes when neighboring edges reroute
            p.version ?? 0,
        ].join('|');
    }

    public get(key: string): CachedPathResult | undefined {
        const item = this.cache.get(key);
        if (item) {
            // [FIX C-7] 校验 TTL，过期直接删除并返回 undefined
            if (Date.now() > item.expiresAt) {
                this.cache.delete(key);
                return undefined;
            }
            item.timestamp = Date.now(); // LRU update
            return item.result;
        }
        return undefined;
    }

    public set(key: string, result: CachedPathResult, maxAgeMs?: number): void {
        if (this.cache.size >= this.maxSize) {
            this.prune();
        }
        const ttl = maxAgeMs ?? this.defaultMaxAgeMs;
        this.cache.set(key, {
            paramsHash: key,
            result,
            timestamp: Date.now(),
            expiresAt: Date.now() + ttl, // [FIX C-7]
        });
    }

    // [FIX C-7] 允许调用方动态调整全局默认 TTL
    public setMaxAge(ms: number): void {
        this.defaultMaxAgeMs = Math.max(1000, ms);
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
     * Keys are formatted as `${edgeId}|...`, so match the pipe-delimited prefix.
     */
    public deleteByEdgeId(edgeId: string): void {
        const pipePrefix = `${edgeId}|`;
        const legacyColonPrefix = `${edgeId}:`;
        for (const key of this.cache.keys()) {
            if (key.startsWith(pipePrefix) || key.startsWith(legacyColonPrefix)) {
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
