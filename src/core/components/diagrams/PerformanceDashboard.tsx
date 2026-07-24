import React, { useEffect, useState } from 'react';
import './PerformanceDashboard.css';

interface PerformanceStats {
    fps: number;
    avgRenderTime: number;
    nodeCount: number;
    edgeCount: number;
    memoryUsage?: number;
}

/**
 * 性能仪表盘组件
 * 
 * @description
 * 显示实时性能指标,仅在开发模式或通过 URL 参数 `?perf=1` 启用
 * 
 * @example
 * ```tsx
 * // 在 FlowchartDesigner 中使用
 * {showPerformanceDashboard && <PerformanceDashboard nodeCount={nodes.length} edgeCount={edges.length} />}
 * ```
 */
export const PerformanceDashboard: React.FC<{ nodeCount: number; edgeCount: number }> = ({
    nodeCount,
    edgeCount,
}) => {
    const [stats, setStats] = useState<PerformanceStats>({
        fps: 60,
        avgRenderTime: 0,
        nodeCount,
        edgeCount,
    });

    useEffect(() => {
        let frameCount = 0;
        let lastTime = performance.now();
        let animationFrameId: number;

        const updateStats = (currentTime: number) => {
            frameCount++;
            const elapsed = currentTime - lastTime;
            
            // Update stats twice per second
            if (elapsed >= 500) {
                const fps = Math.round((frameCount * 1000) / elapsed);
                const avgFrameTime = elapsed / frameCount;
                
                // Memory Usage (if supported by Chrome/Edge)
                const performanceMemory = (performance as Performance & {
                    memory?: { usedJSHeapSize?: number };
                }).memory;
                const memoryUsage = performanceMemory?.usedJSHeapSize
                    ? Math.round(performanceMemory.usedJSHeapSize / 1024 / 1024)
                    : undefined;

                setStats({
                    fps,
                    avgRenderTime: Math.round(avgFrameTime * 10) / 10,
                    nodeCount,
                    edgeCount,
                    memoryUsage,
                });

                frameCount = 0;
                lastTime = currentTime;
            }
            
            animationFrameId = requestAnimationFrame(updateStats);
        };

        animationFrameId = requestAnimationFrame(updateStats);

        return () => cancelAnimationFrame(animationFrameId);
    }, [nodeCount, edgeCount]);

    // 根据FPS确定颜色
    const getFpsColor = (fps: number) => {
        if (fps >= 55) return '#10b981'; // 绿色
        if (fps >= 45) return '#f59e0b'; // 黄色
        return '#ef4444'; // 红色
    };

    // 根据渲染时间确定颜色
    const getRenderTimeColor = (time: number) => {
        if (time <= 16.67) return '#10b981'; // 60fps
        if (time <= 33.33) return '#f59e0b'; // 30fps
        return '#ef4444'; // <30fps
    };

    return (
        <div className="performance-dashboard" style={{ position: 'fixed', top: 60, right: 20, zIndex: 9999 }}>
            <div className="perf-title">⚡ Performance</div>
            <div className="perf-grid">
                <div className="perf-metric">
                    <div className="perf-label">FPS</div>
                    <div className="perf-value" style={{ color: getFpsColor(stats.fps) }}>
                        {stats.fps}
                    </div>
                </div>

                <div className="perf-metric">
                    <div className="perf-label">Render</div>
                    <div className="perf-value" style={{ color: getRenderTimeColor(stats.avgRenderTime) }}>
                        {stats.avgRenderTime}ms
                    </div>
                </div>

                <div className="perf-metric">
                    <div className="perf-label">Nodes</div>
                    <div className="perf-value">{stats.nodeCount}</div>
                </div>

                <div className="perf-metric">
                    <div className="perf-label">Edges</div>
                    <div className="perf-value">{stats.edgeCount}</div>
                </div>

                {stats.memoryUsage && (
                    <div className="perf-metric">
                        <div className="perf-label">Memory</div>
                        <div className="perf-value">{stats.memoryUsage}MB</div>
                    </div>
                )}
            </div>
        </div>
    );
};
