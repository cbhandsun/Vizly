
interface PerformanceMetrics {
    routingTime: number;
    cacheHit: boolean;
    workerTime?: number;
    edgeId: string;
    /** 路由策略名称，例如 'Trunk Direct', 'A* Grid', 'VG', '1-Bend' */
    strategy?: string;
    timestamp: number;
}

interface PerformanceReport {
    totalRequests: number;
    cacheHits: number;
    cacheHitRate: number;
    avgRoutingTime: number;
    p95RoutingTime: number;
    slowestEdges: { edgeId: string; time: number }[];
    history: PerformanceMetrics[];
    /** 各策略命中次数统计，供分布图使用 */
    strategyStats: Record<string, number>;
}

export class RoutingPerformanceMonitor {
    private static instance: RoutingPerformanceMonitor;
    private metrics: PerformanceMetrics[] = [];
    private readonly MAX_HISTORY = 1000;

    private constructor() { }

    public static getInstance(): RoutingPerformanceMonitor {
        if (!RoutingPerformanceMonitor.instance) {
            RoutingPerformanceMonitor.instance = new RoutingPerformanceMonitor();
        }
        return RoutingPerformanceMonitor.instance;
    }

    public track(metric: Omit<PerformanceMetrics, 'timestamp'>) {
        this.metrics.push({
            ...metric,
            timestamp: Date.now()
        });

        if (this.metrics.length > this.MAX_HISTORY) {
            this.metrics.shift();
        }
    }

    public getReport(): PerformanceReport {
        const total = this.metrics.length;
        if (total === 0) {
            return {
                totalRequests: 0,
                cacheHits: 0,
                cacheHitRate: 0,
                avgRoutingTime: 0,
                p95RoutingTime: 0,
                slowestEdges: [],
                history: [],
                strategyStats: {}
            };
        }

        const hits = this.metrics.filter(m => m.cacheHit).length;
        const times = this.metrics.map(m => m.routingTime).sort((a, b) => a - b);
        const sumTime = times.reduce((a, b) => a + b, 0);

        const p95Index = Math.floor(times.length * 0.95);
        const p95Time = times[p95Index];

        const slowest = [...this.metrics]
            .sort((a, b) => b.routingTime - a.routingTime)
            .slice(0, 5)
            .map(m => ({ edgeId: m.edgeId, time: m.routingTime }));

        const history = [...this.metrics].reverse();

        // 统计各策略命中次数（仅统计非缓存命中的真实路由）
        const strategyStats: Record<string, number> = {};
        for (const m of this.metrics) {
            if (m.strategy) {
                const key = normalizeStrategyName(m.strategy);
                strategyStats[key] = (strategyStats[key] ?? 0) + 1;
            }
        }

        return {
            totalRequests: total,
            cacheHits: hits,
            cacheHitRate: hits / total,
            avgRoutingTime: sumTime / total,
            p95RoutingTime: p95Time,
            slowestEdges: slowest,
            history,
            strategyStats
        };
    }

    public clear() {
        this.metrics = [];
    }
}

/** 将策略名称规范化为短标签，方便图表展示 */
function normalizeStrategyName(raw: string): string {
    if (raw.includes('Trunk Direct') || raw.includes('trunk')) return 'Trunk Direct';
    if (raw.includes('A*') || raw.includes('Grid')) return 'A* Grid';
    if (raw.includes('VG') || raw.includes('Visibility')) return 'VG';
    if (raw.includes('1-Bend') || raw.includes('OneBend')) return '1-Bend';
    if (raw.includes('Straight') || raw.includes('straight')) return 'Straight';
    return raw.slice(0, 12);
}

