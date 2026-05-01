// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { RoutingPerformanceMonitor } from '@/core';

// 各策略对应的颜色
const STRATEGY_COLORS: Record<string, string> = {
    'Trunk Direct': '#52c41a',
    'A* Grid':      '#1890ff',
    'VG':           '#722ed1',
    '1-Bend':       '#13c2c2',
    'Straight':     '#faad14',
};
const DEFAULT_COLOR = '#888';

function getStrategyColor(name: string): string {
    return STRATEGY_COLORS[name] ?? DEFAULT_COLOR;
}

export const PerformanceTab: React.FC = () => {
    const [report, setReport] = useState(RoutingPerformanceMonitor.getInstance().getReport());

    useEffect(() => {
        const timer = setInterval(() => {
            setReport(RoutingPerformanceMonitor.getInstance().getReport());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const { totalRequests, cacheHits, avgRoutingTime, p95RoutingTime, history, strategyStats, slowestEdges } = report;
    const hitRate = totalRequests > 0 ? ((cacheHits / totalRequests) * 100).toFixed(1) : '0.0';

    // 策略分布图数据
    const strategyEntries = Object.entries(strategyStats ?? {}).sort((a, b) => b[1] - a[1]);
    const maxStrategyCount = Math.max(1, ...strategyEntries.map(([, v]) => v));
    const totalStrategyCount = strategyEntries.reduce((s, [, v]) => s + v, 0);

    return (
        <div style={{ padding: '10px', fontSize: '12px', color: '#ccc', overflowY: 'auto', maxHeight: '100%' }}>
            {/* 核心指标 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <MetricBox label="Total Requests" value={totalRequests} />
                <MetricBox label="Cache Hit Rate" value={`${hitRate}%`} color={Number(hitRate) > 50 ? '#4caf50' : '#ff9800'} />
                <MetricBox label="Avg Time" value={`${avgRoutingTime.toFixed(2)}ms`} />
                <MetricBox label="P95 Time" value={`${(p95RoutingTime ?? 0).toFixed(2)}ms`}
                    color={(p95RoutingTime ?? 0) > 50 ? '#ff9800' : '#4caf50'} />
            </div>

            {/* 策略分布图 */}
            {strategyEntries.length > 0 && (
                <>
                    <h4 style={{ margin: '0 0 8px 0', borderBottom: '1px solid #444', paddingBottom: 4, color: '#eee' }}>
                        Strategy Distribution
                    </h4>
                    <div style={{ marginBottom: 12 }}>
                        {strategyEntries.map(([name, count]) => {
                            const pct = (count / maxStrategyCount) * 100;
                            const share = totalStrategyCount > 0 ? ((count / totalStrategyCount) * 100).toFixed(1) : '0';
                            const color = getStrategyColor(name);
                            return (
                                <div key={name} style={{ marginBottom: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <span style={{ color, fontWeight: 600, minWidth: 90 }}>{name}</span>
                                        <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 11 }}>
                                            {count} ({share}%)
                                        </span>
                                    </div>
                                    <div style={{ height: 8, background: '#2a2a2a', borderRadius: 4, overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${pct}%`,
                                            height: '100%',
                                            background: color,
                                            borderRadius: 4,
                                            transition: 'width 0.4s ease',
                                            boxShadow: `0 0 6px ${color}55`
                                        }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* 最慢边 Top 5 */}
            {slowestEdges && slowestEdges.length > 0 && (
                <>
                    <h4 style={{ margin: '0 0 6px 0', borderBottom: '1px solid #444', paddingBottom: 4, color: '#eee' }}>
                        Slowest Edges
                    </h4>
                    <div style={{ marginBottom: 12 }}>
                        {slowestEdges.map((e, i) => (
                            <div key={e.edgeId} style={{
                                display: 'flex', justifyContent: 'space-between',
                                fontFamily: 'monospace', padding: '2px 0', fontSize: 11,
                                color: e.time > 50 ? '#ff9800' : '#aaa'
                            }}>
                                <span style={{ color: '#666', marginRight: 6 }}>#{i + 1}</span>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    title={e.edgeId}>
                                    {e.edgeId.slice(0, 10)}…
                                </span>
                                <span style={{ fontWeight: 600 }}>{e.time.toFixed(1)}ms</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* 最近活动 */}
            <h4 style={{ margin: '0 0 8px 0', borderBottom: '1px solid #444', paddingBottom: 4, color: '#eee' }}>
                Recent Activity
            </h4>
            <div style={{ height: '160px', overflowY: 'auto', background: '#111', borderRadius: '4px', padding: '4px' }}>
                {history.slice(0, 30).map((log, i) => (
                    <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontFamily: 'monospace', padding: '2px 0',
                        borderBottom: '1px solid #1a1a1a', fontSize: 11
                    }}>
                        <span style={{ color: log.cacheHit ? '#4caf50' : '#ff9800', minWidth: 44 }}>
                            {log.cacheHit ? 'CACHE' : 'WORK'}
                        </span>
                        {log.strategy && (
                            <span style={{
                                color: getStrategyColor(log.strategy),
                                minWidth: 72, fontSize: 10
                            }}>
                                {log.strategy.slice(0, 10)}
                            </span>
                        )}
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80, color: '#666' }}
                            title={log.edgeId}>
                            {log.edgeId.slice(0, 8)}…
                        </span>
                        <span style={{ color: log.routingTime > 30 ? '#ff9800' : '#aaa' }}>
                            {log.routingTime.toFixed(1)}ms
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const MetricBox = ({ label, value, color }: { label: string, value: string | number, color?: string }) => (
    <div style={{ background: '#222', padding: '8px', borderRadius: '4px' }}>
        <div style={{ color: '#888', fontSize: '10px' }}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: color || '#eee' }}>{value}</div>
    </div>
);
