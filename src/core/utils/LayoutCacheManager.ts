/**
 * 布局缓存管理器 (性能优化)
 * 
 * 目的：
 * - 缓存布局计算结果，避免相同输入下重复计算
 * - 支持 LRU 淘汰策略和 TTL 过期
 * - 提供可配置的缓存大小限制
 * 
 * 使用方式：
 * ```typescript
 * const cache = LayoutCacheManager.getInstance();
 * const key = cache.createKey(nodes, edges, options);
 * let result = cache.get(key);
 * if (!result) {
 *   result = expensiveLayoutCalculation(nodes, edges, options);
 *   cache.set(key, result);
 * }
 * ```
 */

import type { Node, Edge } from '@xyflow/react';
import type { Position } from '../types/common';
import { logLayoutCacheKeyCreationFailure } from './layoutCacheLogging';

// ==================== 类型定义 ====================

interface LayoutCacheEntry<T = LayoutCacheResult> {
    result: T;
    timestamp: number;
    accessCount: number;
    lastAccess: number;
}

interface LayoutCacheResult {
    positions: Position[];
    nodeRanks?: Map<string, number>;
    metadata?: Record<string, any>;
}

interface CacheConfig {
    /** 最大缓存条目数 */
    maxEntries: number;
    /** 缓存 TTL (毫秒) */
    ttlMs: number;
    /** 是否启用缓存 */
    enabled: boolean;
}

interface CacheStats {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: CacheConfig = {
    maxEntries: 50,
    ttlMs: 5 * 60 * 1000, // 5 分钟
    enabled: true,
};

// ==================== 布局缓存管理器 ====================

export class LayoutCacheManager {
    private static instance: LayoutCacheManager;

    private cache = new Map<string, LayoutCacheEntry>();
    private config: CacheConfig;
    private stats = { hits: 0, misses: 0 };

    private constructor(config?: Partial<CacheConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 获取单例实例
     */
    public static getInstance(config?: Partial<CacheConfig>): LayoutCacheManager {
        if (!LayoutCacheManager.instance) {
            LayoutCacheManager.instance = new LayoutCacheManager(config);
        }
        return LayoutCacheManager.instance;
    }

    /**
     * 创建缓存键
     * 基于节点 ID、位置、尺寸和边的结构生成唯一键
     */
    public createKey(
        nodes: Node[],
        edges: Edge[],
        options?: Record<string, any>
    ): string {
        try {
            // 节点签名：ID + 尺寸（位置变化时通常需要重新布局，但某些场景只需缓存结构）
            const nodesSig = nodes
                .map(n => {
                    const w = (n as any).measured?.width ?? (n.style as any)?.width ?? 200;
                    const h = (n as any).measured?.height ?? (n.style as any)?.height ?? 100;
                    return `${n.id}:${w}:${h}`;
                })
                .sort()
                .join('|');

            // 边签名
            const edgesSig = edges
                .map(e => `${e.source}->${e.target}`)
                .sort()
                .join('|');

            // 选项签名
            const optionsSig = options ? JSON.stringify(options) : '';

            // 组合生成键
            return `layout:${this.simpleHash(nodesSig)}:${this.simpleHash(edgesSig)}:${this.simpleHash(optionsSig)}`;
        } catch (error) {
            logLayoutCacheKeyCreationFailure('createKey', error);
            return `layout:${Date.now()}:${Math.random()}`;
        }
    }

    /**
     * 创建仅基于结构的缓存键（忽略位置）
     * 适用于层次布局等不依赖初始位置的算法
     */
    public createStructureKey(
        nodes: Node[],
        edges: Edge[],
        layoutType: string,
        options?: Record<string, any>
    ): string {
        try {
            const nodeIds = nodes.map(n => n.id).sort().join(',');
            const edgeSig = edges.map(e => `${e.source}:${e.target}`).sort().join(',');
            const optsSig = options ? JSON.stringify(options) : '';

            return `struct:${layoutType}:${this.simpleHash(nodeIds)}:${this.simpleHash(edgeSig)}:${this.simpleHash(optsSig)}`;
        } catch (error) {
            logLayoutCacheKeyCreationFailure('createStructureKey', error);
            return `struct:${layoutType}:${Date.now()}`;
        }
    }

    /**
     * 获取缓存结果
     */
    public get<T = LayoutCacheResult>(key: string): T | null {
        if (!this.config.enabled) return null;

        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // 检查 TTL
        if (Date.now() - entry.timestamp > this.config.ttlMs) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        // 更新访问信息
        entry.accessCount++;
        entry.lastAccess = Date.now();
        this.stats.hits++;

        return entry.result as T;
    }

    /**
     * 设置缓存
     */
    public set<T = LayoutCacheResult>(key: string, result: T): void {
        if (!this.config.enabled) return;

        // LRU 淘汰
        if (this.cache.size >= this.config.maxEntries) {
            this.evictLRU();
        }

        this.cache.set(key, {
            result: result as any,
            timestamp: Date.now(),
            accessCount: 1,
            lastAccess: Date.now(),
        });
    }

    /**
     * 检查缓存是否存在且有效
     */
    public has(key: string): boolean {
        if (!this.config.enabled) return false;

        const entry = this.cache.get(key);
        if (!entry) return false;

        if (Date.now() - entry.timestamp > this.config.ttlMs) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * 清除所有缓存
     */
    public clear(): void {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0 };
    }

    /**
     * 清除过期缓存
     */
    public cleanExpired(): number {
        const now = Date.now();
        let removed = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.config.ttlMs) {
                this.cache.delete(key);
                removed++;
            }
        }

        return removed;
    }

    /**
     * 获取缓存统计
     */
    public getStats(): CacheStats {
        const total = this.stats.hits + this.stats.misses;
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            size: this.cache.size,
            hitRate: total > 0 ? this.stats.hits / total : 0,
        };
    }

    /**
     * 更新配置
     */
    public updateConfig(config: Partial<CacheConfig>): void {
        this.config = { ...this.config, ...config };

        // 如果禁用缓存，清空现有缓存
        if (!this.config.enabled) {
            this.clear();
        }

        // 如果减少 maxEntries，执行淘汰
        while (this.cache.size > this.config.maxEntries) {
            this.evictLRU();
        }
    }

    // ==================== 私有方法 ====================

    /**
     * LRU 淘汰策略
     */
    private evictLRU(): void {
        let oldest: { key: string; lastAccess: number } | null = null;

        for (const [key, entry] of this.cache.entries()) {
            if (!oldest || entry.lastAccess < oldest.lastAccess) {
                oldest = { key, lastAccess: entry.lastAccess };
            }
        }

        if (oldest) {
            this.cache.delete(oldest.key);
        }
    }

    /**
     * 简单哈希函数
     */
    private simpleHash(str: string): string {
        if (!str) return '0';

        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }

        return Math.abs(hash).toString(36);
    }
}

// ==================== 导出便捷函数 ====================

/**
 * 获取布局缓存管理器实例
 */
export const getLayoutCache = (): LayoutCacheManager => {
    return LayoutCacheManager.getInstance();
};

/**
 * 带缓存的布局计算包装器
 * 
 * @example
 * const result = cachedLayout(
 *   nodes,
 *   edges,
 *   options,
 *   'hierarchical',
 *   () => calculateHierarchicalLayout(nodes, edges, options)
 * );
 */
export function cachedLayout<T>(
    nodes: Node[],
    edges: Edge[],
    options: Record<string, any> | undefined,
    layoutType: string,
    compute: () => T
): T {
    const cache = getLayoutCache();
    const key = cache.createStructureKey(nodes, edges, layoutType, options);

    const cached = cache.get<T>(key);
    if (cached) {
        return cached;
    }

    const result = compute();
    cache.set(key, result);

    return result;
}

export default LayoutCacheManager;
