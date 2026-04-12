// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { RoutingPerformanceMonitor } from '@/core';

export const PerformanceTab: React.FC = () => {
    const [report, setReport] = useState(RoutingPerformanceMonitor.getInstance().getReport());

    useEffect(() => {
        const timer = setInterval(() => {
            setReport(RoutingPerformanceMonitor.getInstance().getReport());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const { totalRequests, cacheHits, avgRoutingTime, history } = report;
    const hitRate = totalRequests > 0 ? ((cacheHits / totalRequests) * 100).toFixed(1) : '0.0';

    return (
        <div style={{ padding: '10px', fontSize: '12px', color: '#ccc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <MetricBox label="Total Requests" value={totalRequests} />
                <MetricBox label="Cache Hit Rate" value={`${hitRate}%`} color={Number(hitRate) > 50 ? '#4caf50' : '#ff9800'} />
                <MetricBox label="Avg Time" value={`${avgRoutingTime.toFixed(2)}ms`} />
                <MetricBox label="Last Route" value={`${history[0]?.routingTime.toFixed(2) ?? '-'}ms`} />
            </div>

            <h4 style={{ margin: '0 0 8px 0', borderBottom: '1px solid #444' }}>Recent Activity</h4>
            <div style={{ height: '200px', overflowY: 'auto', background: '#111', borderRadius: '4px', padding: '4px' }}>
                {history.slice(0, 20).map((log, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', padding: '2px 0', borderBottom: '1px solid #222' }}>
                        <span style={{ color: log.cacheHit ? '#4caf50' : '#ff9800' }}>
                            {log.cacheHit ? 'CACHE' : 'WORKER'}
                        </span>
                        <span style={{ marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }} title={log.edgeId}>
                            {log.edgeId.slice(0, 8)}...
                        </span>
                        <span>{log.routingTime.toFixed(1)}ms</span>
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
