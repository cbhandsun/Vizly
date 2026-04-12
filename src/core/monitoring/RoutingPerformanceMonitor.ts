
interface PerformanceMetrics {
    routingTime: number;
    cacheHit: boolean;
    workerTime?: number;
    edgeId: string;
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
            this.metrics.shift(); // Keep history size manageable
        }

        // Real-time anomaly detection log
        // if (metric.routingTime > 100) {
        //     console.warn(`[Slow Route] Edge ${metric.edgeId} took ${metric.routingTime.toFixed(2)}ms (CacheHit: ${metric.cacheHit})`);
        // }
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
                history: []
            };
        }

        const hits = this.metrics.filter(m => m.cacheHit).length;
        const times = this.metrics.map(m => m.routingTime).sort((a, b) => a - b);
        const sumTime = times.reduce((a, b) => a + b, 0);

        // P95 Calculation
        const p95Index = Math.floor(times.length * 0.95);
        const p95Time = times[p95Index];

        // Slowest Edges (Top 5)
        const slowest = [...this.metrics]
            .sort((a, b) => b.routingTime - a.routingTime)
            .slice(0, 5)
            .map(m => ({ edgeId: m.edgeId, time: m.routingTime }));

        // Return latest history (reversed)
        const history = [...this.metrics].reverse();

        return {
            totalRequests: total,
            cacheHits: hits,
            cacheHitRate: hits / total,
            avgRoutingTime: sumTime / total,
            p95RoutingTime: p95Time,
            slowestEdges: slowest,
            history
        };
    }

    public clear() {
        this.metrics = [];
    }
}
