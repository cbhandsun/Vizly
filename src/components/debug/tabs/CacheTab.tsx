import React, { useEffect, useState } from 'react';
import { EdgeRoutingCoordinator } from '@/core/services/EdgeRoutingCoordinator';

export const CacheTab: React.FC = () => {
    const [stats, setStats] = useState({ size: 0, version: 0 });

    useEffect(() => {
        const timer = setInterval(() => {
            const coordinator = EdgeRoutingCoordinator.getInstance();
            const cacheSize = coordinator.getOptimizationStats().cache.size;
            const graphVersion = coordinator.getGraphVersion();

            setStats({ size: cacheSize, version: graphVersion });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div style={{ padding: '10px', fontSize: '12px', color: '#ccc' }}>
            <div style={{ marginBottom: '12px' }}>
                <h4 style={{ margin: '0 0 8px 0' }}>Cache Status</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>Entries: <span style={{ color: '#4caf50' }}>{stats.size}</span></div>
                    <div>Graph Version: <span style={{ color: '#2196f3' }}>{stats.version}</span></div>
                </div>
            </div>

            <div style={{ marginTop: '10px' }}>
                <button
                    onClick={() => EdgeRoutingCoordinator.getInstance().notifyGraphChange()}
                    style={{
                        width: '100%',
                        padding: '6px',
                        background: '#d32f2f',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Clear Cache & Force Re-route
                </button>
            </div>
        </div>
    );
};
