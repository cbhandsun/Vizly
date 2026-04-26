/**
 * Visibility Graph Cache Manager
 * 
 * LRU cache for pre-built visibility graphs with intelligent invalidation.
 * Provides significant speedup by avoiding repeated graph construction.
 * 
 * Features:
 * - LRU eviction policy (keeps most recently used graphs)
 * - Content-based cache keys (hash of obstacle configuration)
 * - Cache statistics and hit rate tracking
 * - Configurable size limits
 * - Async prebuild support (future enhancement)
 * 
 * Performance:
 * - Cache hit: ~0ms (instant graph retrieval)
 * - Cache miss: ~50-500ms (full VG build)
 * - Expected hit rate: 70-90% in typical workflows
 */

import type { Rectangle } from './geometryUtils';
import type { VisibilityGraph } from './visibilityGraph';
import { buildVisibilityGraph } from './visibilityGraph';
import type { SpatialIndex } from './SpatialIndex';

export interface CacheEntry {
    graph: VisibilityGraph;
    obstacleHash: string;
    timestamp: number;
    hitCount: number;
    lastAccess: number;
    buildTime: number;
}

export interface CacheStats {
    size: number;
    maxSize: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
    totalBuildTime: number;
    avgBuildTime: number;
    memoryEstimate: number;
}

export interface VGCacheConfig {
    maxSize?: number;           // Max number of cached graphs (default: 10)
    enablePrebuild?: boolean;   // Enable async prebuilding (default: false)
    autoEvict?: boolean;        // Auto evict on size limit (default: true)
}

/**
 * Visibility Graph Cache Manager
 * 
 * Maintains an LRU cache of visibility graphs to avoid repeated construction.
 */
export class VisibilityGraphCache {
    // [J-2] Use Map insertion order as LRU instead of a separate lruList array.
    // JS Map preserves insertion order and supports O(1) delete+set for LRU promotion.
    // This eliminates:
    //   - updateLRU: indexOf O(N) + splice O(N) + push O(1)
    //   - evictLRU:  shift O(N)
    // Both become O(1) operations on the Map itself.
    private cache: Map<string, CacheEntry>;
    private config: Required<VGCacheConfig>;

    private hitCount: number = 0;
    private missCount: number = 0;
    private totalBuildTime: number = 0;

    constructor(config: VGCacheConfig = {}) {
        this.config = {
            maxSize: config.maxSize ?? 10,
            enablePrebuild: config.enablePrebuild ?? false,
            autoEvict: config.autoEvict ?? true
        };

        this.cache = new Map();
    }

    /**
     * Get or build a visibility graph
     * 
     * @param obstacles Obstacle list
     * @param spatialIndex Optional spatial index
     * @param builder Optional custom builder function
     * @returns Visibility graph
     */
    getOrBuild(
        obstacles: Rectangle[],
        spatialIndex?: SpatialIndex,
        builder?: () => VisibilityGraph,
        options?: { obstacleOffset?: number }
    ): VisibilityGraph {
        // [FIX] Include obstacleOffset in cache key to avoid cache poisoning
        const key = this.generateCacheKey(obstacles) + `|off:${options?.obstacleOffset ?? 5}`;

        // Cache hit
        if (this.cache.has(key)) {
            this.hitCount++;
            this.updateLRU(key);

            const entry = this.cache.get(key)!;
            entry.hitCount++;
            entry.lastAccess = Date.now();

            return entry.graph;
        }

        // Cache miss - build new graph
        this.missCount++;
        const startTime = performance.now();

        const graph = builder ? builder() : buildVisibilityGraph(
            spatialIndex || obstacles,
            { useCornerPoints: true, obstacleOffset: options?.obstacleOffset ?? 15 }
        );

        const buildTime = performance.now() - startTime;
        this.totalBuildTime += buildTime;

        // Create cache entry
        const entry: CacheEntry = {
            graph,
            obstacleHash: key,
            timestamp: Date.now(),
            hitCount: 0,
            lastAccess: Date.now(),
            buildTime
        };

        // Add to cache with eviction
        this.addToCache(key, entry);

        return graph;
    }

    /**
     * Check if a graph is cached
     * 
     * @param obstacles Obstacle list
     * @returns True if cached
     */
    has(obstacles: Rectangle[], options?: { obstacleOffset?: number }): boolean {
        const key = this.generateCacheKey(obstacles) + `|off:${options?.obstacleOffset ?? 15}`;
        return this.cache.has(key);
    }

    /**
     * Get cache entry (without updating LRU)
     * 
     * @param obstacles Obstacle list
     * @returns Cache entry or undefined
     */
    peek(obstacles: Rectangle[], options?: { obstacleOffset?: number }): CacheEntry | undefined {
        const key = this.generateCacheKey(obstacles) + `|off:${options?.obstacleOffset ?? 15}`;
        return this.cache.get(key);
    }

    /**
     * Invalidate cache entries matching a predicate
     * 
     * @param predicate Filter function
     */
    invalidate(predicate: (entry: CacheEntry) => boolean): number {
        let invalidatedCount = 0;

        // [J-2] Iterate cache directly; no need to rebuild lruList separately
        for (const [key, entry] of this.cache) {
            if (predicate(entry)) {
                this.cache.delete(key);
                invalidatedCount++;
            }
        }

        return invalidatedCount;
    }

    /**
     * Clear entire cache
     */
    clear(): void {
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
        this.totalBuildTime = 0;
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const total = this.hitCount + this.missCount;
        const hitRate = total > 0 ? this.hitCount / total : 0;

        return {
            size: this.cache.size,
            maxSize: this.config.maxSize,
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate,
            totalBuildTime: this.totalBuildTime,
            avgBuildTime: this.missCount > 0 ? this.totalBuildTime / this.missCount : 0,
            memoryEstimate: this.estimateMemoryUsage()
        };
    }

    /**
     * Prebuild graphs for predicted obstacle configurations (async)
     * 
     * @param obstacleConfigs Array of obstacle configurations
     */
    async prebuildGraphs(obstacleConfigs: Rectangle[][]): Promise<void> {
        if (!this.config.enablePrebuild) {
            console.warn('[VGCache] Prebuild disabled in config');
            return;
        }

        for (const obstacles of obstacleConfigs) {
            // Check if already cached
            if (!this.has(obstacles)) {
                // Build in background
                await new Promise(resolve => setTimeout(resolve, 0));
                this.getOrBuild(obstacles);
            }
        }
    }

    /**
     * Set max cache size (may trigger eviction)
     */
    setMaxSize(maxSize: number): void {
        this.config.maxSize = maxSize;

        // Evict if over limit
        while (this.cache.size > maxSize) {
            this.evictLRU();
        }
    }

    // ==================== Private Methods ====================

    /**
     * Generate cache key from obstacle configuration
     * Uses fast hash of obstacle positions and sizes
     */
    private generateCacheKey(obstacles: Rectangle[]): string {
        // Sort obstacles by position for consistent keys
        const sorted = obstacles
            .map(r => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`)
            .sort();

        // Simple hash (FNV-1a variant)
        return this.hashString(sorted.join('|'));
    }

    /**
     * Fast string hash (djb2)
     * 
     * [FIX T-3] 替换 FNV-1a：FNV 的 hash << 24 在 JS 中会进行 sign-extension，
     * 导致中间计算溢出，高碰撞率场景下（如同坐标节点）可能返回错误可见性图。
     * djb2 仅用乘法和 XOR，在 JS 32-bit 整数范围内行为可预测。
     */
    private hashString(str: string): string {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            // hash * 33 ^ charCode (djb2)
            hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        }
        return (hash >>> 0).toString(36); // 强制无符号，转 base36
    }


    /**
     * Add entry to cache with eviction
     */
    private addToCache(key: string, entry: CacheEntry): void {
        // Evict if at capacity
        if (this.cache.size >= this.config.maxSize && this.config.autoEvict) {
            this.evictLRU();
        }

        // [J-2] Set inserts at the end (most recently used position in Map order)
        this.cache.set(key, entry);
    }

    /**
     * [J-2] Update LRU position — O(1) via delete+set.
     * JS Map.set() for an existing key does NOT change insertion order;
     * we must delete first, then re-set to move the key to the "newest" position.
     */
    private updateLRU(key: string): void {
        const entry = this.cache.get(key);
        if (entry) {
            this.cache.delete(key);
            this.cache.set(key, entry);
        }
    }

    /**
     * [J-2] Evict least recently used entry — O(1) via Map.keys().next().
     * The first key in Map iteration order is the oldest (LRU) entry.
     */
    private evictLRU(): void {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Estimate memory usage (rough approximation)
     */
    private estimateMemoryUsage(): number {
        let totalSize = 0;

        this.cache.forEach(entry => {
            const graph = entry.graph;

            // Vertices: ~16 bytes per point (x, y as doubles)
            totalSize += graph.vertices.length * 16;

            // Edges: Map overhead + array storage
            totalSize += graph.edges.size * 100;

            // Edge costs: Map overhead
            totalSize += graph.edgeCosts.size * 50;

            // Entry metadata
            totalSize += 200;
        });

        return totalSize;
    }
}

/**
 * Global singleton instance (optional)
 */
let globalCache: VisibilityGraphCache | null = null;

export function getVGCache(): VisibilityGraphCache {
    if (!globalCache) {
        globalCache = new VisibilityGraphCache();
    }
    return globalCache;
}

export function resetVGCache(): void {
    globalCache = null;
}
